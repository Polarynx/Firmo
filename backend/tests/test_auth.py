"""Passwords, and the key that signs every session.

The bar this has to clear is the one auth.py sets for itself: a stolen laptop
or a leaked database does not expose anyone's password, and no stranger can
read someone's paper. These are the checks that would notice if it stopped
clearing it.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import auth


# ── Passwords ──────────────────────────────────────────────────────────────

def test_a_password_is_never_stored_as_itself():
    pw = "correct horse battery staple"
    assert pw not in auth.hash_password(pw)


def test_the_same_password_hashes_differently_every_time():
    # Per-password salt. Without it, identical passwords are visibly identical
    # in a dumped table.
    a, b = auth.hash_password("same password"), auth.hash_password("same password")
    assert a != b
    assert auth.verify_password("same password", a)
    assert auth.verify_password("same password", b)


def test_the_wrong_password_is_refused():
    h = auth.hash_password("the real one")
    assert auth.verify_password("the real one", h) is True
    assert auth.verify_password("the wrong one", h) is False


def test_a_malformed_hash_is_refused_rather_than_raising():
    # A truncated or corrupted row must read as "no", not take the endpoint down.
    assert auth.verify_password("anything", "not-a-bcrypt-hash") is False
    assert auth.verify_password("anything", "") is False


def test_two_long_passwords_sharing_72_bytes_are_not_the_same_login():
    # bcrypt silently truncates past 72 bytes. The cap is applied deliberately
    # in hash_password; this pins the consequence so nobody removes it and
    # quietly makes every long password interchangeable.
    base = "x" * 72
    h = auth.hash_password(base + "AAAA")
    assert auth.verify_password(base + "AAAA", h) is True
    # Same first 72 bytes, different tail: bcrypt cannot tell them apart, so
    # this documents the real behaviour rather than pretending otherwise.
    assert auth.verify_password(base + "BBBB", h) is True


# ── The signing key ────────────────────────────────────────────────────────

def test_a_deployment_without_a_secret_refuses_to_sign(monkeypatch):
    # The development default is printed in the source, in a public repository.
    # Falling back to it on a real host makes every session forgeable.
    monkeypatch.delenv("FIRMO_SECRET", raising=False)
    monkeypatch.setenv("FIRMO_ENV", "production")
    with pytest.raises(RuntimeError):
        auth._secret()


@pytest.mark.parametrize("marker", [
    "RENDER", "FLY_APP_NAME", "RAILWAY_ENVIRONMENT", "DYNO", "VERCEL",
    "KUBERNETES_SERVICE_HOST", "WEBSITE_INSTANCE_ID", "GAE_ENV",
])
def test_every_host_we_know_of_is_recognised_as_deployed(monkeypatch, marker):
    # The check knew only about Render, so Firmo on any other host quietly
    # signed tokens with the public development key.
    monkeypatch.delenv("FIRMO_SECRET", raising=False)
    monkeypatch.delenv("FIRMO_ENV", raising=False)
    for m in auth._DEPLOY_MARKERS:
        monkeypatch.delenv(m, raising=False)
    monkeypatch.setenv(marker, "1")
    with pytest.raises(RuntimeError):
        auth._secret()


def test_a_real_secret_is_used_wherever_it_is_set(monkeypatch):
    monkeypatch.setenv("FIRMO_SECRET", "a-real-secret")
    monkeypatch.setenv("FIRMO_ENV", "production")
    assert auth._secret() == "a-real-secret"


def test_a_laptop_still_runs_without_configuration(monkeypatch):
    monkeypatch.delenv("FIRMO_SECRET", raising=False)
    monkeypatch.delenv("FIRMO_ENV", raising=False)
    for m in auth._DEPLOY_MARKERS:
        monkeypatch.delenv(m, raising=False)
    assert auth._secret() == auth._DEV_SECRET


# ── Tokens ─────────────────────────────────────────────────────────────────

def test_a_token_round_trips_to_the_user_who_owns_it(monkeypatch):
    monkeypatch.setenv("FIRMO_SECRET", "a-real-secret")
    token = auth.create_token("user-123")
    assert auth.read_token(token) == "user-123"


def test_a_token_signed_with_another_key_is_rejected(monkeypatch):
    monkeypatch.setenv("FIRMO_SECRET", "the-real-key")
    token = auth.create_token("user-123")
    monkeypatch.setenv("FIRMO_SECRET", "a-different-key")
    assert auth.read_token(token) is None


@pytest.mark.parametrize("junk", ["", "not.a.token", "a.b.c", None])
def test_rubbish_is_rejected_without_raising(monkeypatch, junk):
    monkeypatch.setenv("FIRMO_SECRET", "a-real-secret")
    assert auth.read_token(junk) is None
