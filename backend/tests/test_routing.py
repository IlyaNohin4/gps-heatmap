from unittest.mock import AsyncMock, patch

import httpx


def _mock_response(status_code=200, json_data=None):
    resp = httpx.Response(
        status_code=status_code,
        json=json_data or {},
        request=httpx.Request("POST", "https://api.openrouteservice.org/fake"),
    )
    return resp


class TestDirectionsProxy:
    def test_requires_auth(self, client):
        resp = client.post(
            "/api/routing/directions",
            json={"profile": "foot-walking", "coordinates": [[30.5, 50.4], [30.6, 50.5]]},
        )
        assert resp.status_code == 401

    def test_rejects_unknown_profile(self, client, auth_headers):
        resp = client.post(
            "/api/routing/directions",
            json={"profile": "teleport", "coordinates": [[30.5, 50.4], [30.6, 50.5]]},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_rejects_single_coordinate(self, client, auth_headers):
        resp = client.post(
            "/api/routing/directions",
            json={"profile": "foot-walking", "coordinates": [[30.5, 50.4]]},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_proxies_successful_response_without_leaking_key(self, client, auth_headers):
        from app.core.config import settings

        geojson = {"features": [{"geometry": {"coordinates": [[30.5, 50.4], [30.6, 50.5]]}}]}
        mock_post = AsyncMock(return_value=_mock_response(200, geojson))
        with patch("httpx.AsyncClient.post", mock_post):
            resp = client.post(
                "/api/routing/directions",
                json={"profile": "foot-walking", "coordinates": [[30.5, 50.4], [30.6, 50.5]]},
                headers=auth_headers,
            )
        assert resp.status_code == 200
        assert resp.json() == geojson
        # The API key must never appear in the response body.
        assert settings.ORS_API_KEY not in resp.text
        sent_headers = mock_post.call_args.kwargs["headers"]
        assert sent_headers["Authorization"] == f"Bearer {settings.ORS_API_KEY}"

    def test_upstream_error_returns_502(self, client, auth_headers):
        mock_post = AsyncMock(return_value=_mock_response(403, {"error": {"message": "Quota exceeded"}}))
        with patch("httpx.AsyncClient.post", mock_post):
            resp = client.post(
                "/api/routing/directions",
                json={"profile": "foot-walking", "coordinates": [[30.5, 50.4], [30.6, 50.5]]},
                headers=auth_headers,
            )
        assert resp.status_code == 502
        assert resp.json()["detail"] == "Quota exceeded"

    def test_network_error_returns_502(self, client, auth_headers):
        mock_post = AsyncMock(side_effect=httpx.ConnectTimeout("timed out"))
        with patch("httpx.AsyncClient.post", mock_post):
            resp = client.post(
                "/api/routing/directions",
                json={"profile": "foot-walking", "coordinates": [[30.5, 50.4], [30.6, 50.5]]},
                headers=auth_headers,
            )
        assert resp.status_code == 502

    def test_missing_key_returns_503(self, client, auth_headers, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "ORS_API_KEY", "")
        resp = client.post(
            "/api/routing/directions",
            json={"profile": "foot-walking", "coordinates": [[30.5, 50.4], [30.6, 50.5]]},
            headers=auth_headers,
        )
        assert resp.status_code == 503
