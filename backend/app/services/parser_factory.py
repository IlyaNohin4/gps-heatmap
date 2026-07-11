"""Parse GPS track files into a unified list of point dicts.

Each point: {"lat": float, "lon": float, "elevation": float|None, "time": datetime|None}
Returns also speed_segments computed from osmand:speed extensions when available
(with automatic m/s→km/h conversion for OsmAnd 3.x), falling back to Haversine.
"""

import json
import math
from datetime import datetime, timezone
from typing import Any, Optional

from lxml import etree
from scipy.signal import savgol_filter

import statistics

# ── Haversine ─────────────────────────────────────────────────────────────────

_EARTH_R = 6371.0  # km


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in km between two WGS-84 points."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_R * math.asin(math.sqrt(a))


# ── Normalization ──────────────────────────────────────────────────────────────

class _KalmanFilter1D:
    """1D Kalman filter for independent lat/lon smoothing."""

    def __init__(self, process_variance: float = 0.01, measurement_variance: float = 0.00001):
        self.Q = process_variance
        self.R = measurement_variance
        self.x = 0.0  # position estimate
        self.v = 0.0  # velocity estimate
        self.P = 1.0  # estimation error

    def update(self, z: float, dt: float) -> float:
        """Update with new measurement, return filtered position."""
        dt = max(dt, 0.01)  # Avoid division by zero

        # Predict
        self.x = self.x + self.v * dt
        self.P = self.P + self.Q

        # Update
        K = self.P / (self.P + self.R)  # Kalman gain
        self.x = self.x + K * (z - self.x)
        self.v = self.v + K * (z - self.x) / dt if dt > 0 else self.v
        self.P = (1 - K) * self.P

        return self.x


def _collapse_drift(points: list[dict], distance_threshold: float = 3.0, time_threshold: int = 10) -> list[dict]:
    """Cluster stationary points (GPS drift during pause) into single point."""
    if len(points) < 2:
        return points

    result = []
    i = 0

    while i < len(points):
        cluster = [points[i]]
        j = i + 1

        # Gather nearby points
        while j < len(points):
            dist = _haversine(points[i]['lat'], points[i]['lon'], points[j]['lat'], points[j]['lon']) * 1000  # to meters
            time_diff = (points[j]['time'] - points[i]['time']).total_seconds() if points[j]['time'] and points[i]['time'] else 0

            if dist < distance_threshold and time_diff >= time_threshold:
                cluster.append(points[j])
                j += 1
            else:
                break

        if len(cluster) > 1:
            # Replace cluster with centroid
            avg_lat = sum(p['lat'] for p in cluster) / len(cluster)
            avg_lon = sum(p['lon'] for p in cluster) / len(cluster)
            avg_ele = sum(p.get('elevation') or 0 for p in cluster) / len(cluster) if cluster[0].get('elevation') else None

            result.append({
                'lat': avg_lat,
                'lon': avg_lon,
                'elevation': avg_ele,
                'time': cluster[0]['time'],
                'osmand_speed_kmh': cluster[0].get('osmand_speed_kmh')
            })
            i = j
        else:
            result.append(points[i])
            i += 1

    return result


def _remove_speed_outliers(points: list[dict], max_speed_kmh: float = 200) -> list[dict]:
    """Remove points with impossible speed > max_speed_kmh."""
    if len(points) < 2:
        return points

    outlier_indices = set()

    for i in range(len(points) - 1):
        p0, p1 = points[i], points[i + 1]
        if not (p0['time'] and p1['time']):
            continue

        dist_km = _haversine(p0['lat'], p0['lon'], p1['lat'], p1['lon'])
        time_diff = (p1['time'] - p0['time']).total_seconds()

        if time_diff > 0:
            speed_kmh = dist_km / (time_diff / 3600)

            if speed_kmh > max_speed_kmh:
                outlier_indices.add(i)
                outlier_indices.add(i + 1)

    return [p for i, p in enumerate(points) if i not in outlier_indices]


