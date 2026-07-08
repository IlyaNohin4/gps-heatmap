"""Integration tests for track endpoints — DB session is mocked."""
import secrets
from unittest.mock import MagicMock, patch

import pytest

from app.core.database import get_db
from app.models.track import Track
from app.models.user import User


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_track(track_id: int, user_id: int, **kwargs) -> Track:
    t = Track()
    t.id = track_id
    t.user_id = user_id
    t.name = kwargs.get("name", "Test Track")
    t.file_format = kwargs.get("file_format", "gpx")
    t.distance_km = kwargs.get("distance_km", 12.5)
    t.duration_sec = kwargs.get("duration_sec", 3600)
    t.recorded_at = None
    t.uploaded_at = None
    t.speed_avg = kwargs.get("speed_avg", 15.0)
    t.speed_max = 30.0
    t.speed_min = 5.0
    t.elevation_gain = 200.0
    t.elevation_loss = 180.0
    t.regions = ["Paris"]
    t.geom = None
    t.raw_points = [{"lat": 48.8, "lon": 2.3, "elevation": 35, "time": None}]
    t.normalized_points = None
    t.speed_segments = [{"from": [48.8, 2.3], "to": [48.9, 2.4], "speed_kmh": 15.0}]
    t.is_public = kwargs.get("is_public", False)
    t.public_token = kwargs.get("public_token", secrets.token_urlsafe(32))
    return t


@pytest.fixture()
def authed_client(client, auth_headers):
    """Regular TestClient (SQLite auth) + auth headers tuple."""
    return client, auth_headers


# ── List tracks ───────────────────────────────────────────────────────────────

