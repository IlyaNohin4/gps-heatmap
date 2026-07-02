"""Celery task: parse → normalize → geocode → persist a GPS track."""

import traceback
from datetime import datetime, timezone

import redis
from geoalchemy2.elements import WKTElement
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.track import Track
from app.tasks.celery_app import celery_app

# Semaphore for sequential track processing (max 1 concurrent)
_redis_client = redis.from_url(settings.REDIS_URL)
_semaphore = _redis_client.lock("process_track_lock", timeout=3600, blocking=True)


def _points_to_linestring(points: list[dict]) -> str:
    coords = ", ".join(f"{p['lon']} {p['lat']}" for p in points)
    return f"LINESTRING({coords})"


@celery_app.task(bind=True, name="process_track")
def process_track(self, track_id: int, file_bytes: bytes) -> dict:
    """Full processing pipeline for an uploaded GPS track file.

    Sequential processing: only 1 track at a time (controlled by Redis lock).
    Other Celery tasks can run in parallel.
    """
    db: Session = SessionLocal()
    try:
        # Notify: waiting in queue
        self.update_state(state="PROGRESS", meta={"step": "queued"})

        # Acquire lock — only 1 track processing at a time
        with _semaphore:
            track = db.query(Track).filter(Track.id == track_id).first()
            if not track:
                return {"status": "error", "detail": "track not found"}

            self.update_state(state="PROGRESS", meta={"step": "parsing"})

            # 1. Parse (normalization happens inside parser)
            from app.services.parser_factory import parse
            result = parse(file_bytes, track.file_format)
            raw_points = result["points"]
            norm_points = result.get("normalized_points", raw_points)  # Fallback to raw if not present

            if not raw_points:
                _set_error(db, track, "No GPS points found in file")
                return {"status": "error", "detail": "no points"}

            # Serialize datetimes for JSON storage
            raw_serializable = [
                {**p, "time": p["time"].isoformat() if p["time"] else None}
                for p in raw_points
            ]

            self.update_state(state="PROGRESS", meta={"step": "normalizing"})

            # 2. Normalized points already computed in parser
            norm_serializable = [
                {**p, "time": p["time"].isoformat() if p["time"] else None}
                for p in norm_points
            ]

            self.update_state(state="PROGRESS", meta={"step": "geocoding"})

            # 3. Geocode regions
            from app.services.regions import get_regions
            regions = get_regions(norm_points)

            self.update_state(state="PROGRESS", meta={"step": "saving"})

            # 4. Build PostGIS geometry (use normalized points; need ≥2 pts)
            geom = None
            if len(norm_points) >= 2:
                wkt = _points_to_linestring(norm_points)
                geom = WKTElement(wkt, srid=4326)

            # 5. Persist all parsed metrics (normalization includes elevation & grade calculation)
            track.raw_points = raw_serializable
            track.normalized_points = norm_serializable
            track.speed_segments = result["speed_segments"]
            track.grade_stats = result["grade_stats"]
            track.distance_km = result["distance_km"]
            track.duration_sec = result["duration_sec"]
            track.speed_avg = result["speed_avg"]
            track.speed_max = result["speed_max"]
            track.speed_min = result["speed_min"]
            track.elevation_gain = result["elevation_gain"]
            track.elevation_loss = result["elevation_loss"]
            track.recorded_at = result["recorded_at"]
            track.regions = regions or []
            track.geom = geom

            db.commit()
            return {"status": "done", "track_id": track_id}

    except Exception as exc:
        db.rollback()
        _set_error(db, track if 'track' in dir() else None, str(exc))
        raise self.retry(exc=exc, countdown=5, max_retries=2)
    finally:
        db.close()


def _set_error(db: Session, track, detail: str) -> None:
    if track:
        try:
            track.regions = [f"__error: {detail[:200]}"]
            db.commit()
        except Exception:
            db.rollback()
