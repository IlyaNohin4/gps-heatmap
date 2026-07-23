"""Tests for embedding nearby user POIs into track downloads (all formats)."""
from app.api.tracks import (
    _pois_near_track,
    _point_segment_distance_m,
    _project_xy,
    _raw_points_to_fit,
    _raw_points_to_geojson,
    _raw_points_to_gpx,
    _raw_points_to_kml,
    _raw_points_to_tcx,
)
from app.models.poi import POI


def _straight_line_points(n: int, step_deg: float = 0.001, with_time=False):
    """Points along a meridian; 0.001 deg latitude is ~111 m."""
    points = []
    for i in range(n):
        p = {"lat": 50.0 + i * step_deg, "lon": 30.0, "elevation": None, "time": None}
        if with_time:
            p["time"] = f"2026-01-01T00:{i:02d}:00Z"
        points.append(p)
    return points


def _make_poi(lat, lon, name="Test POI"):
    p = POI()
    p.lat = lat
    p.lon = lon
    p.name = name
    return p


def test_point_segment_distance_perpendicular():
    # Segment along the x-axis from (0,0) to (10,0); point directly above its midpoint.
    d = _point_segment_distance_m(5, 3, 0, 0, 10, 0)
    assert d == 3


def test_point_segment_distance_beyond_endpoint_clamped():
    # Point beyond B; distance should be to B, not an infinite line.
    d = _point_segment_distance_m(15, 0, 0, 0, 10, 0)
    assert d == 5


def test_pois_near_track_empty_inputs():
    assert _pois_near_track([], [_make_poi(50, 30)], 100) == []
    assert _pois_near_track(_straight_line_points(5), [], 100) == []
    assert _pois_near_track(_straight_line_points(5), [_make_poi(50, 30)], 0) == []


def test_pois_near_track_finds_close_poi():
    points = _straight_line_points(50)  # ~5.5 km line running north
    # ~50m east of a point roughly in the middle of the line
    close_poi = _make_poi(50.025, 30.0005, name="Close Cafe")
    far_poi = _make_poi(51.5, 35.0, name="Far Away")

    markers = _pois_near_track(points, [close_poi, far_poi], radius_m=100)

    names = [m["name"] for m in markers]
    assert "Close Cafe" in names
    assert "Far Away" not in names


def test_pois_near_track_respects_radius():
    points = _straight_line_points(50)
    poi_150m_away = _make_poi(50.025, 30.00135, name="Medium Distance")  # ~150m east

    assert _pois_near_track(points, [poi_150m_away], radius_m=50) == []
    assert len(_pois_near_track(points, [poi_150m_away], radius_m=200)) == 1


def test_pois_near_track_marker_has_index_and_time():
    points = _straight_line_points(50, with_time=True)
    poi = _make_poi(50.025, 30.0005, name="Close Cafe")

    markers = _pois_near_track(points, [poi], radius_m=100)

    assert len(markers) == 1
    assert markers[0]["index"] is not None
    assert markers[0]["time"] is not None


def test_raw_points_to_gpx_includes_waypoints():
    points = _straight_line_points(10)
    waypoints = [{"lat": 50.005, "lon": 30.0, "elevation": 100, "name": "Cafe", "index": 5, "time": None}]
    gpx = _raw_points_to_gpx(points, "Test Track", waypoints)

    assert '<wpt lat="50.005" lon="30.0">' in gpx
    assert "<name>Cafe</name>" in gpx
    assert gpx.index("<wpt") < gpx.index("<trk>")


def test_raw_points_to_gpx_without_waypoints_has_no_wpt():
    points = _straight_line_points(5)
    gpx = _raw_points_to_gpx(points, "Test Track")
    assert "<wpt" not in gpx


def test_raw_points_to_kml_includes_placemark_points():
    points = _straight_line_points(10)
    waypoints = [{"lat": 50.005, "lon": 30.0, "elevation": 100, "name": "Cafe", "index": 5, "time": None}]
    kml = _raw_points_to_kml(points, "Test Track", waypoints)

    assert "<Point><coordinates>30.0,50.005,100</coordinates></Point>" in kml
    assert "<name>Cafe</name>" in kml
    assert "<LineString>" in kml


def test_raw_points_to_geojson_includes_point_features():
    points = _straight_line_points(10)
    waypoints = [{"lat": 50.005, "lon": 30.0, "elevation": 100, "name": "Cafe", "index": 5, "time": None}]
    geo = _raw_points_to_geojson(points, "Test Track", waypoints)

    assert '"type": "Point"' in geo
    assert '"name": "Cafe"' in geo


def test_raw_points_to_tcx_includes_course_points():
    points = _straight_line_points(50, with_time=True)
    poi = _make_poi(50.025, 30.0005, name="Cafe")
    waypoints = _pois_near_track(points, [poi], radius_m=100)
    assert waypoints

    tcx = _raw_points_to_tcx(points, "Test Track", waypoints)

    assert "<Courses>" in tcx
    assert "<CoursePoint>" in tcx
    assert "<Name>Cafe</Name>" in tcx


def test_raw_points_to_tcx_without_waypoints_has_no_courses():
    points = _straight_line_points(5)
    tcx = _raw_points_to_tcx(points, "Test Track")
    assert "<Courses>" not in tcx


def test_raw_points_to_fit_includes_course_points():
    points = _straight_line_points(50, with_time=True)
    poi = _make_poi(50.025, 30.0005, name="Cafe")
    waypoints = _pois_near_track(points, [poi], radius_m=100)
    assert waypoints

    fit_bytes = _raw_points_to_fit(points, "Test Track", waypoints)

    assert isinstance(fit_bytes, bytes)
    assert len(fit_bytes) > 0

    from fit_tool.fit_file import FitFile
    from fit_tool.profile.messages.course_point_message import CoursePointMessage

    parsed = FitFile.from_bytes(fit_bytes)
    course_points = [
        r.message for r in parsed.records if isinstance(r.message, CoursePointMessage)
    ]
    assert len(course_points) == len(waypoints)
    assert course_points[0].course_point_name == "Cafe"