class TestListTracks:
    def test_unauthenticated_is_401(self, client):
        r = client.get("/api/tracks")
        assert r.status_code == 401

    def test_empty_list(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        _setup_mock_db_tracks(mock_db, [])

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        data = r.json()
        assert data == {"items": [], "total": 0, "has_more": False}

    def test_returns_track_list(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        track = _make_track(1, fake_user.id)
        _setup_mock_db_tracks(mock_db, [track])

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["has_more"] is False
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "Test Track"
        assert data["items"][0]["file_format"] == "gpx"

    def test_invalid_sort_is_422(self, client, auth_headers):
        r = client.get("/api/tracks?sort=invalid", headers=auth_headers)
        assert r.status_code == 422

    def test_default_limit_is_50(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        tracks = [_make_track(i, fake_user.id) for i in range(1, 51)]
        _setup_mock_db_tracks(mock_db, tracks, total=75)

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) == 50
        assert data["total"] == 75
        assert data["has_more"] is True

    def test_offset_shifts_selection(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        page_2 = [_make_track(i, fake_user.id) for i in range(11, 21)]
        _setup_mock_db_tracks(mock_db, page_2, total=30)

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks?limit=10&offset=10", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) == 10
        assert data["items"][0]["id"] == 11
        assert data["total"] == 30
        assert data["has_more"] is True

    def test_total_counts_before_limit(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        tracks = [_make_track(1, fake_user.id)]
        _setup_mock_db_tracks(mock_db, tracks, total=200)

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks?limit=1", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 200
        assert len(data["items"]) == 1

    def test_has_more_false_on_last_page(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        tracks = [_make_track(i, fake_user.id) for i in range(1, 6)]
        _setup_mock_db_tracks(mock_db, tracks, total=25)

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks?limit=5&offset=20", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        assert r.json()["has_more"] is False

    @pytest.mark.parametrize("sort_value", ["shortest", "slowest"])
    def test_new_sort_values_work(self, client, auth_headers, mock_db, sort_value):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        tracks = [_make_track(1, fake_user.id)]
        _setup_mock_db_tracks(mock_db, tracks)

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get(f"/api/tracks?sort={sort_value}", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200

    def test_invalid_file_format_is_400(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks?file_format=exe", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 400

    def test_invalid_bbox_is_400(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)

        # Patch ST_Intersects / ST_MakeEnvelope since SQLite doesn't have them
        with patch("app.api.tracks.ST_MakeEnvelope"), patch("app.api.tracks.ST_Intersects"):
            app.dependency_overrides[get_db] = lambda: (yield mock_db)
            r = client.get("/api/tracks?bbox=not,valid", headers=auth_headers)
            app.dependency_overrides.clear()
        assert r.status_code == 400


# ── Get track by ID ───────────────────────────────────────────────────────────

class TestGetTrack:
    def test_returns_track_detail(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        track = _make_track(42, fake_user.id)
        _setup_mock_db_user(mock_db, fake_user)
        mock_db.query.return_value.filter.return_value.first.return_value = track

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks/42", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == 42
        assert "speed_segments" in data

    def test_not_found_is_404(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks/9999", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 404

    def test_unauthenticated_is_401(self, client):
        r = client.get("/api/tracks/1")
        assert r.status_code == 401


# ── Delete track ──────────────────────────────────────────────────────────────

class TestDeleteTrack:
    def test_delete_returns_204(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        track = _make_track(5, fake_user.id)
        _setup_mock_db_user(mock_db, fake_user)
        mock_db.query.return_value.filter.return_value.first.return_value = track

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.delete("/api/tracks/5", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 204
        mock_db.delete.assert_called_once_with(track)
        mock_db.commit.assert_called()

    def test_delete_not_found_is_404(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.delete("/api/tracks/999", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 404


# ── Toggle publish ─────────────────────────────────────────────────────────────

class TestTogglePublish:
    def test_publish_toggles_is_public(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        track = _make_track(7, fake_user.id, is_public=False)
        _setup_mock_db_user(mock_db, fake_user)
        mock_db.query.return_value.filter.return_value.first.return_value = track
        mock_db.refresh.side_effect = lambda t: None  # no-op

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.patch("/api/tracks/7/publish", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 200
        assert track.is_public is True  # was toggled

    def test_publish_not_found_is_404(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.patch("/api/tracks/999/publish", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 404


# ── Public track ───────────────────────────────────────────────────────────────

class TestPublicTrack:
    def test_public_track_accessible_without_auth(self, client, mock_db):
        from app.main import app

        token = secrets.token_urlsafe(32)
        track = _make_track(10, 1, is_public=True, public_token=token)
        mock_db.query.return_value.filter.return_value.first.return_value = track

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get(f"/api/tracks/public/{token}")
        app.dependency_overrides.clear()
        assert r.status_code == 200
        assert r.json()["id"] == 10

    def test_unknown_public_token_is_404(self, client, mock_db):
        from app.main import app

        mock_db.query.return_value.filter.return_value.first.return_value = None

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks/public/bad-token")
        app.dependency_overrides.clear()
        assert r.status_code == 404


# ── Track isolation (user A can't see user B's tracks) ────────────────────────

class TestTrackIsolation:
    def test_other_user_track_returns_404(self, client, auth_headers, mock_db):
        """Endpoint filters by user_id, so another user's track looks not-found."""
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        # Simulate the query returning None (track belongs to a different user)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.get("/api/tracks/100", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 404

    def test_delete_other_user_track_is_404(self, client, auth_headers, mock_db):
        from app.main import app

        fake_user = _make_fake_user()
        _setup_mock_db_user(mock_db, fake_user)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        app.dependency_overrides[get_db] = lambda: (yield mock_db)
        r = client.delete("/api/tracks/100", headers=auth_headers)
        app.dependency_overrides.clear()
        assert r.status_code == 404


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_fake_user():
    u = User()
    u.id = 1
    u.email = "test@example.com"
    u.language = "en"
    u.theme = "light"
    u.unit_distance = "km"
    u.unit_speed = "kmh"
    return u


def _setup_mock_db_user(mock_db: MagicMock, fake_user: User):
    """Wire mock_db so get_current_user can resolve the JWT."""
    mock_db.get.return_value = fake_user
    # The auth dep queries User by id; track queries filter differently.
    # We chain the mock to return fake_user for user lookups.
    mock_db.query.return_value.filter.return_value.first.return_value = fake_user


def _setup_mock_db_tracks(mock_db: MagicMock, tracks: list, total: int = None):
    """Wire mock_db to return a list of tracks from .order_by().offset().limit().all(),
    and a count from .order_by().count()."""
    order_by_mock = mock_db.query.return_value.filter.return_value.order_by.return_value
    order_by_mock.count.return_value = total if total is not None else len(tracks)
    order_by_mock.offset.return_value.limit.return_value.all.return_value = tracks
    # Back-compat for any code path calling .all() directly on order_by().
    order_by_mock.all.return_value = tracks
