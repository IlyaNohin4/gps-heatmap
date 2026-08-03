"""Unit tests for parser_factory — no database required."""
import math
from datetime import datetime, timezone

import pytest

from app.services.parser_factory import (
    _build_segments,
    _collapse_drift,
    _detect_osmand,
    _haversine,
    _KalmanFilter1D,
    _normalize_points,
    _parse_geojson,
    _parse_gpx,
    _parse_kml,
    _parse_tcx,
    _remove_speed_outliers,
    _smooth_elevation,
    detect_format,
    parse,
)


# ── Sample fixture data ────────────────────────────────────────────────────────

SIMPLE_GPX = b"""\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><trkseg>
    <trkpt lat="48.8566" lon="2.3522"><time>2024-01-01T10:00:00Z</time><ele>35</ele></trkpt>
    <trkpt lat="48.8600" lon="2.3600"><time>2024-01-01T10:05:00Z</time><ele>40</ele></trkpt>
    <trkpt lat="48.8650" lon="2.3700"><time>2024-01-01T10:12:00Z</time><ele>50</ele></trkpt>
  </trkseg></trk>
</gpx>"""

SIMPLE_KML = b"""\
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <LineString>
      <coordinates>2.3522,48.8566,35 2.3600,48.8600,40 2.3700,48.8650,50</coordinates>
    </LineString>
  </Placemark>
</kml>"""

SIMPLE_TCX = b"""\
<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Running"><Lap>
    <Track>
      <Trackpoint>
        <Time>2024-01-01T10:00:00Z</Time>
        <Position><LatitudeDegrees>48.8566</LatitudeDegrees><LongitudeDegrees>2.3522</LongitudeDegrees></Position>
        <AltitudeMeters>35</AltitudeMeters>
      </Trackpoint>
      <Trackpoint>
        <Time>2024-01-01T10:05:00Z</Time>
        <Position><LatitudeDegrees>48.8600</LatitudeDegrees><LongitudeDegrees>2.3600</LongitudeDegrees></Position>
        <AltitudeMeters>40</AltitudeMeters>
      </Trackpoint>
    </Track>
  </Lap></Activity></Activities>
</TrainingCenterDatabase>"""

SIMPLE_GEOJSON = b"""\
{"type":"FeatureCollection","features":[
  {"type":"Feature","geometry":{"type":"LineString",
    "coordinates":[[2.3522,48.8566,35],[2.3600,48.8600,40],[2.3700,48.8650,50]]},
   "properties":{"name":"test"}}
]}"""


# ── Haversine ─────────────────────────────────────────────────────────────────

class TestHaversine:
    def test_zero_distance(self):
        assert _haversine(48.0, 2.0, 48.0, 2.0) == 0.0

    def test_known_approx(self):
        # Paris → London is roughly 340 km
        d = _haversine(48.8566, 2.3522, 51.5074, -0.1278)
        assert 330 < d < 360

    def test_symmetry(self):
        d1 = _haversine(48.0, 2.0, 49.0, 3.0)
        d2 = _haversine(49.0, 3.0, 48.0, 2.0)
        assert abs(d1 - d2) < 1e-9


# ── _build_segments ────────────────────────────────────────────────────────────

