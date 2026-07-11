"""One-off: recompute track statistics with the T25 methodology.

Re-runs cleaning phases 1-4 (drift collapse, outlier removal, Kalman,
elevation smoothing) on each track's raw_points and rebuilds stats with
_build_segments — fixing both the pre-RDP distance underestimation and the
moving-time speed_avg calculation (see architecture/PARSER.md).

Does NOT touch normalized_points or speed_segments (those stay as originally
computed at upload time — consistent with T25's "не трогать speed_segments").

Usage: docker compose exec backend python -m scripts.recompute_stats
"""
from datetime import datetime

from app.core.database import SessionLocal
from app.models.track import Track
from app.services.parser_factory import _build_segments, _normalize_points


def _parse_time(value):
    if not value:
        return None
    return datetime.fromisoformat(value)


def _deserialize_points(raw_points: list[dict]) -> list[dict]:
    return [{**p, "time": _parse_time(p.get("time"))} for p in raw_points]


def main() -> None:
    db = SessionLocal()
    updated = 0
    skipped = 0
    try:
        tracks = db.query(Track).filter(Track.raw_points.isnot(None)).all()
        for track in tracks:
            if not track.raw_points:
                skipped += 1
                continue

            points = _deserialize_points(track.raw_points)
            cleaned = _normalize_points(points)
            _, dist, s_avg, s_max, s_min, dur, stats = _build_segments(cleaned)

            track.distance_km = round(dist, 4)
            track.speed_avg = round(s_avg, 2) if s_avg is not None else None
            track.speed_max = round(s_max, 2) if s_max is not None else None
            track.speed_min = round(s_min, 2) if s_min is not None else None
            track.moving_time_sec = stats.get("moving_time_sec")
            track.elevation_gain = stats.get("elevation_gain", 0.0)
            track.elevation_loss = stats.get("elevation_loss", 0.0)
            track.duration_sec = dur

            updated += 1
            print(f"track {track.id}: distance_km={track.distance_km} speed_avg={track.speed_avg} "
                  f"moving_time_sec={track.moving_time_sec}")

        db.commit()
        print(f"Done: {updated} tracks updated, {skipped} skipped (no raw_points).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