def _apply_kalman_filter(points: list[dict], process_variance: float = 0.01, measurement_variance: float = 0.00001) -> list[dict]:
    """Apply Kalman filter to smooth lat/lon independently."""
    if len(points) < 2:
        return points

    kf_lat = _KalmanFilter1D(process_variance, measurement_variance)
    kf_lon = _KalmanFilter1D(process_variance, measurement_variance)

    # Initialize
    kf_lat.x = points[0]['lat']
    kf_lon.x = points[0]['lon']

    result = []
    prev_time = points[0]['time']

    for point in points:
        if prev_time and point['time']:
            dt = (point['time'] - prev_time).total_seconds()
        else:
            dt = 0.1

        filtered_lat = kf_lat.update(point['lat'], dt)
        filtered_lon = kf_lon.update(point['lon'], dt)

        result.append({
            'lat': filtered_lat,
            'lon': filtered_lon,
            'elevation': point.get('elevation'),
            'time': point['time'],
            'osmand_speed_kmh': point.get('osmand_speed_kmh')
        })

        prev_time = point['time']

    return result


def _smooth_elevation(points: list[dict], window: int = 5, polyorder: int = 2) -> list[dict]:
    """Apply Savitzky-Golay filter to elevation data.

    Removes GPS noise from elevation while preserving peaks and valleys.

    Args:
        points: list of point dicts with 'elevation' field
        window: filter window size (must be odd, default 5)
        polyorder: polynomial order (default 2)

    Returns:
        Points with smoothed elevation
    """
    if len(points) < 3:
        return points

    # Extract elevations
    elevations = [p.get('elevation') for p in points]

    # If no elevations or too many missing, skip smoothing
    if not elevations or elevations.count(None) > len(elevations) * 0.5:
        return points

    # Handle missing elevations: interpolate with neighbors
    filled_ele = []
    for i, ele in enumerate(elevations):
        if ele is None:
            # Try to interpolate from neighbors
            if i > 0 and filled_ele:
                filled_ele.append(filled_ele[-1])
            elif i < len(elevations) - 1 and elevations[i + 1] is not None:
                filled_ele.append(elevations[i + 1])
            else:
                filled_ele.append(0)
        else:
            filled_ele.append(ele)

    # Ensure window is odd and not larger than data
    window = min(window, len(filled_ele))
    if window % 2 == 0:
        window -= 1
    if window < 3:
        return points

    # Apply Savitzky-Golay filter
    try:
        smoothed_ele = savgol_filter(filled_ele, window, polyorder)
    except Exception:
        # Fallback: return original if filter fails
        return points

    # Copy points with smoothed elevation
    result = []
    for i, point in enumerate(points):
        if elevations[i] is not None:
            point_copy = dict(point)
            point_copy['elevation'] = float(smoothed_ele[i])
            result.append(point_copy)
        else:
            result.append(point)

    return result


def _point_to_line_distance(point: tuple[float, float], line_start: tuple[float, float], line_end: tuple[float, float]) -> float:
    """Calculate perpendicular distance from point to line in meters (lat, lon)."""
    lat_p, lon_p = point
    lat_a, lon_a = line_start
    lat_b, lon_b = line_end

    # Convert to meters locally (approximate for short distances)
    # 1° latitude ≈ 111 km, 1° longitude ≈ 111 km * cos(latitude)
    lat_m = 111000  # meters
    lon_m = 111000 * math.cos(math.radians((lat_a + lat_b) / 2))

    x_p, y_p = lon_p * lon_m, lat_p * lat_m
    x_a, y_a = lon_a * lon_m, lat_a * lat_m
    x_b, y_b = lon_b * lon_m, lat_b * lat_m

    dx = x_b - x_a
    dy = y_b - y_a

    if dx == 0 and dy == 0:
        return math.sqrt((x_p - x_a) ** 2 + (y_p - y_a) ** 2)

    t = max(0, min(1, ((x_p - x_a) * dx + (y_p - y_a) * dy) / (dx ** 2 + dy ** 2)))
    proj_x = x_a + t * dx
    proj_y = y_a + t * dy

    return math.sqrt((x_p - proj_x) ** 2 + (y_p - proj_y) ** 2)