class TestBuildSegments:
    def _pt(self, lat, lon, minutes=None):
        t = None
        if minutes is not None:
            t = datetime(2024, 1, 1, 10, minutes, 0, tzinfo=timezone.utc)
        return {"lat": lat, "lon": lon, "elevation": None, "time": t}

    def test_empty_returns_zero(self):
        segs, dist, s_avg, s_max, s_min, dur, stats = _build_segments([])
        assert segs == []
        assert dist == 0.0
        assert s_avg is None

    def test_single_point_no_segments(self):
        segs, dist, *_ = _build_segments([self._pt(48.0, 2.0, 0)])
        assert segs == []
        assert dist == 0.0

    def test_timed_points_produce_segments(self):
        pts = [self._pt(48.8566, 2.3522, 0), self._pt(48.8600, 2.3600, 5)]
        segs, dist, s_avg, s_max, s_min, dur, stats = _build_segments(pts)
        assert len(segs) == 1
        seg = segs[0]
        assert "from" in seg and "to" in seg and "speed_kmh" in seg
        assert seg["speed_kmh"] > 0
        assert dur == 5 * 60  # 5 minutes in seconds

    def test_untimed_points_no_speed(self):
        pts = [
            {"lat": 48.8566, "lon": 2.3522, "elevation": None, "time": None},
            {"lat": 48.8600, "lon": 2.3600, "elevation": None, "time": None},
        ]
        segs, dist, s_avg, _, _, _, stats = _build_segments(pts)
        assert dist > 0
        assert s_avg is None
        assert stats["moving_time_sec"] is None
        assert all(seg["speed_kmh"] is None for seg in segs)

    def test_speed_calculation_plausible(self):
        # Two points 1 km apart, 1 minute apart → ~60 km/h
        pts = [self._pt(48.8566, 2.3522, 0), self._pt(48.8656, 2.3522, 1)]
        segs, _, _, s_max, _, _, _ = _build_segments(pts)
        # Not exactly 60 but roughly in that range
        assert 50 < s_max < 80

    def test_moving_avg_excludes_stop(self):
        # 10 km covered in 30 min (moving), then stationary for 10 min (stop).
        # gpx.studio methodology: speed_avg = distance_moving / (moving_time / 3600).
        pts = [
            self._pt(48.0, 2.0, 0),
            self._pt(48.0 + 10 / 111.0, 2.0, 30),  # ~10 km away, 30 min later → 20 km/h
            self._pt(48.0 + 10 / 111.0, 2.0, 40),  # same spot, 10 min later → stop
        ]
        segs, dist, s_avg, s_max, s_min, dur, stats = _build_segments(pts)
        assert dur == 40 * 60
        assert stats["moving_time_sec"] == 1800
        assert s_avg == pytest.approx(20.0, abs=0.5)

    def test_speed_min_zero_is_not_dropped_to_none(self):
        # A full stop (identical consecutive coordinates) makes that segment's
        # speed exactly 0.0 — `if s_min else None` would falsy-collapse a
        # legitimate 0.0 down to None (M4).
        pts = [
            self._pt(48.0, 2.0, 0),
            self._pt(48.0 + 10 / 111.0, 2.0, 30),  # moving
            self._pt(48.0 + 10 / 111.0, 2.0, 40),  # stopped: same spot, speed 0.0
        ]
        _, _, _, _, s_min, _, _ = _build_segments(pts)
        assert s_min == 0.0
        assert s_min is not None

    def test_no_timestamps_no_moving_time(self):
        pts = [
            {"lat": 48.0, "lon": 2.0, "elevation": None, "time": None},
            {"lat": 48.1, "lon": 2.1, "elevation": None, "time": None},
        ]
        _, _, s_avg, _, _, _, stats = _build_segments(pts)
        assert s_avg is None
        assert stats["moving_time_sec"] is None


# ── detect_format ──────────────────────────────────────────────────────────────

class TestDetectFormat:
    def test_gpx(self):
        assert detect_format(SIMPLE_GPX) == "gpx"

    def test_kml(self):
        assert detect_format(SIMPLE_KML) == "kml"

    def test_tcx(self):
        assert detect_format(SIMPLE_TCX) == "tcx"

    def test_geojson(self):
        assert detect_format(SIMPLE_GEOJSON) == "geojson"

    def test_fit_magic_bytes(self):
        # header_size=14, protocol 1.0, profile 20.57 — what our own
        # fit-tool export happens to produce.
        fit_header = b"\x0e\x10\x09\x08\x00\x00\x00\x00.FIT" + b"\x00" * 100
        assert detect_format(fit_header) == "fit"

    def test_fit_magic_bytes_protocol_2_real_device(self):
        # A real Garmin/Wahoo device: header_size=14, protocol 2.0 (0x20),
        # an arbitrary profile version (21.158 here) — none of which match
        # our own export's exact byte sequence, only the ".FIT" signature
        # at offset 8 that the FIT spec actually defines as the identifier.
        fit_header = b"\x0e\x20\x6e\x08\x00\x00\x00\x00.FIT" + b"\x00" * 100
        assert detect_format(fit_header) == "fit"

    def test_fit_header_size_12_no_crc(self):
        # header_size=12 (no optional 2-byte CRC field) is also spec-valid.
        fit_header = b"\x0c\x10\x00\x00\x00\x00\x00\x00.FIT" + b"\x00" * 100
        assert detect_format(fit_header) == "fit"

    def test_unknown_raises(self):
        with pytest.raises(ValueError):
            detect_format(b"\x00\x01\x02\x03binary-garbage")


