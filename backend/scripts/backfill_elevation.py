"""Backfill elevation_gain/elevation_loss for existing tracks after the
gpx.studio-methodology fix in parser_factory._build_segments (see POLISH.md
T26 audit / architecture decision).

Only touches elevation_gain and elevation_loss — recomputed from the raw_points
already stored on each track via the same _normalize_points -> _build_segments
path process_track.py uses. Does NOT touch raw_points, normalized_points,
distance_km, speed_*, geom, regions, or anything else.

Usage:
  docker compose exec backend python -m scripts.backfill_elevation --dry-run
  docker compose exec backend python -m scripts.backfill_elevation
"""
import argparse

from app.core.database import SessionLocal
from app.models.track import Track
from app.services.parser_factory import _build_segments, _normalize_points


def _deserialize_points(raw_points: list[dict]) -> list[dict]:
    from datetime import datetime
    return [
        {**p, "time": datetime.fromisoformat(p["time"]) if p.get("time") else None}
        for p in raw_points
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing to the DB")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        tracks = db.query(Track).filter(Track.raw_points.isnot(None)).all()
        print(f"Found {len(tracks)} tracks with raw_points")

        updated = 0
        skipped = 0
        errors = 0

        for track in tracks:
            try:
                points = _deserialize_points(track.raw_points)
                if len(points) < 2:
                    skipped += 1
                    continue

                normalized = _normalize_points(points)
                _, _, _, _, _, _, stats = _build_segments(normalized)
                new_gain = stats["elevation_gain"]
                new_loss = stats["elevation_loss"]

                old_gain, old_loss = track.elevation_gain, track.elevation_loss
                if old_gain == new_gain and old_loss == new_loss:
                    skipped += 1
                    continue

                print(
                    f"  #{track.id:>5} {track.name[:30]:30} "
                    f"gain {old_gain:>9.1f} -> {new_gain:>9.1f}   "
                    f"loss {old_loss:>9.1f} -> {new_loss:>9.1f}"
                )

                if not args.dry_run:
                    track.elevation_gain = new_gain
                    track.elevation_loss = new_loss

                updated += 1
            except Exception as err:  # noqa: BLE001 — log and continue, don't abort the batch
                print(f"  #{track.id:>5} ERROR: {err}")
                errors += 1

        if not args.dry_run and updated:
            db.commit()

        mode = "DRY RUN — nothing written" if args.dry_run else "committed"
        print(f"\n{updated} updated ({mode}), {skipped} unchanged/skipped, {errors} errors")
    finally:
        db.close()


if __name__ == "__main__":
    main()