def _simplify_trajectory(points: list[dict], tolerance_m: float = 15.0) -> list[dict]:
    """Douglas-Peucker trajectory simplification.

    Removes unnecessary intermediate points while preserving trajectory shape.

    Args:
        points: list of point dicts with lat, lon
        tolerance_m: perpendicular distance threshold in meters (default 15m)

    Returns:
        Simplified point list
    """
    if len(points) < 3:
        return points

    def rdp_recursive(pts: list[dict], eps: float) -> list[dict]:
        """Recursive Douglas-Peucker."""
        if len(pts) < 3:
            return pts

        dmax = 0.0
        index = 0
        start = (pts[0]["lat"], pts[0]["lon"])
        end = (pts[-1]["lat"], pts[-1]["lon"])

        for i in range(1, len(pts) - 1):
            d = _point_to_line_distance((pts[i]["lat"], pts[i]["lon"]), start, end)
            if d > dmax:
                index = i
                dmax = d

        if dmax > eps:
            rec1 = rdp_recursive(pts[: index + 1], eps)
            rec2 = rdp_recursive(pts[index:], eps)
            return rec1[:-1] + rec2
        else:
            return [pts[0], pts[-1]]

    return rdp_recursive(points, tolerance_m)


def _normalize_points(points: list[dict]) -> list[dict]:
    """Cleaning pipeline: collapse drift → remove outliers → Kalman filter → smooth elevation.

    Does NOT simplify (RDP) — callers that need the simplified trajectory for
    the map/geometry must apply `_simplify_trajectory` separately. Statistics
    (distance, speed, elevation) are computed on these pre-simplification
    points to avoid the underestimation RDP introduces (see PARSER.md).
    """
    if len(points) < 2:
        return points

    points = _collapse_drift(points)
    points = _remove_speed_outliers(points)
    points = _apply_kalman_filter(points)
    points = _smooth_elevation(points)

    return points


def _calculate_grade(ele_delta_m: float, distance_m: float) -> Optional[float]:
    """Calculate grade (slope) in percent.

    Args:
        ele_delta_m: elevation change in meters
        distance_m: horizontal distance in meters

    Returns:
        Grade in percent (e.g., 5.5 for 5.5% slope), or None if invalid
    """
    if distance_m <= 0:
        return None
    return (ele_delta_m / distance_m) * 100


def _classify_segment(grade: Optional[float], climbing_threshold: float = 5.0, descent_threshold: float = -5.0) -> str:
    """Classify segment by grade.

    Args:
        grade: grade in percent
        climbing_threshold: grade above this is "climbing" (default 5%)
        descent_threshold: grade below this is "descent" (default -5%)

    Returns:
        Classification: "climbing", "descent", or "flat"
    """
    if grade is None:
        return "flat"
    if grade > climbing_threshold:
        return "climbing"
    elif grade < descent_threshold:
        return "descent"
    else:
        return "flat"


