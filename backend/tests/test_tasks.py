"""GET /api/tasks/{task_id}/status requires auth (T-security: was fully open)."""


def test_unauthenticated_is_401(client):
    r = client.get("/api/tasks/some-task-id/status")
    assert r.status_code == 401


def test_authenticated_returns_status(client, auth_headers):
    r = client.get("/api/tasks/some-task-id/status", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["task_id"] == "some-task-id"
    assert "state" in body
