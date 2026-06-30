"""Celery task: parse → normalize → geocode → persist a GPS track."""

import traceback
from datetime import datetime, timezone

from geoalchemy2.elements import WKTElement
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.track import Track
from app.tasks.celery_app import celery_app


def _points_to_linestring(points: list[dict]) -> str:
    coords = ", ".join(f"{p['lon']} {p['lat']}" for p in points)
    return f"LINESTRING({coords})"


@celery_app.task(bind=True, name="process_track")
def process_track(self, track_id: int, file_bytes: bytes) -> dict:
    """Full processing pipeline for an uploaded GPS track file."""
    db: Session = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return {"status": "error", "detail": "track not found"}

        self.update_state(state="PROGRESS", meta={"step": "parsing"})

        # 1. Parse
        from app.services.parser_factory import parse
        result = parse(file_bytes, track.file_format)
        raw_points = result["points"]

        if not raw_points:
            _set_error(db, track, "No GPS points found in file")
            return {"status": "error", "detail": "no points"}

        # Serialize datetimes for JSON storage
        raw_serializable = [
            {**p, "time": p["time"].isoformat() if p["time"] else None}
            for p in raw_points
        ]

        self.update_state(state="PROGRESS", meta={"step": "normalizing"})

        # 2. Normalize
        from app.services.normalizer import normalize
        norm_points, clean_segs = normalize(raw_points, result["speed_segments"])
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

        # 5. Persist
        # Compute elevation gain/loss from normalized points
        elev_gain = 0.0
        elev_loss = 0.0
        elevations = [p.get("elevation") for p in norm_points if p.get("elevation") is not None]
        for i in range(1, len(elevations)):
            diff = elevations[i] - elevations[i - 1]
            if diff > 0:
                elev_gain += diff
            else:
                elev_loss += abs(diff)

        track.raw_points = raw_serializable
        track.normalized_points = norm_serializable
        track.speed_segments = clean_segs
        track.distance_km = result["distance_km"]
        track.duration_sec = result["duration_sec"]
        track.speed_avg = result["speed_avg"]
        track.speed_max = result["speed_max"]
        track.speed_min = result["speed_min"]
        track.elevation_gain = elev_gain if elevations else None
        track.elevation_loss = elev_loss if elevations else None
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