def _build_segments(points: list[dict]) -> tuple[list[dict], float, float, float, float, Optional[int], dict]:
    """Compute speed_segments, distance_km, speed stats, duration, grade stats, and elevation gain/loss.

    Uses osmand_speed_kmh from each point when available; falls back to Haversine
    for points that carry no recorded speed.

    Also calculates grade and classifies each segment.
    """
    segments: list[dict] = []
    total_km = 0.0
    speeds: list[float] = []
    grades: list[float] = []
    distance_moving_km = 0.0
    moving_time_sec = 0.0
    _MOVING_MIN_KMH = 0.5
    _MOVING_MAX_KMH = 200
    elevation_gain = 0.0
    elevation_loss = 0.0
    segment_types: dict[str, int] = {"climbing": 0, "descent": 0, "flat": 0}
    segment_distances: dict[str, float] = {"climbing": 0.0, "descent": 0.0, "flat": 0.0}

    for i in range(1, len(points)):
        p0, p1 = points[i - 1], points[i]
        dist_km = _haversine(p0["lat"], p0["lon"], p1["lat"], p1["lon"])
        dist_m = dist_km * 1000
        total_km += dist_km

        # Calculate grade and elevation change
        ele0 = p0.get("elevation")
        ele1 = p1.get("elevation")
        grade = None
        if ele0 is not None and ele1 is not None:
            ele_delta = ele1 - ele0
            grade = _calculate_grade(ele_delta, dist_m)
            if grade is not None:
                grades.append(grade)
            # Track elevation gain/loss
            if ele_delta > 0:
                elevation_gain += ele_delta
            else:
                elevation_loss += abs(ele_delta)

        # Classify segment
        seg_type = _classify_segment(grade)
        segment_types[seg_type] += 1
        segment_distances[seg_type] += dist_km

        # Prefer the speed recorded at the destination point, then origin.
        recorded = p1.get("osmand_speed_kmh")
        if recorded is None:
            recorded = p0.get("osmand_speed_kmh")

        if recorded is not None and recorded >= 0:
            spd = recorded
        elif p0["time"] and p1["time"]:
            dt = (p1["time"] - p0["time"]).total_seconds()
            spd = dist_km / (dt / 3600) if dt > 0 else None  # km/h
        else:
            spd = None

        if spd is not None:
            speeds.append(spd)

        # Moving-time accounting (gpx.studio methodology): based on actual
        # elapsed time between points, independent of the recorded/derived
        # display speed above.
        if p0["time"] and p1["time"]:
            dt = (p1["time"] - p0["time"]).total_seconds()
            if dt > 0:
                pair_speed = dist_km / (dt / 3600)
                if _MOVING_MIN_KMH <= pair_speed <= _MOVING_MAX_KMH:
                    distance_moving_km += dist_km
                    moving_time_sec += dt

        # Build segment
        segment = {
            "from": [p0["lat"], p0["lon"]],
            "to": [p1["lat"], p1["lon"]],
            "speed_kmh": round(spd, 2) if spd is not None else None,
            "grade_percent": round(grade, 1) if grade is not None else None,
            "type": seg_type,
            "distance_km": round(dist_km, 3),
        }
        segments.append(segment)

    moving_time_sec_int = int(moving_time_sec) if moving_time_sec > 0 else None
    speed_avg = (
        distance_moving_km / (moving_time_sec / 3600)
        if moving_time_sec > 0 else None
    )
    speed_max = max(speeds) if speeds else None
    speed_min = min(speeds) if speeds else None

    grade_avg = sum(grades) / len(grades) if grades else None
    grade_max = max(grades) if grades else None
    grade_min = min(grades) if grades else None

    duration = None
    timed = [p for p in points if p["time"]]
    if len(timed) >= 2:
        duration = int((timed[-1]["time"] - timed[0]["time"]).total_seconds())

    # Build statistics
    stats = {
        "grade_avg": round(grade_avg, 1) if grade_avg is not None else None,
        "grade_max": round(grade_max, 1) if grade_max is not None else None,
        "grade_min": round(grade_min, 1) if grade_min is not None else None,
        "elevation_gain": round(elevation_gain, 1),
        "elevation_loss": round(elevation_loss, 1),
        "moving_time_sec": moving_time_sec_int,
        "segment_counts": segment_types,
        "segment_distances": {k: round(v, 2) for k, v in segment_distances.items()},
        "segment_percentages": {
            k: round((v / total_km * 100), 1) if total_km > 0 else 0
            for k, v in segment_distances.items()
        }
    }

    return segments, total_km, speed_avg, speed_max, speed_min, duration, stats