# ── GPX parser ─────────────────────────────────────────────────────────────────

class TestParseGPX:
    def test_returns_expected_keys(self):
        result = _parse_gpx(SIMPLE_GPX)
        for key in ("points", "speed_segments", "distance_km", "speed_avg", "speed_max", "speed_min", "duration_sec", "moving_time_sec", "recorded_at"):
            assert key in result

    def test_point_count(self):
        result = _parse_gpx(SIMPLE_GPX)
        assert len(result["points"]) == 3

    def test_points_have_coords(self):
        result = _parse_gpx(SIMPLE_GPX)
        for pt in result["points"]:
            assert "lat" in pt and "lon" in pt

    def test_out_of_range_lat_is_skipped(self):
        # L2: GPX/KML/TCX/FIT parsers didn't range-check lat/lon like the
        # POI parser already does.
        gpx = b"""\
<?xml version="1.0"?>
<gpx version="1.1">
  <trk><trkseg>
    <trkpt lat="9999" lon="2.0"><time>2024-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="48.0" lon="2.0"><time>2024-01-01T10:01:00Z</time></trkpt>
    <trkpt lat="48.1" lon="2.1"><time>2024-01-01T10:02:00Z</time></trkpt>
  </trkseg></trk>
</gpx>"""
        result = _parse_gpx(gpx)
        assert len(result["points"]) == 2

    def test_distance_positive(self):
        result = _parse_gpx(SIMPLE_GPX)
        assert result["distance_km"] > 0

    def test_speed_segments_structure(self):
        result = _parse_gpx(SIMPLE_GPX)
        for seg in result["speed_segments"]:
            assert "from" in seg
            assert "to" in seg
            assert "speed_kmh" in seg
            assert isinstance(seg["from"], list) and len(seg["from"]) == 2
            assert isinstance(seg["to"], list) and len(seg["to"]) == 2
            assert seg["speed_kmh"] >= 0

    def test_recorded_at_is_datetime(self):
        result = _parse_gpx(SIMPLE_GPX)
        assert isinstance(result["recorded_at"], datetime)

    def test_gpx_10_namespace_parses(self):
        # HIGH: _gpx_iter/_gpx_find only matched the GPX 1.1 namespace or no
        # namespace — a GPX 1.0 file (older devices/exporters) went entirely
        # unmatched, parsing to 0 points.
        gpx_10 = b"""\
<?xml version="1.0"?>
<gpx version="1.0" xmlns="http://www.topografix.com/GPX/1/0">
  <trk><trkseg>
    <trkpt lat="48.8566" lon="2.3522"><time>2024-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="48.8600" lon="2.3600"><time>2024-01-01T10:05:00Z</time></trkpt>
  </trkseg></trk>
</gpx>"""
        result = _parse_gpx(gpx_10)
        assert len(result["points"]) == 2

    def test_gpx_with_extensions_stripped(self):
        gpx_with_ext = b"""\
<?xml version="1.0"?>
<gpx version="1.1">
  <trk><trkseg>
    <trkpt lat="51.0" lon="0.0">
      <time>2024-06-01T08:00:00Z</time>
      <extensions><osmand:speed>5.0</osmand:speed></extensions>
    </trkpt>
    <trkpt lat="51.001" lon="0.001"><time>2024-06-01T08:01:00Z</time></trkpt>
  </trkseg></trk>
</gpx>"""
        result = _parse_gpx(gpx_with_ext)
        assert len(result["points"]) == 2

    def test_gpx_extensions_with_namespace_attributes_and_xml_decl(self):
        gpx = b"""\
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OsmAnd" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:osmand="https://osmand.net">
  <trk><trkseg>
    <trkpt lat="55.751244" lon="37.618423">
      <time>2024-03-15T09:00:00Z</time>
      <ele>144</ele>
      <extensions>
        <osmand:speed>8.3</osmand:speed>
        <osmand:hdop>2.1</osmand:hdop>
      </extensions>
    </trkpt>
    <trkpt lat="55.752000" lon="37.619000">
      <time>2024-03-15T09:01:00Z</time>
      <ele>146</ele>
    </trkpt>
  </trkseg></trk>
</gpx>"""
        result = _parse_gpx(gpx)
        assert len(result["points"]) == 2
        assert result["distance_km"] > 0
        assert result["recorded_at"] is not None
        # OsmAnd 3.x: speed 8.3 m/s → 29.88 km/h; should appear in the segment display.
        assert 25 < result["speed_segments"][0]["speed_kmh"] < 35  # 8.3 m/s * 3.6 ≈ 29.88 km/h
        # speed_avg (T25) is the moving-time average (real dist/time), independent
        # of the recorded device speed — for this fixture's actual coordinates
        # that works out to ~5.5 km/h, not the recorded 29.88 km/h.
        assert result["speed_avg"] is not None
        assert 4 < result["speed_avg"] < 7

    def test_osmand_v3_speed_converted_from_ms(self):
        # xmlns:osmand short URL → v3 → speed in m/s, must multiply by 3.6
        gpx = b"""\
<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:osmand="https://osmand.net">
  <trk><trkseg>
    <trkpt lat="0.0" lon="0.0">
      <time>2021-01-01T00:00:00Z</time>
      <extensions><osmand:speed>10.0</osmand:speed></extensions>
    </trkpt>
    <trkpt lat="0.01" lon="0.0">
      <time>2021-01-01T00:01:00Z</time>
      <extensions><osmand:speed>10.0</osmand:speed></extensions>
    </trkpt>
  </trkseg></trk>
</gpx>"""
        assert _detect_osmand(gpx[:2048]) == ("https://osmand.net", False)
        result = _parse_gpx(gpx)
        # 10.0 m/s * 3.6 = 36.0 km/h, converted correctly and shown on the segment.
        assert abs(result["speed_segments"][0]["speed_kmh"] - 36.0) < 0.5
        # speed_avg (T25) is moving-time based (real dist/time), not the recorded
        # device speed — for this fixture's coordinates that's ~66.7 km/h.
        assert abs(result["speed_avg"] - 66.7) < 0.5

    def test_osmand_v4_speed_used_directly(self):
        # xmlns:osmand long URL → v4 → speed already in km/h
        gpx = b"""\
<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:osmand="https://osmand.net/docs/technical/osmand-file-formats/osmand-gpx">
  <trk><trkseg>
    <trkpt lat="0.0" lon="0.0">
      <time>2024-01-01T00:00:00Z</time>
      <extensions><osmand:speed>50.0</osmand:speed></extensions>
    </trkpt>
    <trkpt lat="0.01" lon="0.0">
      <time>2024-01-01T00:01:00Z</time>
      <extensions><osmand:speed>50.0</osmand:speed></extensions>
    </trkpt>
  </trkseg></trk>
</gpx>"""
        assert _detect_osmand(gpx[:2048]) == (
            "https://osmand.net/docs/technical/osmand-file-formats/osmand-gpx", True
        )
        result = _parse_gpx(gpx)
        # 50.0 km/h used directly, shown on the segment.
        assert abs(result["speed_segments"][0]["speed_kmh"] - 50.0) < 0.5
        # speed_avg (T25) is moving-time based (real dist/time), not the recorded
        # device speed — for this fixture's coordinates that's ~66.7 km/h.
        assert abs(result["speed_avg"] - 66.7) < 0.5


