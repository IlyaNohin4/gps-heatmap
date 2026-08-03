"""Security-focused tests: input validation, size limits, format spoofing."""
import io
import os
import secrets
from unittest.mock import MagicMock, patch

import pytest

from app.api.tracks import _detect_format
from app.core.database import get_db
from app.models.user import User
from app.services.parser_factory import detect_format, parse


# ── Format detection / magic-byte spoofing ────────────────────────────────────

class TestMagicByteDetection:
    """Ensure the server detects format from content, not just extension."""

    def test_xml_renamed_as_exe_raises(self):
        with pytest.raises(ValueError):
            detect_format(b"\x4d\x5a" + b"\x00" * 100, "malware.exe")

    def test_gpx_content_detected_regardless_of_extension(self):
        gpx_bytes = b"<?xml version='1.0'?><gpx version='1.1'><trk></trk></gpx>"
        fmt = detect_format(gpx_bytes, "fake.tcx")
        assert fmt == "gpx"

    def test_kml_content_detected(self):
        kml_bytes = b"<?xml?><kml xmlns='http://www.opengis.net/kml/2.2'></kml>"
        fmt = detect_format(kml_bytes, "data.gpx")
        assert fmt == "kml"

    def test_binary_garbage_raises(self):
        with pytest.raises(ValueError):
            detect_format(b"\x00\x01\x02\x03" * 50, "file.gpx")

    def test_empty_file_raises(self):
        with pytest.raises(ValueError):
            detect_format(b"", "empty.gpx")


# ── File size limit ───────────────────────────────────────────────────────────