# ── GPX ───────────────────────────────────────────────────────────────────────

# OsmAnd 3.x: short namespace, osmand:speed in m/s → multiply by 3.6 → km/h.
# OsmAnd 4.x: long namespace, osmand:speed already in km/h.
_OSMAND_NS_V3 = "https://osmand.net"
_OSMAND_NS_V4 = "https://osmand.net/docs/technical/osmand-file-formats/osmand-gpx"
_GPX_NS = "http://www.topografix.com/GPX/1/1"


def _detect_osmand(header: bytes) -> Optional[tuple[str, bool]]:
    """Return (osmand_namespace_uri, speed_is_kmh) or None if not OsmAnd."""
    if _OSMAND_NS_V4.encode() in header:
        return (_OSMAND_NS_V4, True)
    if b"xmlns:osmand=" in header:
        return (_OSMAND_NS_V3, False)
    return None


def _parse_time(text: str) -> Optional[datetime]:
    try:
        t = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _gpx_iter(root, tag: str):
    """Yield elements matching tag, supporting both namespaced and bare GPX."""
    nodes = list(root.iter(f"{{{_GPX_NS}}}{tag}"))
    return nodes if nodes else list(root.iter(tag))


def _gpx_find(el, tag: str):
    """Find a child element, supporting both namespaced and bare GPX."""
    found = el.find(f"{{{_GPX_NS}}}{tag}")
    return found if found is not None else el.find(tag)


def _parse_gpx(data: bytes) -> dict:
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]

    osmand = _detect_osmand(data[:2048])
    osmand_ns: Optional[str] = osmand[0] if osmand else None
    speed_is_kmh: bool = osmand[1] if osmand else False

    lxml_parser = etree.XMLParser(recover=True, remove_comments=True)
    root = etree.fromstring(data, lxml_parser)

    points: list[dict] = []
    for trkpt in _gpx_iter(root, "trkpt"):
        try:
            lat = float(trkpt.get("lat"))
            lon = float(trkpt.get("lon"))
        except (TypeError, ValueError):
            continue

        ele_el = _gpx_find(trkpt, "ele")
        ele = float(ele_el.text) if ele_el is not None and ele_el.text else None

        time_el = _gpx_find(trkpt, "time")
        t = _parse_time(time_el.text) if time_el is not None and time_el.text else None

        osmand_speed_kmh: Optional[float] = None
        if osmand_ns:
            ext_el = _gpx_find(trkpt, "extensions")
            if ext_el is not None:
                # osmand:speed may be declared on root or on the extensions element itself
                spd_el = ext_el.find(f"{{{osmand_ns}}}speed")
                if spd_el is not None and spd_el.text:
                    try:
                        raw = float(spd_el.text)
                        osmand_speed_kmh = raw if speed_is_kmh else raw * 3.6
                    except ValueError:
                        pass

        points.append({
            "lat": lat,
            "lon": lon,
            "elevation": ele,
            "time": t,
            "osmand_speed_kmh": osmand_speed_kmh,
        })

    if not points:
        raise ValueError("No GPS points found in GPX file")

    raw_points = points
    cleaned_points = _normalize_points(points)
    normalized_points = _simplify_trajectory(cleaned_points, tolerance_m=15.0)

    recorded_at = points[0]["time"] if points[0]["time"] else None
    segs, *_ = _build_segments(normalized_points)
    _, dist, s_avg, s_max, s_min, dur, stats = _build_segments(cleaned_points)
    return {
        "points": raw_points,
        "normalized_points": normalized_points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "elevation_gain": stats.get("elevation_gain", 0.0),
        "elevation_loss": stats.get("elevation_loss", 0.0),
        "duration_sec": dur,
        "moving_time_sec": stats.get("moving_time_sec"),
        "recorded_at": recorded_at,
        "grade_stats": stats,
    }


# ── KML ───────────────────────────────────────────────────────────────────────

