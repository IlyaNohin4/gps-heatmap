"""Tests for OsmAnd-style distance waypoint markers on track downloads (all formats)."""
from app.api.tracks import (
    _distance_waypoints,
    _raw_points_to_fit,
    _raw_points_to_geojson,
    _raw_points_to_gpx,
    _raw_points_to_kml,
    _raw_points_to_tcx,
)


def _straight_line_points(n: int, step_deg: float = 0.01, with_time=False):
    """Points along a meridian; 0.01 deg latitude is ~1.11 km."""
    points = []
    for i in range(n):
        p = {"lat": 50.0 + i * step_deg, "lon": 30.0, "elevation": None, "time": None}
        if with_time:
            p["time"] = f"2026-01-01T00:{i:02d}:00Z"
        points.append(p)
    return points


def test_distance_waypoints_empty_for_no_points():
    assert _distance_waypoints([], 5) == []


def test_distance_waypoints_empty_for_zero_interval():
    points = _straight_line_points(5)
    assert _distance_waypoints(points, 0) == []


def test_distance_waypoints_placed_at_intervals():
    # ~22 km total (200 * 0.01deg * ~1.11km/0.01deg)
    points = _straight_line_points(200)
    markers = _distance_waypoints(points, 5)

    assert len(markers) >= 3  # 5, 10, 15 km at least
    names = [m["name"] for m in markers]
    assert names[0] == "5 km"
    assert names[1] == "10 km"
    assert markers[0]["index"] > 0


def test_distance_waypoints_fractional_interval_label():
    points = _straight_line_points(100)
    markers = _distance_waypoints(points, 0.5)
    assert markers[0]["name"] == "0.5 km"


def test_raw_points_to_gpx_includes_waypoints():
    points = _straight_line_points(10)
    waypoints = [{"lat": 50.05, "lon": 30.0, "elevation": 100, "name": "5 km", "index": 5, "time": None}]
    gpx = _raw_points_to_gpx(points, "Test Track", waypoints)

    assert '<wpt lat="50.05" lon="30.0">' in gpx
    assert "<name>5 km</name>" in gpx
    assert gpx.index("<wpt") < gpx.index("<trk>")


def test_raw_points_to_gpx_without_waypoints_has_no_wpt():
    points = _straight_line_points(5)
    gpx = _raw_points_to_gpx(points, "Test Track")
    assert "<wpt" not in gpx


def test_raw_points_to_kml_includes_placemark_points():
    points = _straight_line_points(10)
    waypoints = [{"lat": 50.05, "lon": 30.0, "elevation": 100, "name": "5 km", "index": 5, "time": None}]
    kml = _raw_points_to_kml(points, "Test Track", waypoints)

    assert "<Point><coordinates>30.0,50.05,100</coordinates></Point>" in kml
    assert "<name>5 km</name>" in kml
    # Original track LineString placemark must remain intact
    assert "<LineString>" in kml


def test_raw_points_to_geojson_includes_point_features():
    points = _straight_line_points(10)
    waypoints = [{"lat": 50.05, "lon": 30.0, "elevation": 100, "name": "5 km", "index": 5, "time": None}]
    geo = _raw_points_to_geojson(points, "Test Track", waypoints)

    assert '"type": "Point"' in geo
    assert '"name": "5 km"' in geo


def test_raw_points_to_tcx_includes_course_points():
    points = _straight_line_points(10, with_time=True)
    waypoints = _distance_waypoints(points, 0.5)
    assert waypoints  # sanity: markers were found

    tcx = _raw_points_to_tcx(points, "Test Track", waypoints)

    assert "<Courses>" in tcx
    assert "<CoursePoint>" in tcx
    assert f"<Name>{waypoints[0]['name']}</Name>" in tcx


def test_raw_points_to_tcx_without_waypoints_has_no_courses():
    points = _straight_line_points(5)
    tcx = _raw_points_to_tcx(points, "Test Track")
    assert "<Courses>" not in tcx


def test_raw_points_to_fit_includes_course_points():
    points = _straight_line_points(10, with_time=True)
    waypoints = _distance_waypoints(points, 0.5)
    assert waypoints

    fit_bytes = _raw_points_to_fit(points, "Test Track", waypoints)

    assert isinstance(fit_bytes, bytes)
    assert len(fit_bytes) > 0

    # Round-trip through fit_tool to confirm a valid CoursePointMessage was written
    from fit_tool.fit_file import FitFile
    from fit_tool.profile.messages.course_point_message import CoursePointMessage

    parsed = FitFile.from_bytes(fit_bytes)
    course_points = [
        r.message for r in parsed.records if isinstance(r.message, CoursePointMessage)
    ]
    assert len(course_points) == len(waypoints)
    assert course_points[0].course_point_name == waypoints[0]["name"]
