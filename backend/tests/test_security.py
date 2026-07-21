"""Security-focused tests: input validation, size limits, format spoofing."""
import io
import os
import secrets
from unittest.mock import MagicMock, patch

import pytest

from app.api.tracks import _detect_format
from app.core.database import get_db
from app.models.user import User
from app.services.normalizer import normalize
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


# ── Normalizer security / edge cases ──────────────────────────────────────────

class TestNormalizerEdgeCases:
    def _pt(self, lat, lon, t=None):
        return {"lat": lat, "lon": lon, "elevation": None, "time": t}

    def test_empty_points_returns_empty(self):
        pts, segs = normalize([], [])
        assert pts == []
        assert segs == []

    def test_speed_outlier_filtered(self):
        segs = [
            {"from": [48.0, 2.0], "to": [49.0, 3.0], "speed_kmh": 15.0},
            {"from": [49.0, 3.0], "to": [50.0, 4.0], "speed_kmh": 9999.0},  # outlier
        ]
        pts = [self._pt(48.0, 2.0), self._pt(49.0, 3.0), self._pt(50.0, 4.0)]
        _, cleaned = normalize(pts, segs)
        assert all(s["speed_kmh"] <= 350 for s in cleaned)
        assert len(cleaned) == 1

    def test_drift_clusters_collapsed(self):
        from datetime import datetime, timedelta, timezone

        base = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        # 5 points all within 5 metres of each other — should collapse to 1
        pts = [
            {"lat": 48.85660 + i * 0.000001, "lon": 2.35220, "elevation": None, "time": base + timedelta(seconds=i * 10)}
            for i in range(5)
        ]
        collapsed, _ = normalize(pts, [])
        assert len(collapsed) < len(pts)

    def test_normal_track_unchanged(self):
        from datetime import datetime, timedelta, timezone

        base = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        # Points far apart — should not be collapsed
        pts = [
            {"lat": 48.0 + i * 0.1, "lon": 2.0 + i * 0.1, "elevation": None, "time": base + timedelta(minutes=i)}
            for i in range(5)
        ]
        collapsed, _ = normalize(pts, [])
        assert len(collapsed) == len(pts)