class TestFileSizeLimit:
    def _fake_user(self):
        u = User()
        u.id = 1
        u.email = "sec@test.com"
        u.language = "en"
        u.theme = "light"
        u.unit_distance = "km"
        u.unit_speed = "kmh"
        return u

    def test_oversized_file_returns_413(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        oversized = b"<?xml version='1.0'?><gpx><trk></trk></gpx>" + b"X" * (21 * 1024 * 1024)

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.post(
            "/api/tracks/upload",
            headers=auth_headers,
            files={"file": ("big.gpx", io.BytesIO(oversized), "application/gpx+xml")},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 413

    def test_file_at_exact_limit_is_accepted(self, client, auth_headers, mock_db):
        """A file just under 20 MB should pass the size check (mocked Celery)."""
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        # ~20MB - just padding a tiny valid GPX header
        header = b"<?xml version='1.0'?>\n<gpx version='1.1'><trk><trkseg></trkseg></trk></gpx>"
        # 19 MB content — safely under the 20 MB limit
        content = header + b" " * (19 * 1024 * 1024)

        fake_track = MagicMock()
        fake_track.id = 1
        mock_db.add.return_value = None
        mock_db.commit.return_value = None
        mock_db.refresh.side_effect = lambda obj: setattr(obj, "id", 1)

        with patch("app.api.tracks.process_track") as mock_task:
            mock_task.delay.return_value.id = "task-abc"
            app.dependency_overrides[get_db] = lambda: (yield mock_db)
            r = client.post(
                "/api/tracks/upload",
                headers=auth_headers,
                files={"file": ("run.gpx", io.BytesIO(content), "application/gpx+xml")},
            )
            app.dependency_overrides.clear()
        # 202 Accepted or 400/422 for format — either is fine; just not 413
        assert r.status_code != 413


class TestUploadRateLimit:
    def _fake_user(self):
        u = User()
        u.id = 1
        u.email = "ratelimit@test.com"
        u.language = "en"
        u.theme = "light"
        u.unit_distance = "km"
        u.unit_speed = "kmh"
        return u

    def test_track_upload_11th_in_a_minute_is_429(self, client, auth_headers, mock_db):
        # MEDIUM: /api/tracks/upload had no rate limit — each call can push
        # up to 20MB into Redis as a Celery task argument.
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        for _ in range(10):
            r = client.post(
                "/api/tracks/upload",
                headers=auth_headers,
                files={"file": ("x.exe", io.BytesIO(b"not a gps file"), "application/octet-stream")},
            )
            assert r.status_code == 400  # unsupported format, but under the limit
        r = client.post(
            "/api/tracks/upload",
            headers=auth_headers,
            files={"file": ("x.exe", io.BytesIO(b"not a gps file"), "application/octet-stream")},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 429

    def test_poi_upload_11th_in_a_minute_is_429(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        for _ in range(10):
            r = client.post(
                "/api/poi/upload",
                headers=auth_headers,
                files={"file": ("x.exe", io.BytesIO(b"not a kml file"), "application/octet-stream")},
            )
            assert r.status_code != 429
        r = client.post(
            "/api/poi/upload",
            headers=auth_headers,
            files={"file": ("x.exe", io.BytesIO(b"not a kml file"), "application/octet-stream")},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 429

    def test_create_track_11th_in_a_minute_is_429(self, client, auth_headers, mock_db):
        # M1: /api/tracks/create and /api/tracks/export had no rate limit —
        # a bare-minimum body (invalid format, rejected before any real
        # work) still counts against the limit here since @limiter.limit
        # wraps the whole endpoint.
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        points = [{"lat": 1.0, "lon": 2.0}, {"lat": 1.1, "lon": 2.1}]
        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        for _ in range(10):
            r = client.post(
                "/api/tracks/create",
                headers=auth_headers,
                json={"name": "Track", "points": points, "format": "shp"},
            )
            assert r.status_code == 400  # invalid format, but under the limit
        r = client.post(
            "/api/tracks/create",
            headers=auth_headers,
            json={"name": "Track", "points": points, "format": "shp"},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 429

    def test_create_track_too_many_points_is_422(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        huge = [{"lat": 1.0, "lon": 2.0 + i * 0.0001} for i in range(50_001)]
        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.post(
            "/api/tracks/create",
            headers=auth_headers,
            json={"name": "Track", "points": huge, "format": "gpx"},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 422


# ── Upload content integrity ──────────────────────────────────────────────────

class TestUploadContentIntegrity:
    """process_track must receive bytes identical to the uploaded file — a past
    bug prepended a duplicate copy of the first 2048 bytes (read-ahead used
    for format sniffing wasn't discarded before the full read)."""

    def _fake_user(self):
        u = User()
        u.id = 1
        u.email = "integrity@test.com"
        u.language = "en"
        u.theme = "light"
        u.unit_distance = "km"
        u.unit_speed = "kmh"
        return u

    def test_process_track_receives_exact_file_bytes(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user
        mock_db.refresh.side_effect = lambda obj: setattr(obj, "id", 1)

        # >2048 bytes so a duplicated read-ahead header would be detectable
        original = (
            b"<?xml version='1.0'?>\n<gpx version='1.1'><trk><trkseg>"
            + b"<trkpt lat=\"1.0\" lon=\"2.0\"></trkpt>" * 200
            + b"</trkseg></trk></gpx>"
        )
        assert len(original) > 2048

        with patch("app.api.tracks.process_track") as mock_task:
            mock_task.delay.return_value.id = "task-integrity"
            app.dependency_overrides[get_db] = lambda: (yield mock_db)
            r = client.post(
                "/api/tracks/upload",
                headers=auth_headers,
                files={"file": ("integrity.gpx", io.BytesIO(original), "application/gpx+xml")},
            )
            app.dependency_overrides.clear()

        assert r.status_code == 202
        sent_content = mock_task.delay.call_args[0][1]
        assert sent_content == original
        assert len(sent_content) == len(original)

    def test_dotfile_upload_falls_back_to_track_name(self, client, auth_headers, mock_db):
        # L6: name = filename.rsplit(".", 1)[0] gives "" for a dotfile-style
        # filename like ".gpx" (no basename), not the intended "track" fallback.
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user
        mock_db.refresh.side_effect = lambda obj: setattr(obj, "id", 1)

        content = b"<?xml version='1.0'?><gpx version='1.1'><trk><trkseg><trkpt lat=\"1\" lon=\"2\"></trkpt></trkseg></trk></gpx>"

        with patch("app.api.tracks.process_track") as mock_task:
            mock_task.delay.return_value.id = "task-dotfile"
            app.dependency_overrides[get_db] = lambda: (yield mock_db)
            r = client.post(
                "/api/tracks/upload",
                headers=auth_headers,
                files={"file": (".gpx", io.BytesIO(content), "application/gpx+xml")},
            )
            app.dependency_overrides.clear()

        assert r.status_code == 202
        added_track = mock_db.add.call_args[0][0]
        assert added_track.name == "track"


# ── Unsupported / spoofed formats ─────────────────────────────────────────────

class TestUnsupportedFormats:
    def _fake_user(self):
        u = User()
        u.id = 1
        u.email = "sec2@test.com"
        u.language = "en"
        u.theme = "light"
        u.unit_distance = "km"
        u.unit_speed = "kmh"
        return u

    def test_pdf_file_rejected(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.post(
            "/api/tracks/upload",
            headers=auth_headers,
            files={"file": ("evil.pdf", io.BytesIO(b"%PDF-1.4 fake content"), "application/pdf")},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 400

    def test_zip_file_rejected(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        zip_magic = b"PK\x03\x04" + b"\x00" * 100

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.post(
            "/api/tracks/upload",
            headers=auth_headers,
            files={"file": ("archive.zip", io.BytesIO(zip_magic), "application/zip")},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 400

    def test_txt_file_rejected(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.post(
            "/api/tracks/upload",
            headers=auth_headers,
            files={"file": ("notes.txt", io.BytesIO(b"hello world"), "text/plain")},
        )
        app.dependency_overrides.clear()
        assert r.status_code == 400


# ── XSS / injection in track names ────────────────────────────────────────────

class TestXSSInInputs:
    """Track names are stored as-is and rendered by the frontend; the API
    itself should accept them (sanitization happens in the UI). But we verify
    the API doesn't crash or reveal stack traces on HTML/script input."""

    def _fake_user(self):
        u = User()
        u.id = 1
        u.email = "xss@test.com"
        u.language = "en"
        u.theme = "light"
        u.unit_distance = "km"
        u.unit_speed = "kmh"
        return u

    @pytest.mark.parametrize("name", [
        "<script>alert(1)</script>",
        "'; DROP TABLE tracks; --",
        "<img src=x onerror=alert(1)>",
        "A" * 1000,
    ])
    def test_rename_with_xss_payload_does_not_crash(self, client, auth_headers, mock_db, name):
        from app.main import app

        fake_user = self._fake_user()
        # get_current_user calls db.get(User, user_id) — not db.query()
        mock_db.get.return_value = fake_user

        from tests.test_tracks import _make_track
        track = _make_track(1, 1)
        # rename_track calls db.query(Track).filter(...).first()
        mock_db.query.return_value.filter.return_value.first.return_value = track
        mock_db.refresh.side_effect = lambda obj: None

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.patch(
            "/api/tracks/1/rename",
            json={"name": name},
            headers=auth_headers,
        )
        app.dependency_overrides.clear()
        # Should not 500 — either 200 (accepted), 400 (empty name after strip),
        # or 422 (exceeds max_length validation)
        assert r.status_code in (200, 400, 404, 422)

    def test_empty_name_is_rejected(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = self._fake_user()
        mock_db.get.return_value = fake_user
        mock_db.query.return_value.filter.return_value.first.return_value = fake_user

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.patch(
            "/api/tracks/1/rename",
            json={"name": "   "},
            headers=auth_headers,
        )
        app.dependency_overrides.clear()
        assert r.status_code == 400


# ── Security response headers ──────────────────────────────────────────────────

class TestSecurityHeaders:
    def test_response_carries_hardening_headers(self, client):
        r = client.get("/api/auth/me")  # any route; middleware applies globally
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
        assert "Permissions-Policy" in r.headers
        assert "Content-Security-Policy" in r.headers

    def test_csp_img_src_covers_every_map_tile_domain(self, client):
        # HIGH: img-src previously omitted mt1.google.com (Google layers) and
        # tile.openstreetmap.de (the "OSM.de" layer) — those tiles loaded
        # fine in dev (Vite sets no CSP) but were silently blocked in prod.
        r = client.get("/api/auth/me")
        csp = r.headers["Content-Security-Policy"]
        for domain in ("https://mt1.google.com", "https://tile.openstreetmap.de"):
            assert domain in csp, f"{domain} missing from CSP img-src"


# ── Auth token security ────────────────────────────────────────────────────────

class TestAuthTokenSecurity:
    def test_forged_jwt_is_401(self, client):
        r = client.get("/api/tracks", headers={"Authorization": "Bearer forged.jwt.token"})
        assert r.status_code == 401

    def test_no_auth_header_is_401(self, client):
        r = client.get("/api/tracks")
        assert r.status_code == 401

    def test_wrong_scheme_is_401(self, client):
        r = client.get("/api/tracks", headers={"Authorization": "Basic dXNlcjpwYXNz"})
        assert r.status_code == 401

    def test_expired_token_is_401(self, client):
        from datetime import datetime, timedelta, timezone
        from jose import jwt
        from app.core.config import settings

        expired_payload = {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(days=1)}
        token = jwt.encode(expired_payload, settings.JWT_SECRET, algorithm="HS256")
        r = client.get("/api/tracks", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401
