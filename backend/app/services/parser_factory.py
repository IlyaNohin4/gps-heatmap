"""Parse GPS track files into a unified list of point dicts.

Each point: {"lat": float, "lon": float, "elevation": float|None, "time": datetime|None}
Returns also speed_segments computed via Haversine between consecutive timed points.
"""

import json
import math
from datetime import datetime, timezone
from typing import Any, Optional

import gpxpy
from lxml import etree

# ── Haversine ─────────────────────────────────────────────────────────────────

_EARTH_R = 6371.0  # km


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in km between two WGS-84 points."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_R * math.asin(math.sqrt(a))


def _build_segments(points: list[dict]) -> tuple[list[dict], float, float, float, float, Optional[int]]:
    """Compute speed_segments, distance_km, speed stats, duration from point list."""
    segments: list[dict] = []
    total_km = 0.0
    speeds: list[float] = []

    for i in range(1, len(points)):
        p0, p1 = points[i - 1], points[i]
        dist = _haversine(p0["lat"], p0["lon"], p1["lat"], p1["lon"])
        total_km += dist
        if p0["time"] and p1["time"]:
            dt = (p1["time"] - p0["time"]).total_seconds()
            if dt > 0:
                spd = dist / dt * 3600  # km/h
                speeds.append(spd)
                segments.append({
                    "from": [p0["lat"], p0["lon"]],
                    "to": [p1["lat"], p1["lon"]],
                    "speed_kmh": round(spd, 2),
                })

    speed_avg = sum(speeds) / len(speeds) if speeds else None
    speed_max = max(speeds) if speeds else None
    speed_min = min(speeds) if speeds else None

    duration = None
    timed = [p for p in points if p["time"]]
    if len(timed) >= 2:
        duration = int((timed[-1]["time"] - timed[0]["time"]).total_seconds())

    return segments, total_km, speed_avg, speed_max, speed_min, duration


# ── GPX ───────────────────────────────────────────────────────────────────────

import re as _re

# OsmAnd exports use undeclared namespace prefixes (e.g. <osmand:speed>) inside
# <extensions> blocks. Standard XML parsers reject undeclared prefixes, so we
# strip the entire <extensions>…</extensions> section before parsing.
_EXTENSIONS_RE = _re.compile(rb"<extensions>.*?</extensions>", _re.DOTALL)


def _sanitize_gpx(data: bytes) -> bytes:
    # Strip BOM if present
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    return _EXTENSIONS_RE.sub(b"", data)


def _parse_gpx(data: bytes) -> dict:
    gpx = gpxpy.parse(_sanitize_gpx(data).decode("utf-8", errors="replace"))
    points: list[dict] = []
    for track in gpx.tracks:
        for seg in track.segments:
            for pt in seg.points:
                points.append({
                    "lat": pt.latitude,
                    "lon": pt.longitude,
                    "elevation": pt.elevation,
                    "time": pt.time.replace(tzinfo=timezone.utc) if pt.time and pt.time.tzinfo is None else pt.time,
                })
    recorded_at = points[0]["time"] if points and points[0]["time"] else None
    segs, dist, s_avg, s_max, s_min, dur = _build_segments(points)
    return {
        "points": points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "duration_sec": dur,
        "recorded_at": recorded_at,
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
    segs, dist, s_avg, s_max, s_min, dur = _build_segments(points)
    return {
        "points": points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "duration_sec": None,
        "recorded_at": None,
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

    recorded_at = points[0]["time"] if points and points[0]["time"] else None
    segs, dist, s_avg, s_max, s_min, dur = _build_segments(points)
    return {
        "points": points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "duration_sec": dur,
        "recorded_at": recorded_at,
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

    recorded_at = points[0]["time"] if points and points[0]["time"] else None
    segs, dist, s_avg, s_max, s_min, dur = _build_segments(points)
    return {
        "points": points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": round(s_avg, 2) if s_avg else None,
        "speed_max": round(s_max, 2) if s_max else None,
        "speed_min": round(s_min, 2) if s_min else None,
        "duration_sec": dur,
        "recorded_at": recorded_at,
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

    segs, dist, s_avg, s_max, s_min, dur = _build_segments(points)
    return {
        "points": points,
        "speed_segments": segs,
        "distance_km": round(dist, 4),
        "speed_avg": None,
        "speed_max": None,
        "speed_min": None,
        "duration_sec": None,
        "recorded_at": None,
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