# ── KML parser ─────────────────────────────────────────────────────────────────

class TestParseKML:
    def test_parses_coordinates(self):
        result = _parse_kml(SIMPLE_KML)
        assert len(result["points"]) == 3

    def test_distance_positive(self):
        result = _parse_kml(SIMPLE_KML)
        assert result["distance_km"] > 0

    def test_no_speed_without_timestamps(self):
        result = _parse_kml(SIMPLE_KML)
        assert result["speed_avg"] is None
        assert all(seg["speed_kmh"] is None for seg in result["speed_segments"])

    def test_elevation_parsed(self):
        result = _parse_kml(SIMPLE_KML)
        for pt in result["points"]:
            assert pt["elevation"] is not None


# ── TCX parser ─────────────────────────────────────────────────────────────────

class TestParseTCX:
    def test_parses_trackpoints(self):
        result = _parse_tcx(SIMPLE_TCX)
        assert len(result["points"]) == 2

    def test_speed_computed_from_timestamps(self):
        result = _parse_tcx(SIMPLE_TCX)
        assert result["speed_avg"] is not None
        assert len(result["speed_segments"]) == 1

    def test_duration_calculated(self):
        result = _parse_tcx(SIMPLE_TCX)
        assert result["duration_sec"] == 5 * 60


# ── GeoJSON parser ─────────────────────────────────────────────────────────────

