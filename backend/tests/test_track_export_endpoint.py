"""POST /api/tracks/export — no-persist file generation for the Track
Creator's Download button (shares _points_to_* with /create, T28 fix)."""

POINTS = [{"lat": 55.0, "lon": 37.0}, {"lat": 55.001, "lon": 37.001}, {"lat": 55.002, "lon": 37.002}]


def test_unauthenticated_is_401(client):
    r = client.post("/api/tracks/export", json={"name": "Track", "points": POINTS, "format": "gpx"})
    assert r.status_code == 401


def test_gpx_export_returns_file(client, auth_headers):
    r = client.post(
        "/api/tracks/export",
        json={"name": "My Route", "points": POINTS, "format": "gpx"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/gpx+xml")
    assert "My Route.gpx" in r.headers["content-disposition"]
    assert b"<gpx" in r.content


def test_fit_export_returns_valid_binary(client, auth_headers):
    r = client.post(
        "/api/tracks/export",
        json={"name": "Ride", "points": POINTS, "format": "fit"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/octet-stream"

    from fit_tool.fit_file import FitFile
    parsed = FitFile.from_bytes(r.content, check_crc=True)
    assert len(parsed.records) > 0


def test_too_few_points_is_400(client, auth_headers):
    r = client.post(
        "/api/tracks/export",
        json={"name": "Track", "points": [POINTS[0]], "format": "gpx"},
        headers=auth_headers,
    )
    assert r.status_code == 400


def test_invalid_format_is_400(client, auth_headers):
    r = client.post(
        "/api/tracks/export",
        json={"name": "Track", "points": POINTS, "format": "shp"},
        headers=auth_headers,
    )
    assert r.status_code == 400


def test_default_name_when_blank(client, auth_headers):
    r = client.post(
        "/api/tracks/export",
        json={"name": "   ", "points": POINTS, "format": "geojson"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert "Track.geojson" in r.headers["content-disposition"]
