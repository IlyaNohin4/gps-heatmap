"""Unit tests for parser_factory — no database required."""
import math
from datetime import datetime, timezone

import pytest

from app.services.parser_factory import (
    _build_segments,
    _detect_osmand,
    _haversine,
    _parse_geojson,
    _parse_gpx,
    _parse_kml,
    _parse_tcx,
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
        segs, dist, s_avg, *_ = _build_segments(pts)
        assert dist > 0
        assert s_avg is None
        assert all(seg["speed_kmh"] is None for seg in segs)

    def test_speed_calculation_plausible(self):
        # Two points 1 km apart, 1 minute apart → ~60 km/h
        pts = [self._pt(48.8566, 2.3522, 0), self._pt(48.8656, 2.3522, 1)]
        segs, _, _, s_max, _, _, _ = _build_segments(pts)
        # Not exactly 60 but roughly in that range
        assert 50 < s_max < 80


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
        fit_magic = b"\x0e\x10\x09\x08" + b"\x00" * 100
        assert detect_format(fit_magic) == "fit"

    def test_unknown_raises(self):
        with pytest.raises(ValueError):
            detect_format(b"\x00\x01\x02\x03binary-garbage")


# ── GPX parser ─────────────────────────────────────────────────────────────────

class TestParseGPX:
    def test_returns_expected_keys(self):
        result = _parse_gpx(SIMPLE_GPX)
        for key in ("points", "speed_segments", "distance_km", "speed_avg", "speed_max", "speed_min", "duration_sec", "recorded_at"):
            assert key in result

    def test_point_count(self):
        result = _parse_gpx(SIMPLE_GPX)
        assert len(result["points"]) == 3

    def test_points_have_coords(self):
        result = _parse_gpx(SIMPLE_GPX)
        for pt in result["points"]:
            assert "lat" in pt and "lon" in pt

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
        # OsmAnd 3.x: speed 8.3 m/s → 29.88 km/h; should appear in segments
        assert result["speed_avg"] is not None
        assert 25 < result["speed_avg"] < 35  # 8.3 m/s * 3.6 ≈ 29.88 km/h

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
        # 10.0 m/s * 3.6 = 36.0 km/h
        assert abs(result["speed_avg"] - 36.0) < 0.5

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
        # 50.0 km/h used directly
        assert abs(result["speed_avg"] - 50.0) < 0.5


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
