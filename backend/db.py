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