def _parse_kml(data: bytes) -> dict:
    root = etree.fromstring(data)
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    points: list[dict] = []
    for coords_el in root.iter("{http://www.opengis.net/kml/2.2}coordinates"):
        text = (coords_el.text or "").strip()
        for token in text.split():
            parts = token.split(",")
            if len(parts) >= 2:
                try:
                    lon, lat = float(parts[0]), float(parts[1])
                    ele = float(parts[2]) if len(parts) >= 3 else None
                    points.append({"lat": lat, "lon": lon, "elevation": ele, "time": None})
                except ValueError:
                    continue

    raw_points = points
    cleaned_points = _normalize_points(points) if points else []
    normalized_points = _simplify_trajectory(cleaned_points, tolerance_m=15.0) if cleaned_points else []

    segs, *_ = _build_segments(normalized_points)
    _, dist, s_avg, s_max, s_min, dur, stats = _build_segments(cleaned_points)
    return {
        "points": raw_points,
        "normalized_points": normalized_points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "elevation_gain": stats.get("elevation_gain", 0.0),
        "elevation_loss": stats.get("elevation_loss", 0.0),
        "duration_sec": None,
        "moving_time_sec": stats.get("moving_time_sec"),
        "recorded_at": None,
        "grade_stats": stats,
    }


# ── TCX ───────────────────────────────────────────────────────────────────────

_TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"


def _parse_tcx(data: bytes) -> dict:
    root = etree.fromstring(data)
    points: list[dict] = []
    for tp in root.iter(f"{{{_TCX_NS}}}Trackpoint"):
        lat_el = tp.find(f"{{{_TCX_NS}}}Position/{{{_TCX_NS}}}LatitudeDegrees")
        lon_el = tp.find(f"{{{_TCX_NS}}}Position/{{{_TCX_NS}}}LongitudeDegrees")
        alt_el = tp.find(f"{{{_TCX_NS}}}AltitudeMeters")
        time_el = tp.find(f"{{{_TCX_NS}}}Time")
        if lat_el is None or lon_el is None:
            continue
        try:
            lat, lon = float(lat_el.text), float(lon_el.text)
        except (TypeError, ValueError):
            continue
        ele = float(alt_el.text) if alt_el is not None and alt_el.text else None
        t = None
        if time_el is not None and time_el.text:
            try:
                t = datetime.fromisoformat(time_el.text.replace("Z", "+00:00"))
            except ValueError:
                pass
        points.append({"lat": lat, "lon": lon, "elevation": ele, "time": t})

    raw_points = points
    cleaned_points = _normalize_points(points) if points else []
    normalized_points = _simplify_trajectory(cleaned_points, tolerance_m=15.0) if cleaned_points else []

    recorded_at = points[0]["time"] if points and points[0]["time"] else None
    segs, *_ = _build_segments(normalized_points)
    _, dist, s_avg, s_max, s_min, dur, stats = _build_segments(cleaned_points)
    return {
        "points": raw_points,
        "normalized_points": normalized_points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "elevation_gain": stats.get("elevation_gain", 0.0),
        "elevation_loss": stats.get("elevation_loss", 0.0),
        "duration_sec": dur,
        "moving_time_sec": stats.get("moving_time_sec"),
        "recorded_at": recorded_at,
        "grade_stats": stats,
    }


# ── FIT ───────────────────────────────────────────────────────────────────────

