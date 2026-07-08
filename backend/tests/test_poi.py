"""Integration tests for GET /api/poi pagination and search — real SQLite DB."""
import pytest

from app.core.database import Base
from app.models.poi import POI


@pytest.fixture(autouse=True)
def _create_poi_table(db):
    Base.metadata.create_all(bind=db.get_bind(), tables=[POI.__table__])
    yield
    db.query(POI).delete()
    db.commit()


def _make_poi(db, user_id, name, category="general"):
    poi = POI(user_id=user_id, name=name, lat=48.8, lon=2.3, category=category)
    db.add(poi)
    db.commit()
    return poi


class TestListPOI:
    def test_unauthenticated_is_401(self, client):
        r = client.get("/api/poi")
        assert r.status_code == 401

    def test_empty_list(self, client, auth_headers):
        r = client.get("/api/poi", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0, "has_more": False}

    def test_search_case_insensitive_substring(self, client, auth_headers, db):
        from app.models.user import User

        user = db.query(User).order_by(User.id.desc()).first()
        _make_poi(db, user.id, "Lake Baikal")
        _make_poi(db, user.id, "Cafe by the Lake")
        _make_poi(db, user.id, "Elbrus Mountain")

        r = client.get("/api/poi", params={"search": "lake"}, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        names = {item["name"] for item in data["items"]}
        assert names == {"Lake Baikal", "Cafe by the Lake"}
        assert data["total"] == 2
        assert data["has_more"] is False

    def test_limit_offset(self, client, auth_headers, db):
        from app.models.user import User

        user = db.query(User).order_by(User.id.desc()).first()
        for i in range(15):
            _make_poi(db, user.id, f"POI {i:02d}")

        r = client.get("/api/poi", params={"limit": 5, "offset": 0}, headers=auth_headers)
        data = r.json()
        assert len(data["items"]) == 5
        assert data["total"] == 15
        assert data["has_more"] is True

        r2 = client.get("/api/poi", params={"limit": 5, "offset": 10}, headers=auth_headers)
        data2 = r2.json()
        assert len(data2["items"]) == 5
        assert data2["total"] == 15
        assert data2["has_more"] is False

    def test_category_and_search_combined(self, client, auth_headers, db):
        from app.models.user import User

        user = db.query(User).order_by(User.id.desc()).first()
        _make_poi(db, user.id, "Lake Baikal", category="water")
        _make_poi(db, user.id, "Lake Sevan", category="water")
        _make_poi(db, user.id, "Lake View Peak", category="mountain")

        r = client.get(
            "/api/poi",
            params={"search": "lake", "category": "water"},
            headers=auth_headers,
        )
        data = r.json()
        names = {item["name"] for item in data["items"]}
        assert names == {"Lake Baikal", "Lake Sevan"}
        assert data["total"] == 2
