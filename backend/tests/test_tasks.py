"""GET /api/tasks/{task_id}/status requires auth (T-security: was fully open)."""
from unittest.mock import MagicMock, patch


def test_unauthenticated_is_401(client):
    r = client.get("/api/tasks/some-task-id/status")
    assert r.status_code == 401


def test_authenticated_returns_status(client, auth_headers):
    # AsyncResult talks to the Celery result backend (Redis) — mock it so
    # this test doesn't need a live Redis connection (CI has none).
    fake_result = MagicMock(state="PENDING")
    with patch("app.api.tasks.AsyncResult", return_value=fake_result):
        r = client.get("/api/tasks/some-task-id/status", headers=auth_headers)

    assert r.status_code == 200
    body = r.json()
    assert body["task_id"] == "some-task-id"
    assert body["state"] == "PENDING"