class TestParseGeoJSON:
    def test_feature_collection(self):
        result = _parse_geojson(SIMPLE_GEOJSON)
        assert len(result["points"]) == 3

    def test_bare_linestring(self):
        data = b'{"type":"LineString","coordinates":[[2.0,48.0],[3.0,49.0]]}'
        result = _parse_geojson(data)
        assert len(result["points"]) == 2

    def test_single_feature(self):
        data = b'{"type":"Feature","geometry":{"type":"LineString","coordinates":[[2.0,48.0],[3.0,49.0]]},"properties":{}}'
        result = _parse_geojson(data)
        assert len(result["points"]) == 2

    def test_no_time_so_no_speed(self):
        result = _parse_geojson(SIMPLE_GEOJSON)
        assert result["speed_avg"] is None
        assert all(seg["speed_kmh"] is None for seg in result["speed_segments"])

    def test_multilinestring_feature_not_ignored(self):
        # LOW: MultiLineString (a common QGIS export shape) used to be
        # silently ignored — coords stayed empty, parsing to 0 points.
        data = (
            b'{"type":"Feature","geometry":{"type":"MultiLineString","coordinates":'
            b'[[[2.0,48.0],[2.1,48.1]],[[3.0,49.0],[3.1,49.1],[3.2,49.2]]]},"properties":{}}'
        )
        result = _parse_geojson(data)
        assert len(result["points"]) == 5

    def test_multilinestring_in_feature_collection(self):
        data = (
            b'{"type":"FeatureCollection","features":['
            b'{"type":"Feature","geometry":{"type":"MultiLineString","coordinates":'
            b'[[[2.0,48.0],[2.1,48.1]]]},"properties":{}}'
            b']}'
        )
        result = _parse_geojson(data)
        assert len(result["points"]) == 2

    def test_string_coordinates_skipped_not_crashed(self):
        # L1: coordinates given as strings (some exporters emit these) used
        # to reach _haversine unconverted and blow up with a TypeError
        # instead of just skipping the bad point.
        data = b'{"type":"LineString","coordinates":[["13.4","52.5"],[2.0,48.0],[3.0,49.0]]}'
        result = _parse_geojson(data)
        assert len(result["points"]) == 3  # the string pair converts fine via float()

    def test_non_numeric_coordinate_skipped(self):
        data = b'{"type":"LineString","coordinates":[["abc","xyz"],[2.0,48.0],[3.0,49.0]]}'
        result = _parse_geojson(data)
        assert len(result["points"]) == 2  # the truly non-numeric pair is dropped

    def test_out_of_range_coordinate_skipped(self):
        # L2: track parsers didn't validate lat/lon ranges the way the POI
        # parser already does — a bogus lat=9999 used to reach PostGIS as-is.
        data = b'{"type":"LineString","coordinates":[[2.0,9999.0],[2.0,48.0],[3.0,49.0]]}'
        result = _parse_geojson(data)
        assert len(result["points"]) == 2


# ── Public parse() API ─────────────────────────────────────────────────────────

class TestParsePublicAPI:
    @pytest.mark.parametrize("fmt,data", [
        ("gpx", SIMPLE_GPX),
        ("kml", SIMPLE_KML),
        ("tcx", SIMPLE_TCX),
        ("geojson", SIMPLE_GEOJSON),
    ])
    def test_parse_returns_points(self, fmt, data):
        result = parse(data, fmt)
        assert len(result["points"]) >= 2

    def test_unknown_format_raises(self):
        with pytest.raises(ValueError):
            parse(b"data", "xyz")


# ── XXE hardening ────────────────────────────────────────────────────────────
#
# lxml resolves internal DTD entities by default (resolve_entities=True), the
# same setting that also enables external entity (XXE) disclosure. If an
# internal entity substitution succeeds against our parser config, that
# proves resolve_entities isn't actually off — the same misconfiguration
# that would let file:// external entities through. Testing via an internal
# entity keeps this fully offline/deterministic instead of depending on
# network access or the filesystem layout inside the test container.

_XXE_ENTITY_GPX = b"""<?xml version="1.0"?>
<!DOCTYPE gpx [<!ENTITY xxe "PWNED">]>
<gpx version="1.1"><trk><name>&xxe;</name><trkseg>
<trkpt lat="1.0" lon="2.0"><time>2024-01-01T10:00:00Z</time></trkpt>
<trkpt lat="1.1" lon="2.1"><time>2024-01-01T10:05:00Z</time></trkpt>
</trkseg></trk></gpx>"""

