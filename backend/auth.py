"""Accounts: hashing, tokens, and the dependency that identifies the caller.

Deliberately small. Firmo stores coursework, not payment details, so the
security bar is "a stolen laptop or a leaked database does not expose anyone's
password or let a stranger read their paper" — not a full identity provider.
Everything here is standard: bcrypt for passwords, a signed JWT for the
session, and no third-party dependency to keep alive.
"""
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from db import SessionLocal, User, get_user

ALGORITHM = "HS256"
TOKEN_DAYS = 30

# A term's worth of session, so a student is not signed out mid-essay.
_TOKEN_LIFETIME = timedelta(days=TOKEN_DAYS)

_DEV_SECRET = "firmo-dev-secret-not-for-production"

# Markers that mean "this is not somebody's laptop".
#
# The check used to know about Render and nothing else, so Firmo deployed to
# any other host would quietly fall back to the development key below - which
# is printed in this file, in the repository, in public. Every session token
# would be forgeable by anyone who can read it.
#
# Failing to notice a deployment is the expensive direction of this error, so
# the list covers the hosts somebody would plausibly reach for. It is still a
# guess about the environment, which is why FIRMO_ENV=production remains the
# explicit way to say so, and setting FIRMO_SECRET everywhere makes the whole
# question moot.
_DEPLOY_MARKERS = (
    "RENDER",                   # Render
    "FLY_APP_NAME",             # Fly.io
    "RAILWAY_ENVIRONMENT",      # Railway
    "DYNO",                     # Heroku
    "VERCEL",                   # Vercel
    "KUBERNETES_SERVICE_HOST",  # any Kubernetes cluster
    "WEBSITE_INSTANCE_ID",      # Azure App Service
    "GAE_ENV",                  # Google App Engine
    "ECS_CONTAINER_METADATA_URI",   # AWS ECS
    "AWS_LAMBDA_FUNCTION_NAME",     # AWS Lambda
)


def _looks_deployed() -> bool:
    if os.getenv("FIRMO_ENV") == "production":
        return True
    return any(os.getenv(m) for m in _DEPLOY_MARKERS)


def _secret() -> str:
    """The signing key.

    Missing in production is a real problem — every session would be forgeable
    by anyone who reads this file — so it fails loudly there rather than
    quietly accepting the development default.
    """
    secret = os.getenv("FIRMO_SECRET", "").strip()
    if secret:
        return secret
    if _looks_deployed():
        raise RuntimeError(
            "FIRMO_SECRET is not set. Set it in the host's environment: without it "
            "session tokens are signed with a public value and can be forged."
        )
    return _DEV_SECRET


# Length is the only password rule worth enforcing. Composition rules push
# people towards "Password1!" and towards reusing it somewhere else.
MIN_PASSWORD = 8
MAX_PASSWORD = 200

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match((email or "").strip()))


def hash_password(password: str) -> str:
    # bcrypt truncates silently past 72 bytes, so cap it here where the rule is
    # visible rather than letting two different long passwords become one hash.
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + _TOKEN_LIFETIME},
        _secret(),
        algorithm=ALGORITHM,
    )


def read_token(token: str) -> Optional[str]:
    """The user id inside a token, or None if it is expired, forged, or junk."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


# auto_error off: most of Firmo works signed out, so a missing header is a
# normal anonymous request rather than a 403.
_bearer = HTTPBearer(auto_error=False)


async def current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> Optional[User]:
    """Whoever is calling, or None.

    Also stamps request.state.user_id, which is what the daily allowance is
    keyed on — a signed-in student gets their own quota instead of sharing one
    with everyone else behind their campus's address.
    """
    if not creds or not creds.credentials:
        return None
    user_id = read_token(creds.credentials)
    if not user_id:
        return None
    user = await get_user(session, user_id)
    if user:
        request.state.user_id = user.id
    return user


async def require_user(user: Optional[User] = Depends(current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return user
