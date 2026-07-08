"""Tests for POST /api/auth/* endpoints using SQLite in-memory DB."""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reg(client, email=None, password="Password1"):
    email = email or f"u_{secrets.token_hex(4)}@test.com"
    return client.post("/api/auth/register", json={"email": email, "password": password})


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

class TestRegister:
    def test_success_returns_token(self, client):
        r = _reg(client)
        assert r.status_code == 201
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_duplicate_email_is_409(self, client):
        email = f"dup_{secrets.token_hex(4)}@test.com"
        _reg(client, email=email)
        r = _reg(client, email=email)
        assert r.status_code == 409

    def test_short_password_is_422(self, client):
        r = _reg(client, password="short")
        assert r.status_code == 422

    def test_invalid_email_is_422(self, client):
        r = client.post("/api/auth/register", json={"email": "not-an-email", "password": "Password1"})
        assert r.status_code == 422

    def test_empty_body_is_422(self, client):
        r = client.post("/api/auth/register", json={})
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

class TestLogin:
    def test_success_returns_token(self, client, registered_user):
        email, password, _ = registered_user
        r = client.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_wrong_password_is_401(self, client, registered_user):
        email, _, _ = registered_user
        r = client.post("/api/auth/login", json={"email": email, "password": "WrongPass999"})
        assert r.status_code == 401

    def test_unknown_email_is_401(self, client):
        r = client.post("/api/auth/login", json={"email": "nobody@test.com", "password": "Password1"})
        assert r.status_code == 401

    def test_missing_fields_is_422(self, client):
        r = client.post("/api/auth/login", json={"email": "a@b.com"})
        assert r.status_code == 422

    def test_sixth_attempt_in_a_minute_is_429(self, client, registered_user):
        email, _, _ = registered_user
        for _ in range(5):
            r = client.post("/api/auth/login", json={"email": email, "password": "WrongPass999"})
            assert r.status_code == 401
        r = client.post("/api/auth/login", json={"email": email, "password": "WrongPass999"})
        assert r.status_code == 429


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------

class TestGetMe:
    def test_returns_user_profile(self, client, registered_user, auth_headers):
        email, _, _ = registered_user
        r = client.get("/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == email
        assert "language" in data
        assert "theme" in data

    def test_unauthenticated_is_401(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /me (preferences)
# ---------------------------------------------------------------------------

class TestUpdateMe:
    def test_update_language(self, client, auth_headers):
        r = client.patch("/api/auth/me", json={"language": "ru"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["language"] == "ru"

    def test_invalid_language_is_400(self, client, auth_headers):
        r = client.patch("/api/auth/me", json={"language": "xx"}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_theme(self, client, auth_headers):
        r = client.patch("/api/auth/me", json={"theme": "dark"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["theme"] == "dark"

    def test_invalid_theme_is_400(self, client, auth_headers):
        r = client.patch("/api/auth/me", json={"theme": "rainbow"}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_units(self, client, auth_headers):
        r = client.patch("/api/auth/me", json={"unit_distance": "mi", "unit_speed": "mph"}, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["unit_distance"] == "mi"
        assert data["unit_speed"] == "mph"


# ---------------------------------------------------------------------------
# POST /change-password
# ---------------------------------------------------------------------------

class TestChangePassword:
    def test_success(self, client, registered_user, auth_headers):
        email, old_pw, _ = registered_user
        r = client.post(
            "/api/auth/change-password",
            json={"old_password": old_pw, "new_password": "NewPass456"},
            headers=auth_headers,
        )
        assert r.status_code == 204
        # Can log in with new password
        r2 = client.post("/api/auth/login", json={"email": email, "password": "NewPass456"})
        assert r2.status_code == 200

    def test_wrong_old_password_is_400(self, client, auth_headers):
        r = client.post(
            "/api/auth/change-password",
            json={"old_password": "BadOldPass", "new_password": "NewPass456"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_short_new_password_is_422(self, client, auth_headers):
        r = client.post(
            "/api/auth/change-password",
            json={"old_password": "TestPass123", "new_password": "short"},
            headers=auth_headers,
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Forgot / Reset password
# ---------------------------------------------------------------------------

class TestPasswordReset:
    def test_forgot_unknown_email_returns_204(self, client):
        # Must not reveal whether email exists
        r = client.post("/api/auth/forgot-password", json={"email": "ghost@test.com"})
        assert r.status_code == 204

    def test_forgot_known_email_returns_204(self, client, registered_user):
        email, _, _ = registered_user
        r = client.post("/api/auth/forgot-password", json={"email": email})
        assert r.status_code == 204

    def test_reset_with_invalid_token_is_400(self, client):
        r = client.post("/api/auth/reset-password/bogus-token", json={"password": "NewPass789"})
        assert r.status_code == 400

    def test_reset_flow(self, client, db, registered_user):
        from app.models.password_reset import PasswordReset

        email, _, _ = registered_user
        # Create a valid reset token directly in DB
        from app.models.user import User
        user = db.query(User).filter(User.email == email).first()
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(PasswordReset(token=token, user_id=user.id, expires_at=expires))
        db.commit()

        r = client.post(f"/api/auth/reset-password/{token}", json={"password": "ResetPass99"})
        assert r.status_code == 204

        # Can log in with the new password
        r2 = client.post("/api/auth/login", json={"email": email, "password": "ResetPass99"})
        assert r2.status_code == 200

    def test_reset_token_cannot_be_reused(self, client, db, registered_user):
        from app.models.password_reset import PasswordReset
        from app.models.user import User

        email, _, _ = registered_user
        user = db.query(User).filter(User.email == email).first()
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(PasswordReset(token=token, user_id=user.id, expires_at=expires))
        db.commit()

        client.post(f"/api/auth/reset-password/{token}", json={"password": "FirstReset1"})
        r = client.post(f"/api/auth/reset-password/{token}", json={"password": "SecondReset2"})
        assert r.status_code == 400

    def test_expired_token_is_400(self, client, db, registered_user):
        from app.models.password_reset import PasswordReset
        from app.models.user import User

        email, _, _ = registered_user
        user = db.query(User).filter(User.email == email).first()
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) - timedelta(hours=1)  # already expired
        db.add(PasswordReset(token=token, user_id=user.id, expires_at=expires))
        db.commit()

        r = client.post(f"/api/auth/reset-password/{token}", json={"password": "NewPass789"})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# DELETE /account
# ---------------------------------------------------------------------------

class TestDeleteAccount:
    def test_deletes_user(self, client, registered_user, auth_headers):
        email, _, _ = registered_user
        r = client.delete("/api/auth/account", headers=auth_headers)
        assert r.status_code == 204
        # Login should now fail
        r2 = client.post("/api/auth/login", json={"email": email, "password": "TestPass123"})
        assert r2.status_code == 401

    def test_unauthenticated_is_401(self, client):
        r = client.delete("/api/auth/account")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

class TestSecurityHeaders:
    def test_api_response_has_csp(self, client):
        r = client.get("/health")
        assert "content-security-policy" in r.headers

    def test_api_response_has_nosniff(self, client):
        r = client.get("/health")
        assert r.headers.get("x-content-type-options") == "nosniff"

    def test_api_response_has_x_frame(self, client):
        r = client.get("/health")
        assert r.headers.get("x-frame-options") == "DENY"