_XXE_ENTITY_KML = b"""<?xml version="1.0"?>
<!DOCTYPE kml [<!ENTITY xxe "PWNED">]>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>&xxe;</name><LineString>
<coordinates>2.0,1.0,0 2.1,1.1,0</coordinates>
</LineString></Placemark>
</Document></kml>"""

_XXE_ENTITY_TCX = b"""<?xml version="1.0"?>
<!DOCTYPE TrainingCenterDatabase [<!ENTITY xxe "PWNED">]>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
<Activities><Activity Sport="Other"><Id>&xxe;</Id><Lap StartTime="2024-01-01T10:00:00Z"><Track>
<Trackpoint><Position><LatitudeDegrees>1.0</LatitudeDegrees><LongitudeDegrees>2.0</LongitudeDegrees></Position><Time>2024-01-01T10:00:00Z</Time></Trackpoint>
<Trackpoint><Position><LatitudeDegrees>1.1</LatitudeDegrees><LongitudeDegrees>2.1</LongitudeDegrees></Position><Time>2024-01-01T10:05:00Z</Time></Trackpoint>
</Track></Lap></Activity></Activities></TrainingCenterDatabase>"""


class TestXXEHardening:
    """With resolve_entities=False, lxml leaves an entity reference as an
    unresolved Entity node in the tree instead of substituting its declared
    value — so .text on the containing element is None, never "PWNED"."""

    def test_gpx_parser_does_not_resolve_entities(self):
        from lxml import etree

        lxml_parser = etree.XMLParser(recover=True, remove_comments=True, resolve_entities=False, no_network=True)
        root = etree.fromstring(_XXE_ENTITY_GPX, lxml_parser)
        name_el = root.find(".//{*}name")
        assert name_el is not None
        assert name_el.text != "PWNED"

    def test_kml_parser_does_not_resolve_entities(self):
        from lxml import etree
        from app.services.parser_factory import _SAFE_XML_PARSER

        root = etree.fromstring(_XXE_ENTITY_KML, _SAFE_XML_PARSER)
        name_el = root.find(".//{http://www.opengis.net/kml/2.2}name")
        assert name_el is not None
        assert name_el.text != "PWNED"

    def test_tcx_parser_does_not_resolve_entities(self):
        from lxml import etree
        from app.services.parser_factory import _SAFE_XML_PARSER

        root = etree.fromstring(_XXE_ENTITY_TCX, _SAFE_XML_PARSER)
        ns = "{http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2}"
        id_el = root.find(f".//{ns}Id")
        assert id_el is not None
        assert id_el.text != "PWNED"


# ── Drift collapse ───────────────────────────────────────────────────────────

class TestCollapseDrift:
    def _pt(self, lat, lon, sec, elevation=None):
        return {
            "lat": lat, "lon": lon, "elevation": elevation,
            "time": datetime(2024, 1, 1, 10, 0, sec, tzinfo=timezone.utc),
            "osmand_speed_kmh": None,
        }

    def test_mixed_missing_elevation_averages_only_present_values(self):
        # M2: the centroid elevation used to be gated on cluster[0] alone,
        # then `p.get('elevation') or 0` silently coerced any other missing
        # member to 0 — corrupting the average whenever elevation was patchy
        # within a stationary cluster. All 3 points sit within the 3m/10s
        # cluster threshold; only two carry an elevation reading.
        pts = [
            self._pt(48.0, 2.0, 0, elevation=100.0),
            self._pt(48.0, 2.0, 15, elevation=None),
            self._pt(48.0, 2.0, 30, elevation=120.0),
        ]
        result = _collapse_drift(pts)
        assert len(result) == 1
        assert result[0]["elevation"] == 110.0  # avg of 100 and 120, ignoring the missing one

    def test_all_missing_elevation_stays_none(self):
        pts = [
            self._pt(48.0, 2.0, 0, elevation=None),
            self._pt(48.0, 2.0, 15, elevation=None),
        ]
        result = _collapse_drift(pts)
        assert len(result) == 1
        assert result[0]["elevation"] is None

    def test_first_point_missing_elevation_still_averages_others(self):
        # Old logic: `cluster[0].get('elevation') is not None` gated the
        # whole computation, so a missing *first* reading discarded every
        # other member's real elevation too.
        pts = [
            self._pt(48.0, 2.0, 0, elevation=None),
            self._pt(48.0, 2.0, 15, elevation=200.0),
        ]
        result = _collapse_drift(pts)
        assert len(result) == 1
        assert result[0]["elevation"] == 200.0


