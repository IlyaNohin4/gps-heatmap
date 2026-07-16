"""T28 — Track Creator export formats (_points_to_gpx/kml/tcx/fit).

These are pure functions (no DB), so tested directly rather than through
POST /api/tracks/create — matches the create_track validation (points need
lat/lon only, no elevation/time available for a drawn track).
"""
import datetime

from lxml import etree

from app.api.tracks import Point, _points_to_fit, _points_to_gpx, _points_to_kml, _points_to_tcx

POINTS = [Point(lat=55.0, lon=37.0), Point(lat=55.001, lon=37.001), Point(lat=55.002, lon=37.002)]


def test_gpx_escapes_coordinates():
    xml = _points_to_gpx(POINTS)
    root = etree.fromstring(xml.encode("utf-8"))
    assert root is not None


def test_kml_escapes_coordinates():
    xml = _points_to_kml(POINTS)
    root = etree.fromstring(xml.encode("utf-8"))
    assert root is not None


class TestTcxExport:
    def test_no_hardcoded_date(self):
        xml = _points_to_tcx(POINTS)
        assert "2024-01-01" not in xml

    def test_time_reflects_export_time(self):
        before = datetime.datetime.now(datetime.timezone.utc)
        xml = _points_to_tcx(POINTS)
        after = datetime.datetime.now(datetime.timezone.utc)

        root = etree.fromstring(xml.encode("utf-8"))
        ns = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}
        times = [
            datetime.datetime.strptime(el.text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
            for el in root.findall(".//tcx:Trackpoint/tcx:Time", ns)
        ]
        assert len(times) == len(POINTS)
        assert times == sorted(times)
        assert before - datetime.timedelta(seconds=1) <= times[0] <= after + datetime.timedelta(seconds=len(POINTS) + 1)

    def test_no_fake_altitude(self):
        xml = _points_to_tcx(POINTS)
        assert "AltitudeMeters" not in xml

    def test_is_well_formed_xml(self):
        xml = _points_to_tcx(POINTS)
        root = etree.fromstring(xml.encode("utf-8"))
        ns = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}
        assert len(root.findall(".//tcx:Trackpoint", ns)) == len(POINTS)


class TestFitExport:
    def test_produces_valid_fit_binary(self):
        from fit_tool.fit_file import FitFile

        data = _points_to_fit(POINTS)
        assert data[8:12] == b".FIT"

        # Round-trips through fit-tool's own decoder, which validates the
        # CRC and message definitions — the old hand-rolled binary could not
        # do this at all.
        parsed = FitFile.from_bytes(data, check_crc=True)
        assert len(parsed.records) > 0

    def test_record_messages_match_points(self):
        from fit_tool.fit_file import FitFile
        from fit_tool.profile.messages.record_message import RecordMessage

        data = _points_to_fit(POINTS)
        parsed = FitFile.from_bytes(data)
        record_messages = [
            r.message for r in parsed.records
            if not r.is_definition and isinstance(r.message, RecordMessage)
        ]
        assert len(record_messages) == len(POINTS)
        for record, point in zip(record_messages, POINTS):
            # FIT stores lat/lon as 32-bit semicircles - tiny precision loss is expected.
            assert record.position_lat == point.lat or abs(record.position_lat - point.lat) < 1e-4
            assert record.position_long == point.lon or abs(record.position_long - point.lon) < 1e-4
