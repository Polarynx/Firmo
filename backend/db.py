"""Where a student's work actually lives.

Until now every project, source, and draft sat in one browser's localStorage.
That meant clearing your history threw away your paper, a phone and a laptop
were two unrelated workspaces, and nothing could ever be shared with an adviser.
It also capped Firmo at "clever demo": no account means no continuity, and no
continuity means no reason to come back.

SQLite locally so the whole thing runs with no setup, Postgres in production
through DATABASE_URL. Both go through the same async engine, so there is one
code path rather than two that drift.
"""
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _database_url() -> str:
    """The async URL for whatever database this deployment has.

    Render and most hosts hand out `postgres://…`, which SQLAlchemy 2 no longer
    accepts, and the sync `postgresql://` driver would block the event loop.
    Both are rewritten to asyncpg rather than left to fail at first request.
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        here = os.path.dirname(os.path.abspath(__file__))
        return f"sqlite+aiosqlite:///{os.path.join(here, 'firmo.db')}"
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Some providers append a libpq-style sslmode that asyncpg rejects outright.
    return url.replace("?sslmode=require", "").replace("&sslmode=require", "")


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    # Stored lowercased. Nobody means a different account by capitalising their
    # own email, and letting both exist creates two workspaces for one person.
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Project(Base):
    """One paper.

    The id comes from the client, because projects are created offline and have
    to keep their identity when they are first pushed up.

    `data` holds the sources, the draft, and the chat as JSON rather than as
    child tables. That is a deliberate trade: the shape of a project is still
    moving, and a document write is one statement instead of a diff across
    three tables. When the process record needs to be queried per event, that
    is the point to normalise — not before.
    """

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), default="Untitled paper")
    data: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    # Drives last-write-wins. It is the client's clock when the client sends
    # one, so a device that edited offline still wins over an older push.
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    # A tombstone, not a hard delete: without it, deleting a project on the
    # laptop and syncing the phone would resurrect it.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="projects")


Index("ix_projects_user_updated", Project.user_id, Project.updated_at)


class Event(Base):
    """One thing that happened while a paper was being written.

    This is the process record: append-only, ordered, and hash-chained. Firmo
    already generates every piece of it — searches run, sources opened and
    saved, claims flagged and resolved, citations inserted, and the chat turns
    where Firmo refused to write prose — and until now threw all of it away.

    Kept as rows rather than inside `Project.data` because the whole point is
    that it can be replayed and verified independently of the document, and
    because a blob that is rewritten on every sync is the one shape an
    append-only log must not have.

    `prev_hash`/`hash` chain each row to the one before it, so a record cannot
    be quietly edited after the fact: changing any payload changes that row's
    hash and breaks every hash after it. This is not tamper-*proof* — the
    server could rewrite the whole chain — it is tamper-*evident*, which is
    what a student needs to be able to show an instructor.

    `seq` is assigned by the server on receipt, not by the client, because the
    server is the only party that can order events from two devices.
    """

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(default=0)
    # The client's clock, so an event logged offline keeps the time it happened.
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    hash: Mapped[str] = mapped_column(String(64), default="")


# The chain is read and appended in project order, always.
Index("ix_events_project_seq", Event.project_id, Event.seq, unique=True)


class Passage(Base):
    """One chunk of one paper a student has actually read into their project.

    Firmo's ranking and claim-matching have only ever seen titles and abstracts,
    which is a hard ceiling on what it can say: an abstract cannot tell you that
    the finding you are citing lives on page 7 and is hedged in the next
    sentence. This table is where the papers themselves go, so a claim can be
    matched against evidence rather than against a summary.

    Scoped to a project, not to a user or globally. Two students researching the
    same topic will both ingest the same open-access paper, and that duplication
    is worth the simplicity: a shared corpus would need eviction, per-user
    access rules, and a story for what happens when a project is deleted.

    `vec` holds the embedding as base64 float32 rather than as a JSON array of
    floats — the JSON spelling of a 1024-dimension vector is about 20KB against
    5.5KB packed, and a project with twenty papers has a few thousand of them.
    """

    __tablename__ = "passages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # DOI where there is one, else a stable hash of the title: the key a paper
    # is known by inside one project.
    source_key: Mapped[str] = mapped_column(String(200), index=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    page: Mapped[int] = mapped_column(default=0)
    idx: Mapped[int] = mapped_column(default=0)
    text: Mapped[str] = mapped_column(Text, default="")
    vec: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


Index("ix_passages_project_source", Passage.project_id, Passage.source_key)


class Share(Base):
    """A public, read-only link to one project's process record.

    The token is the capability: anyone holding it can read the record, nobody
    can write to it, and revoking sets `revoked_at` rather than deleting, so a
    link that was handed to an instructor fails closed instead of 404-ing into
    ambiguity.
    """

    __tablename__ = "shares"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), default="")
    author: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


async def init_db() -> None:
    """Create tables if they are not there yet.

    Fine for a schema this small; the moment a column has to change shape under
    live data, this gets replaced with Alembic.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.strip().lower()))
    return result.scalar_one_or_none()


async def get_user(session: AsyncSession, user_id: str) -> User | None:
    return await session.get(User, user_id)