def _parse_fit(data: bytes) -> dict:
    from fitparse import FitFile
    import io

    ff = FitFile(io.BytesIO(data))
    points: list[dict] = []
    for record in ff.get_messages("record"):
        flds = {f.name: f.value for f in record}
        raw_lat = flds.get("position_lat")
        raw_lon = flds.get("position_long")
        if raw_lat is None or raw_lon is None:
            continue
        # FIT uses semicircles
        lat = raw_lat * (180 / 2**31)
        lon = raw_lon * (180 / 2**31)
        ele = flds.get("altitude")
        t = flds.get("timestamp")
        if t and t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        points.append({"lat": lat, "lon": lon, "elevation": ele, "time": t})

    raw_points = points
    cleaned_points = _normalize_points(points) if points else []
    normalized_points = _simplify_trajectory(cleaned_points, tolerance_m=15.0) if cleaned_points else []

    recorded_at = points[0]["time"] if points and points[0]["time"] else None
    segs, *_ = _build_segments(normalized_points)
    _, dist, s_avg, s_max, s_min, dur, stats = _build_segments(cleaned_points)
    return {
        "points": raw_points,
        "normalized_points": normalized_points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "elevation_gain": stats.get("elevation_gain", 0.0),
        "elevation_loss": stats.get("elevation_loss", 0.0),
        "duration_sec": dur,
        "moving_time_sec": stats.get("moving_time_sec"),
        "recorded_at": recorded_at,
        "grade_stats": stats,
    }


# ── GeoJSON ───────────────────────────────────────────────────────────────────

def _parse_geojson(data: bytes) -> dict:
    obj = json.loads(data)
    coords: list[Any] = []
    if obj.get("type") == "FeatureCollection":
        for feat in obj.get("features", []):
            geom = feat.get("geometry", {})
            if geom.get("type") == "LineString":
                coords.extend(geom.get("coordinates", []))
    elif obj.get("type") == "Feature":
        geom = obj.get("geometry", {})
        coords = geom.get("coordinates", [])
    elif obj.get("type") == "LineString":
        coords = obj.get("coordinates", [])

    points: list[dict] = []
    for c in coords:
        if len(c) >= 2:
            lon, lat = c[0], c[1]
            ele = c[2] if len(c) >= 3 else None
            points.append({"lat": lat, "lon": lon, "elevation": ele, "time": None})

    raw_points = points
    cleaned_points = _normalize_points(points) if points else []
    normalized_points = _simplify_trajectory(cleaned_points, tolerance_m=15.0) if cleaned_points else []

    segs, *_ = _build_segments(normalized_points)
    _, dist, s_avg, s_max, s_min, dur, stats = _build_segments(cleaned_points)
    return {
        "points": raw_points,
        "normalized_points": normalized_points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": None,
        "speed_max": None,
        "speed_min": None,
        "elevation_gain": stats.get("elevation_gain", 0.0),
        "elevation_loss": stats.get("elevation_loss", 0.0),
        "duration_sec": None,
        "moving_time_sec": stats.get("moving_time_sec"),
        "recorded_at": None,
        "grade_stats": stats,
    }


# ── Public API ────────────────────────────────────────────────────────────────

_PARSERS = {
    "gpx": _parse_gpx,
    "kml": _parse_kml,
    "tcx": _parse_tcx,
    "fit": _parse_fit,
    "geojson": _parse_geojson,
}


def detect_format(header: bytes, filename: str = "") -> str:
    """Detect GPS file format from magic bytes / content sniffing."""
    h = header[:2048]
    if header[:4] == b"\x0e\x10\x09\x08":
        return "fit"
    stripped = h.lstrip()
    if stripped.startswith(b"{"):
        return "geojson"
    if stripped.startswith(b"<"):
        if b"<gpx" in h:
            return "gpx"
        if b"<kml" in h:
            return "kml"
        if b"<TrainingCenterDatabase" in h or b"<tcx" in h:
            return "tcx"
        # Fall back to extension
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext in ("gpx", "kml", "tcx"):
            return ext
    raise ValueError(f"Unrecognized GPS file format for: {filename!r}")


def parse(file_bytes: bytes, fmt: str) -> dict:
    """Parse file_bytes according to fmt. Returns unified result dict."""
    parser = _PARSERS.get(fmt)
    if parser is None:
        raise ValueError(f"No parser for format: {fmt!r}")
    return parser(file_bytes)
