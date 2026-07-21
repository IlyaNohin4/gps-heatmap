"""GET /api/tasks/{task_id}/status requires auth (T-security: was fully open)."""
from unittest.mock import MagicMock, patch


def test_unauthenticated_is_401(client):
    r = client.get("/api/tasks/some-task-id/status")
    assert r.status_code == 401


def test_authenticated_returns_status(client, auth_headers):
    # AsyncResult talks to the Celery result backend (Redis) — mock it so
    # this test doesn't need a live Redis connection (CI has none).
    user_id = client.get("/api/auth/me", headers=auth_headers).json()["id"]
    fake_result = MagicMock(state="PENDING")
    with patch("app.api.tasks.AsyncResult", return_value=fake_result), \
         patch("app.api.tasks.redis_client.get", return_value=str(user_id).encode()):
        r = client.get("/api/tasks/some-task-id/status", headers=auth_headers)

    assert r.status_code == 200
    body = r.json()
    assert body["task_id"] == "some-task-id"
    assert body["state"] == "PENDING"


def test_authenticated_other_users_task_is_404(client, auth_headers):
    with patch("app.api.tasks.redis_client.get", return_value=b"999999"):
        r = client.get("/api/tasks/some-task-id/status", headers=auth_headers)
    assert r.status_code == 404


def test_authenticated_unknown_task_is_404(client, auth_headers):
    with patch("app.api.tasks.redis_client.get", return_value=None):
        r = client.get("/api/tasks/some-task-id/status", headers=auth_headers)
    assert r.status_code == 404