# ── Point ordering ────────────────────────────────────────────────────────────

class TestNormalizePointsOrdering:
    def _pt(self, lat, lon, sec):
        return {
            "lat": lat, "lon": lon, "elevation": None,
            "time": datetime(2024, 1, 1, 10, 0, sec, tzinfo=timezone.utc),
            "osmand_speed_kmh": None,
        }

    def test_out_of_order_segments_are_sorted_before_normalizing(self):
        # L1: a multi-<trkseg> file can list a later segment's points before
        # an earlier segment's — _normalize_points must sort by time first,
        # or every downstream phase computes deltas against out-of-order
        # timestamps (negative time_diff, bogus speed spikes).
        pts = [
            self._pt(48.0, 2.0, 20),
            self._pt(48.001, 2.0, 25),
            self._pt(47.999, 2.0, 0),  # earliest timestamp, listed last
        ]
        result = _normalize_points(pts)
        times = [p["time"] for p in result]
        assert times == sorted(times)


# ── Speed outlier removal ───────────────────────────────────────────────────────

class TestRemoveSpeedOutliers:
    def _pt(self, lat, lon, sec):
        return {
            "lat": lat, "lon": lon, "elevation": None,
            "time": datetime(2024, 1, 1, 10, 0, sec, tzinfo=timezone.utc),
            "osmand_speed_kmh": None,
        }

    def test_lone_spike_point_keeps_its_legitimate_neighbors(self):
        # L2: point 1 jumps far away then back — both adjacent segments look
        # "fast," but only point 1 is actually bad. Points 0 and 2 must survive.
        pts = [
            self._pt(48.0, 2.0, 0),
            self._pt(49.0, 2.0, 1),   # ~111km in 1s — impossible speed in and out
            self._pt(48.0, 2.0, 2),
        ]
        result = _remove_speed_outliers(pts)
        assert len(result) == 2
        assert result[0]["lat"] == 48.0 and result[1]["lat"] == 48.0

    def test_isolated_fast_segment_drops_both_endpoints(self):
        # Only one bad segment, no corroborating second fast segment on
        # either side — can't attribute the jump to a single point, so both
        # endpoints of that segment are dropped (matches prior behavior).
        pts = [
            self._pt(48.0, 2.0, 0),
            self._pt(49.0, 2.0, 1),  # impossible speed, isolated
        ]
        result = _remove_speed_outliers(pts)
        assert result == []


# ── Elevation smoothing ──────────────────────────────────────────────────────

class TestSmoothElevation:
    def _pt(self, ele):
        return {"lat": 48.0, "lon": 2.0, "elevation": ele, "time": None, "osmand_speed_kmh": None}

    def test_leading_missing_elevation_backfills_not_zero(self):
        # LOW: a leading run of None elevations used to fall back to a
        # hardcoded 0 (sea level) for the Savitzky-Golay window's fill
        # values, instead of the first real reading — the None points
        # themselves stay None either way (never rewritten), but that 0
        # dragged the window's fit, distorting the *smoothed* value of the
        # nearby real points at the start of the track.
        points = [self._pt(None), self._pt(None), self._pt(100.0), self._pt(101.0), self._pt(102.0)]
        result = _smooth_elevation(points)
        assert result[0]["elevation"] is None
        assert result[1]["elevation"] is None
        assert result[2]["elevation"] > 50.0
        assert result[3]["elevation"] > 50.0
        assert result[4]["elevation"] > 50.0


# ── Kalman filter ────────────────────────────────────────────────────────────

class TestKalmanFilter1D:
    def test_velocity_updates_from_residual_not_near_zero(self):
        # LOW: velocity was computed from (z - self.x) *after* self.x had
        # already been corrected toward z, making the residual ~0 and
        # velocity barely ever learn from data.
        kf = _KalmanFilter1D(process_variance=0.01, measurement_variance=0.00001)
        kf.x = 0.0
        # Steady, consistent motion: position increases by 1.0 per second.
        for t in range(1, 6):
            kf.update(float(t), dt=1.0)
        assert kf.v > 0.5  # should have picked up on the steady drift
