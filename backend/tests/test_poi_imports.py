"""Integration tests for /api/poi/imports — lists as first-class entities (real SQLite DB)."""
import pytest

from app.core.database import Base
from app.models.poi import POI
from app.models.poi_category import POICategory
from app.models.poi_import import POIImport


@pytest.fixture(autouse=True)
def _create_tables(db):
    Base.metadata.create_all(bind=db.get_bind(), tables=[POI.__table__, POIImport.__table__, POICategory.__table__])
    yield
    db.query(POI).delete()
    db.query(POIImport).delete()
    db.query(POICategory).delete()
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
        # Every account starts with a "My Points" list (see api/auth.py register()).
        client.post("/api/poi/imports", json={"name": "Hiking"}, headers=auth_headers)
        r = client.get("/api/poi/imports", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == [
            {"name": "Hiking", "count": 0},
            {"name": "My Points", "count": 0},
        ]

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
        assert imports == [
            {"name": "Hiking", "count": 1},
            {"name": "My Points", "count": 0},
        ]

    def test_create_poi_into_existing_empty_list(self, client, auth_headers):
        client.post("/api/poi/imports", json={"name": "Hiking"}, headers=auth_headers)
        client.post(
            "/api/poi/create",
            json={"name": "Summit", "lat": 48.8, "lon": 2.3, "category": "mountain", "import_name": "Hiking"},
            headers=auth_headers,
        )
        imports = client.get("/api/poi/imports", headers=auth_headers).json()
        assert imports == [
            {"name": "Hiking", "count": 1},
            {"name": "My Points", "count": 0},
        ]

    def test_create_poi_without_import_name_is_422(self, client, auth_headers):
        r = client.post(
            "/api/poi/create",
            json={"name": "Lonely", "lat": 48.8, "lon": 2.3, "category": "general"},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_create_poi_with_empty_import_name_is_422(self, client, auth_headers):
        r = client.post(
            "/api/poi/create",
            json={"name": "Lonely", "lat": 48.8, "lon": 2.3, "category": "general", "import_name": ""},
            headers=auth_headers,
        )
        assert r.status_code == 422


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
        assert imports == [
            {"name": "Mountains", "count": 1},
            {"name": "My Points", "count": 0},
        ]

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

        assert client.get("/api/poi/imports", headers=auth_headers).json() == [
            {"name": "My Points", "count": 0}
        ]
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

    def test_export_restores_style_altitude_and_cdata(self, client, auth_headers, db):
        user = _current_user(db)
        db.add(POIImport(user_id=user.id, name="Styled"))
        poi = POI(
            user_id=user.id,
            name='Café "Central"',
            lat=48.5,
            lon=34.8,
            category="food",
            description="Great <b>coffee</b>",
            source="uploaded",
            import_name="Styled",
            kml_icon_href="https://maps.google.com/mapfiles/kml/shapes/restaurant.png",
            kml_style_color="ff0000ff",
            kml_altitude=1234.5,
        )
        db.add(poi)
        db.commit()

        r = client.get("/api/poi/imports/Styled/export", headers=auth_headers)
        assert r.status_code == 200
        body = r.content.decode("utf-8")

        # Name/description round-trip via CDATA, so quotes/HTML-looking text
        # inside them don't need escaping.
        assert '<![CDATA[Café "Central"]]>' in body
        assert "<![CDATA[Great <b>coffee</b>]]>" in body
        # Original altitude is preserved instead of being dropped to 0.
        assert "34.8,48.5,1234.5" in body
        # Style block restored from the raw href/color captured on import.
        assert "<Style" in body
        assert "ff0000ff" in body
        assert "restaurant.png" in body
        assert "<styleUrl>#style0</styleUrl>" in body

    def test_export_name_with_cdata_terminator_does_not_500(self, client, auth_headers, db):
        # L4: minidom's CDATASection.writexml raises ValueError if the data
        # contains a literal "]]>" (it would otherwise prematurely close the
        # section) — a POI name/description containing that exact substring
        # used to 500 the whole export.
        user = _current_user(db)
        db.add(POIImport(user_id=user.id, name="Tricky"))
        poi = POI(
            user_id=user.id,
            name="weird]]>name",
            lat=48.5,
            lon=34.8,
            category="food",
            description="desc]]>with]]>terminators",
            source="uploaded",
            import_name="Tricky",
        )
        db.add(poi)
        db.commit()

        r = client.get("/api/poi/imports/Tricky/export", headers=auth_headers)
        assert r.status_code == 200
        body = r.content.decode("utf-8")

        # The raw XML must not contain an actual "]]>" outside of a section
        # boundary that reconstructs the original text — round-trip it back
        # through a real XML parser instead of string-matching the escape.
        from lxml import etree
        root = etree.fromstring(r.content)
        ns = "{http://www.opengis.net/kml/2.2}"
        placemark = root.find(f".//{ns}Placemark")
        assert placemark.find(f"{ns}name").text == "weird]]>name"
        assert placemark.find(f"{ns}description").text == "desc]]>with]]>terminators"

    def test_export_poi_without_captured_style_has_no_style_block(self, client, auth_headers, db):
        user = _current_user(db)
        db.add(POIImport(user_id=user.id, name="Plain"))
        poi = POI(
            user_id=user.id,
            name="Plain Point",
            lat=1.0,
            lon=2.0,
            category="other",
            source="user",
            import_name="Plain",
        )
        db.add(poi)
        db.commit()

        r = client.get("/api/poi/imports/Plain/export", headers=auth_headers)
        assert r.status_code == 200
        body = r.content.decode("utf-8")
        assert "<Style" not in body
        assert "<styleUrl>" not in body
        # No captured altitude falls back to 0, matching prior export behavior.
        assert "2.0,1.0,0" in body

    def test_export_own_poi_with_icon_uses_google_icon_and_converted_color(self, client, auth_headers, db):
        """A POI created/edited in-app (no kml_icon_href) still gets a real
        Google-shaped icon on export, tinted with its own `color`."""
        user = _current_user(db)
        db.add(POIImport(user_id=user.id, name="OwnIcons"))
        poi = POI(
            user_id=user.id,
            name="My Cafe",
            lat=3.0,
            lon=4.0,
            category="food",
            source="user",
            import_name="OwnIcons",
            icon="food",
            color="#ff0000",
        )
        db.add(poi)
        db.commit()

        r = client.get("/api/poi/imports/OwnIcons/export", headers=auth_headers)
        assert r.status_code == 200
        body = r.content.decode("utf-8")
        assert "dining.png" in body
        # Our #ff0000 -> KML aabbggrr, full opacity -> ff0000ff
        assert "ff0000ff" in body
        assert "<styleUrl>#style0</styleUrl>" in body


class TestManageCategories:
    def test_rename_category_updates_all_matching_poi(self, client, auth_headers, db):
        user = _current_user(db)
        db.add_all([
            POI(user_id=user.id, name="A", lat=1.0, lon=1.0, category="food", import_name="X"),
            POI(user_id=user.id, name="B", lat=2.0, lon=2.0, category="food", import_name="X"),
            POI(user_id=user.id, name="C", lat=3.0, lon=3.0, category="water", import_name="X"),
        ])
        db.commit()

        r = client.patch("/api/poi/categories/food", json={"new_name": "dining"}, headers=auth_headers)
        assert r.status_code == 200

        cats = {c["name"]: c["count"] for c in client.get("/api/poi/categories", headers=auth_headers).json()}
        assert cats.get("dining") == 2
        assert "food" not in cats
        assert cats.get("water") == 1

    def test_rename_missing_category_is_404(self, client, auth_headers):
        r = client.patch("/api/poi/categories/ghost", json={"new_name": "whatever"}, headers=auth_headers)
        assert r.status_code == 404

    def test_delete_category_resets_to_other(self, client, auth_headers, db):
        user = _current_user(db)
        db.add(POI(user_id=user.id, name="A", lat=1.0, lon=1.0, category="junk", import_name="X"))
        db.commit()

        r = client.delete("/api/poi/categories/junk", headers=auth_headers)
        assert r.status_code == 200

        cats = {c["name"]: c["count"] for c in client.get("/api/poi/categories", headers=auth_headers).json()}
        assert "junk" not in cats
        assert cats.get("other") == 1

    def test_delete_missing_category_is_404(self, client, auth_headers):
        r = client.delete("/api/poi/categories/ghost", headers=auth_headers)
        assert r.status_code == 404

    def test_cannot_delete_other_category(self, client, auth_headers, db):
        user = _current_user(db)
        db.add(POI(user_id=user.id, name="A", lat=1.0, lon=1.0, category="other", import_name="X"))
        db.commit()

        r = client.delete("/api/poi/categories/other", headers=auth_headers)
        assert r.status_code == 400

    def test_create_empty_category(self, client, auth_headers):
        r = client.post("/api/poi/categories", json={"name": "hiking"}, headers=auth_headers)
        assert r.status_code == 201
        assert r.json() == {"name": "hiking", "count": 0}

        cats = {c["name"]: c["count"] for c in client.get("/api/poi/categories", headers=auth_headers).json()}
        assert cats.get("hiking") == 0

    def test_create_duplicate_category_is_409(self, client, auth_headers):
        client.post("/api/poi/categories", json={"name": "hiking"}, headers=auth_headers)
        r = client.post("/api/poi/categories", json={"name": "hiking"}, headers=auth_headers)
        assert r.status_code == 409

    def test_create_category_conflicting_with_used_category_is_409(self, client, auth_headers, db):
        user = _current_user(db)
        db.add(POI(user_id=user.id, name="A", lat=1.0, lon=1.0, category="food", import_name="X"))
        db.commit()

        r = client.post("/api/poi/categories", json={"name": "food"}, headers=auth_headers)
        assert r.status_code == 409

    def test_rename_empty_registered_category(self, client, auth_headers):
        client.post("/api/poi/categories", json={"name": "hiking"}, headers=auth_headers)
        r = client.patch("/api/poi/categories/hiking", json={"new_name": "trekking"}, headers=auth_headers)
        assert r.status_code == 200

        cats = {c["name"]: c["count"] for c in client.get("/api/poi/categories", headers=auth_headers).json()}
        assert "hiking" not in cats
        assert cats.get("trekking") == 0

    def test_delete_empty_registered_category(self, client, auth_headers):
        client.post("/api/poi/categories", json={"name": "hiking"}, headers=auth_headers)
        r = client.delete("/api/poi/categories/hiking", headers=auth_headers)
        assert r.status_code == 200

        cats = {c["name"]: c["count"] for c in client.get("/api/poi/categories", headers=auth_headers).json()}
        assert "hiking" not in cats

    def test_rename_merges_into_existing_target_category(self, client, auth_headers, db):
        # Every account is seeded with "Food" at registration (see auth.py);
        # this merges the lowercase "food" (from KML auto-detect, say) into it.
        user = _current_user(db)
        db.add(POI(user_id=user.id, name="A", lat=1.0, lon=1.0, category="food", import_name="X"))
        db.commit()

        r = client.patch("/api/poi/categories/food", json={"new_name": "Food"}, headers=auth_headers)
        assert r.status_code == 200

        cats = {c["name"]: c["count"] for c in client.get("/api/poi/categories", headers=auth_headers).json()}
        assert cats.get("Food") == 1
        assert "food" not in cats
