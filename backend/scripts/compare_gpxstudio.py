"""Read-only audit: our pipeline's stats vs a Python port of gpx.studio's methodology.

Does NOT modify the pipeline, models, or the database. For every track with
raw_points, computes distance_km / speed_avg / elevation_gain / elevation_loss
using a port of gpx.studio's algorithm (gpxstudio/gpx.studio, gpx/src/gpx.ts:
_computeStatistics, _elevationComputation) and compares against the values
already stored on the Track by our pipeline.

gpx.studio methodology (verified against source):
  1. Distance: sum of haversine distances between adjacent raw points.
  2. Moving speed: a pair of points counts as "moving" if 0.5 <= v <= 1500 km/h;
     speed_avg = distance_moving / time_moving.
  3. Elevation gain/loss: RDP-simplify the elevation profile (x = cumulative
     distance, y = elevation; epsilon = 20), then apply a moving average
     window of 0.1 km (by distance) over the simplified profile, and sum
     positive/negative deltas of the smoothed series.
  4. Grade: same idea with a 0.05 km window (computed here for completeness,
     shown as a reference-only column — not scored in the summary since our
     DB has no directly comparable single grade-profile value).

Usage: docker compose exec backend python -m scripts.compare_gpxstudio
"""
import statistics
from datetime import datetime

from app.core.database import SessionLocal
from app.models.track import Track
from app.services.parser_factory import _haversine

_MOVING_MIN_KMH = 0.5
_MOVING_MAX_KMH = 1500.0
_ELEVATION_RDP_EPSILON_M = 20.0
_ELEVATION_WINDOW_KM = 0.1
_GRADE_WINDOW_KM = 0.05


def _parse_time(value):
    if not value:
        return None
    return datetime.fromisoformat(value)


def _deserialize_points(raw_points: list[dict]) -> list[dict]:
    return [{**p, "time": _parse_time(p.get("time"))} for p in raw_points]


# ── gpx.studio port ─────────────────────────────────────────────────────────

def _gpxstudio_distance_km(points: list[dict]) -> float:
    total = 0.0
    for i in range(1, len(points)):
        p0, p1 = points[i - 1], points[i]
        total += _haversine(p0["lat"], p0["lon"], p1["lat"], p1["lon"])
    return total


def _gpxstudio_speed_avg(points: list[dict]) -> float | None:
    distance_moving_km = 0.0
    moving_time_sec = 0.0
    for i in range(1, len(points)):
        p0, p1 = points[i - 1], points[i]
        if not (p0["time"] and p1["time"]):
            continue
        dt = (p1["time"] - p0["time"]).total_seconds()
        if dt <= 0:
            continue
        dist_km = _haversine(p0["lat"], p0["lon"], p1["lat"], p1["lon"])
        speed = dist_km / (dt / 3600)
        if _MOVING_MIN_KMH <= speed <= _MOVING_MAX_KMH:
            distance_moving_km += dist_km
            moving_time_sec += dt
    if moving_time_sec <= 0:
        return None
    return distance_moving_km / (moving_time_sec / 3600)


def _cumulative_distances_km(points: list[dict]) -> list[float]:
    """Cumulative distance (km) at each point, starting at 0."""
    cum = [0.0]
    for i in range(1, len(points)):
        p0, p1 = points[i - 1], points[i]
        cum.append(cum[-1] + _haversine(p0["lat"], p0["lon"], p1["lat"], p1["lon"]))
    return cum


def _rdp_profile(xs: list[float], ys: list[float], eps: float) -> list[int]:
    """Douglas-Peucker on a 1D profile (x, y). Returns indices kept."""
    n = len(xs)
    if n < 3:
        return list(range(n))

    keep = [False] * n
    keep[0] = keep[-1] = True

    def recurse(lo: int, hi: int) -> None:
        if hi <= lo + 1:
            return
        x0, y0 = xs[lo], ys[lo]
        x1, y1 = xs[hi], ys[hi]
        dx, dy = x1 - x0, y1 - y0
        norm = (dx ** 2 + dy ** 2) ** 0.5

        dmax = 0.0
        idx = -1
        for i in range(lo + 1, hi):
            if norm == 0:
                d = ((xs[i] - x0) ** 2 + (ys[i] - y0) ** 2) ** 0.5
            else:
                d = abs(dy * (xs[i] - x0) - dx * (ys[i] - y0)) / norm
            if d > dmax:
                dmax = d
                idx = i

        if dmax > eps and idx != -1:
            keep[idx] = True
            recurse(lo, idx)
            recurse(idx, hi)

    recurse(0, n - 1)
    return [i for i in range(n) if keep[i]]


def _windowed_average_by_distance(xs: list[float], ys: list[float], window_km: float) -> list[float]:
    """Moving average of ys, averaging over all points within window_km/2 (by
    cumulative distance xs) on either side of each point."""
    n = len(xs)
    smoothed = []
    half = window_km / 2
    lo = 0
    hi = 0
    for i in range(n):
        while lo < i and xs[i] - xs[lo] > half:
            lo += 1
        if hi < i:
            hi = i
        while hi < n - 1 and xs[hi + 1] - xs[i] <= half:
            hi += 1
        window = ys[lo:hi + 1]
        smoothed.append(sum(window) / len(window))
    return smoothed


