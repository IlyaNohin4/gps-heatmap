"""Integration tests for /api/poi/imports — lists as first-class entities (real SQLite DB)."""
import pytest

from app.core.database import Base
from app.models.poi import POI
from app.models.poi_import import POIImport


@pytest.fixture(autouse=True)
def _create_tables(db):
    Base.metadata.create_all(bind=db.get_bind(), tables=[POI.__table__, POIImport.__table__])
    yield
    db.query(POI).delete()
    db.query(POIImport).delete()
    db.commit()


def _current_user(db):
    from app.models.user import User
    return db.query(User).order_by(User.id.desc()).first()


class TestCreateImport:
    def test_creates_empty_list(self, client, auth_headers):
        r = client.post("/api/poi/imports", json={"name": "Hiking"}, headers=auth_headers)
        assert r.status_code == 201
        assert r.json() == {"name": "Hiking", "count": 0}

    def test_empty_list_appears_in_get_imports(self, client, auth_headers):
        client.post("/api/poi/imports", json={"name": "Hiking"}, headers=auth_headers)
        r = client.get("/api/poi/imports", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == [{"name": "Hiking", "count": 0}]

    def test_duplicate_name_is_409(self, client, auth_headers):
        client.post("/api/poi/imports", json={"name": "Hiking"}, headers=auth_headers)
        r = client.post("/api/poi/imports", json={"name": "Hiking"}, headers=auth_headers)
        assert r.status_code == 409

    def test_unauthenticated_is_401(self, client):
        r = client.post("/api/poi/imports", json={"name": "Hiking"})
        assert r.status_code == 401


class TestCreatePOIIntoImport:
    def test_create_poi_with_new_import_name_registers_list(self, client, auth_headers):
        r = client.post(
            "/api/poi/create",
            json={"name": "Summit", "lat": 48.8, "lon": 2.3, "category": "mountain", "import_name": "Hiking"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.json()["import_name"] == "Hiking"

        imports = client.get("/api/poi/imports", headers=auth_headers).json()
        assert imports == [{"name": "Hiking", "count": 1}]

    def test_create_poi_into_existing_empty_list(self, client, auth_headers):
        client.post("/api/poi/imports", json={"name": "Hiking"}, headers=auth_headers)
        client.post(
            "/api/poi/create",
            json={"name": "Summit", "lat": 48.8, "lon": 2.3, "category": "mountain", "import_name": "Hiking"},
            headers=auth_headers,
        )
        imports = client.get("/api/poi/imports", headers=auth_headers).json()
        assert imports == [{"name": "Hiking", "count": 1}]

    def test_create_poi_without_import_name_stays_unassigned(self, client, auth_headers):
        r = client.post(
            "/api/poi/create",
            json={"name": "Lonely", "lat": 48.8, "lon": 2.3, "category": "general"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.json()["import_name"] is None
        assert client.get("/api/poi/imports", headers=auth_headers).json() == []


class TestRenameImport:
    def test_renames_list_and_reassigns_poi(self, client, auth_headers, db):
        user = _current_user(db)
        imp = POIImport(user_id=user.id, name="Hiking")
        db.add(imp)
        poi = POI(user_id=user.id, name="Summit", lat=48.8, lon=2.3, category="mountain", import_name="Hiking")
        db.add(poi)
        db.commit()

        r = client.patch("/api/poi/imports/Hiking", json={"new_name": "Mountains"}, headers=auth_headers)
        assert r.status_code == 200

        imports = client.get("/api/poi/imports", headers=auth_headers).json()
        assert imports == [{"name": "Mountains", "count": 1}]

    def test_rename_missing_list_is_404(self, client, auth_headers):
        r = client.patch("/api/poi/imports/Ghost", json={"new_name": "New"}, headers=auth_headers)
        assert r.status_code == 404

    def test_rename_to_existing_name_is_409(self, client, auth_headers):
        client.post("/api/poi/imports", json={"name": "A"}, headers=auth_headers)
        client.post("/api/poi/imports", json={"name": "B"}, headers=auth_headers)
        r = client.patch("/api/poi/imports/A", json={"new_name": "B"}, headers=auth_headers)
        assert r.status_code == 409


class TestDeleteImport:
    def test_deletes_list_and_its_poi(self, client, auth_headers, db):
        user = _current_user(db)
        db.add(POIImport(user_id=user.id, name="Hiking"))
        db.add(POI(user_id=user.id, name="Summit", lat=48.8, lon=2.3, category="mountain", import_name="Hiking"))
        db.commit()

        r = client.delete("/api/poi/imports/Hiking", headers=auth_headers)
        assert r.status_code == 204

        assert client.get("/api/poi/imports", headers=auth_headers).json() == []
        assert client.get("/api/poi", headers=auth_headers).json()["items"] == []

    def test_delete_missing_list_is_404(self, client, auth_headers):
        r = client.delete("/api/poi/imports/Ghost", headers=auth_headers)
        assert r.status_code == 404

    def test_delete_empty_list_works(self, client, auth_headers):
        client.post("/api/poi/imports", json={"name": "Empty"}, headers=auth_headers)
        r = client.delete("/api/poi/imports/Empty", headers=auth_headers)
        assert r.status_code == 204


class TestExportImport:
    def test_export_missing_list_is_404(self, client, auth_headers):
        r = client.get("/api/poi/imports/Ghost/export", headers=auth_headers)
        assert r.status_code == 404

    def test_export_empty_list_returns_valid_kml(self, client, auth_headers):
        client.post("/api/poi/imports", json={"name": "Empty"}, headers=auth_headers)
        r = client.get("/api/poi/imports/Empty/export", headers=auth_headers)
        assert r.status_code == 200
        assert b"<kml" in r.content
