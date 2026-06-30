"""
pytest conftest — SQLite in-memory DB for auth tests (StaticPool keeps
a single shared connection so create_all and session both see the same DB),
plus MagicMock sessions for track endpoints that use PostGIS.

Run with:
    cd backend && pytest tests/ -v
"""
import os

# Must be set before any app imports so pydantic-settings reads them.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-do-not-use-in-prod")
os.environ.setdefault("JWT_EXPIRES_DAYS", "30")
os.environ.setdefault("RESEND_API_KEY", "re_test")
os.environ.setdefault("ORS_API_KEY", "ors_test")
os.environ.setdefault("MAX_FILE_SIZE_MB", "20")

import secrets
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Patch Base.metadata.create_all so main.py's module-level call does not try
# to create PostGIS tables against a real (or missing) PostgreSQL engine.
from app.core.database import Base, get_db
from app.models.password_reset import PasswordReset
from app.models.user import User

with patch.object(Base.metadata, "create_all"):
    from app.main import app

# ── SQLite in-memory engine (StaticPool = single shared connection) ────────────
#
# Without StaticPool, sqlite:///:memory: gives every new connection its own
# empty database, so tables created by create_all are invisible to the session.
# StaticPool forces all connections through the same handle.

_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Create only User + PasswordReset tables — both are plain SQL, no PostGIS.
Base.metadata.create_all(bind=_engine, tables=[User.__table__, PasswordReset.__table__])

_TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


# ── Core fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture()
def db():
    """Fresh SQLite session; rolls back after each test to keep tests isolated."""
    session = _TestingSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture()
def client(db):
    """TestClient wired to the SQLite DB (works for auth endpoints)."""

    def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def registered_user(client):
    """Register a fresh user, return (email, password, token) tuple."""
    email = f"user_{secrets.token_hex(4)}@example.com"
    password = "TestPass123"
    resp = client.post("/api/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    token = resp.json()["access_token"]
    return email, password, token


@pytest.fixture()
def auth_headers(registered_user):
    """Authorization header dict for authenticated requests."""
    _, _, token = registered_user
    return {"Authorization": f"Bearer {token}"}


# ── Mock DB session for track / security tests ────────────────────────────────

@pytest.fixture()
def mock_db():
    """MagicMock SQLAlchemy session — avoids PostGIS for track tests."""
    return MagicMock()