def _gpxstudio_elevation(points: list[dict]) -> tuple[float, float]:
    """Returns (elevation_gain, elevation_loss) in meters."""
    pts_with_ele = [p for p in points if p.get("elevation") is not None]
    if len(pts_with_ele) < 2:
        return 0.0, 0.0

    cum_km = _cumulative_distances_km(pts_with_ele)
    eles = [p["elevation"] for p in pts_with_ele]

    kept_idx = _rdp_profile(cum_km, eles, _ELEVATION_RDP_EPSILON_M)
    kept_x = [cum_km[i] for i in kept_idx]
    kept_y = [eles[i] for i in kept_idx]

    smoothed = _windowed_average_by_distance(kept_x, kept_y, _ELEVATION_WINDOW_KM)

    gain = 0.0
    loss = 0.0
    for i in range(1, len(smoothed)):
        delta = smoothed[i] - smoothed[i - 1]
        if delta > 0:
            gain += delta
        else:
            loss += abs(delta)
    return gain, loss


def _gpxstudio_grade_avg(points: list[dict]) -> float | None:
    """Reference-only: average |grade%| after RDP + 0.05km smoothing window."""
    pts_with_ele = [p for p in points if p.get("elevation") is not None]
    if len(pts_with_ele) < 2:
        return None

    cum_km = _cumulative_distances_km(pts_with_ele)
    eles = [p["elevation"] for p in pts_with_ele]

    kept_idx = _rdp_profile(cum_km, eles, _ELEVATION_RDP_EPSILON_M)
    kept_x = [cum_km[i] for i in kept_idx]
    kept_y = [eles[i] for i in kept_idx]

    smoothed = _windowed_average_by_distance(kept_x, kept_y, _GRADE_WINDOW_KM)

    grades = []
    for i in range(1, len(smoothed)):
        dx_m = (kept_x[i] - kept_x[i - 1]) * 1000
        if dx_m <= 0:
            continue
        dy_m = smoothed[i] - smoothed[i - 1]
        grades.append(abs(dy_m / dx_m) * 100)
    return sum(grades) / len(grades) if grades else None


# ── comparison / reporting ──────────────────────────────────────────────────

def _pct_delta(ours: float | None, theirs: float | None) -> float | None:
    if ours is None or theirs is None:
        return None
    if theirs == 0:
        return None
    return (ours - theirs) / theirs * 100


def main() -> None:
    db = SessionLocal()
    try:
        tracks = db.query(Track).filter(Track.raw_points.isnot(None)).order_by(Track.id).all()

        rows = []  # (track_id, name, metric, ours, theirs, delta_pct)
        deltas_by_metric: dict[str, list[float]] = {
            "distance_km": [],
            "speed_avg": [],
            "elevation_gain": [],
            "elevation_loss": [],
        }

        for track in tracks:
            if not track.raw_points:
                continue
            points = _deserialize_points(track.raw_points)
            if len(points) < 2:
                continue

            gs_distance = _gpxstudio_distance_km(points)
            gs_speed = _gpxstudio_speed_avg(points)
            gs_gain, gs_loss = _gpxstudio_elevation(points)
            gs_grade = _gpxstudio_grade_avg(points)

            metrics = [
                ("distance_km", track.distance_km, gs_distance),
                ("speed_avg", track.speed_avg, gs_speed),
                ("elevation_gain", track.elevation_gain, gs_gain),
                ("elevation_loss", track.elevation_loss, gs_loss),
                ("grade_avg_abs (ref only)", track.grade_avg if hasattr(track, "grade_avg") else None, gs_grade),
            ]

            for metric, ours, theirs in metrics:
                delta = _pct_delta(ours, theirs)
                rows.append((track.id, track.name, metric, ours, theirs, delta))
                if delta is not None and metric in deltas_by_metric:
                    deltas_by_metric[metric].append(abs(delta))

        # ── print table ──
        header = f"{'id':>5} {'name':<30} {'metric':<24} {'ours':>12} {'gpx.studio':>12} {'delta %':>10}"
        print(header)
        print("-" * len(header))
        for track_id, name, metric, ours, theirs, delta in rows:
            name_s = (name or "")[:30]
            ours_s = f"{ours:.4f}" if isinstance(ours, float) else str(ours)
            theirs_s = f"{theirs:.4f}" if isinstance(theirs, float) else str(theirs)
            delta_s = f"{delta:+.2f}" if delta is not None else "n/a"
            print(f"{track_id:>5} {name_s:<30} {metric:<24} {ours_s:>12} {theirs_s:>12} {delta_s:>10}")

        # ── summary ──
        print()
        print("Summary (median / max abs delta %, over tracks where both values exist):")
        for metric, values in deltas_by_metric.items():
            if not values:
                print(f"  {metric:<20} no comparable data")
                continue
            med = statistics.median(values)
            mx = max(values)
            print(f"  {metric:<20} median={med:6.2f}%  max={mx:6.2f}%  n={len(values)}")

        print(f"\nTracks compared: {len(tracks)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
