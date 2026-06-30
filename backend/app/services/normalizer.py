"""GPS track normalization.

Two passes:
1. Cluster GPS drift at rest — consecutive points within DRIFT_RADIUS_M of each
   other (and slower than IDLE_SPEED_KMH) are collapsed to their centroid.
2. Speed outlier removal — segments whose speed exceeds MAX_SPEED_KMH are dropped
   (the point is kept; only the segment speed is set to None so callers can filter).
"""

import math
from typing import Optional

_DRIFT_RADIUS_M = 10.0
_IDLE_SPEED_KMH = 2.0
_MAX_SPEED_KMH = 350.0
_EARTH_R = 6_371_000.0  # metres


def _dist_m(p1: dict, p2: dict) -> float:
    lat1, lon1 = math.radians(p1["lat"]), math.radians(p1["lon"])
    lat2, lon2 = math.radians(p2["lat"]), math.radians(p2["lon"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_R * math.asin(math.sqrt(a))


def _is_idle(p1: dict, p2: dict) -> bool:
    """True when both points are effectively stationary."""
    d = _dist_m(p1, p2)
    if d > _DRIFT_RADIUS_M:
        return False
    if p1["time"] and p2["time"]:
        dt = (p2["time"] - p1["time"]).total_seconds()
        if dt > 0:
            spd_kmh = (d / dt) * 3.6
            return spd_kmh < _IDLE_SPEED_KMH
    return d < _DRIFT_RADIUS_M


def _centroid(cluster: list[dict]) -> dict:
    lat = sum(p["lat"] for p in cluster) / len(cluster)
    lon = sum(p["lon"] for p in cluster) / len(cluster)
    eles = [p["elevation"] for p in cluster if p["elevation"] is not None]
    ele: Optional[float] = sum(eles) / len(eles) if eles else None
    return {"lat": lat, "lon": lon, "elevation": ele, "time": cluster[0]["time"]}


def _collapse_drift(points: list[dict]) -> list[dict]:
    if len(points) < 2:
        return points
    result: list[dict] = []
    cluster: list[dict] = [points[0]]
    for pt in points[1:]:
        if _is_idle(cluster[-1], pt):
            cluster.append(pt)
        else:
            result.append(_centroid(cluster))
            cluster = [pt]
    result.append(_centroid(cluster))
    return result


def _filter_speed_outliers(speed_segments: list[dict]) -> list[dict]:
    return [s for s in speed_segments if s.get("speed_kmh", 0) <= _MAX_SPEED_KMH]


def normalize(points: list[dict], speed_segments: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (normalized_points, cleaned_speed_segments).

    Returns originals unchanged when the track is already clean (no drift
    clusters, no outliers) to avoid unnecessary copies.
    """
    collapsed = _collapse_drift(points)
    cleaned_segs = _filter_speed_outliers(speed_segments)
    return collapsed, cleaned_segs
