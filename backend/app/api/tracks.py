from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope
from pydantic import BaseModel
from sqlalchemy import cast, func
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.track import Track
from app.models.user import User
from app.tasks.process_track import process_track

router = APIRouter(prefix="/api/tracks", tags=["tracks"])

MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB

# Magic bytes for supported formats
MAGIC = {
    b"<?xml": ["gpx", "kml", "tcx"],
    b"\x0e\x10\x09\x08": ["fit"],
    b"{": ["geojson"],
}

ALLOWED_FORMATS = {"gpx", "kml", "tcx", "fit", "geojson"}


def _detect_format(header: bytes, filename: str) -> str:
    """Detect file format from magic bytes, fall back to extension."""
    for magic, fmts in MAGIC.items():
        if header.startswith(magic):
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            if ext in fmts:
                return ext
            # XML-like: try to distinguish by content
            if b"<gpx" in header[:2048]:
                return "gpx"
            if b"<kml" in header[:2048]:
                return "kml"
            if b"<TrainingCenterDatabase" in header[:2048] or b"<tcx" in header[:2048]:
                return "tcx"
            return fmts[0]
    # JSON check
    if header.lstrip()[:1] == b"{":
        return "geojson"
    raise ValueError("Unrecognized file format")


# ── Schemas ────────────────────────────────────────────────────────────────────

class TrackOut(BaseModel):
    id: int
    name: str
    file_format: str
    distance_km: Optional[float]
    duration_sec: Optional[int]
    recorded_at: Optional[str]
    uploaded_at: Optional[str]
    speed_avg: Optional[float]
    speed_max: Optional[float]
    speed_min: Optional[float]
    regions: Optional[List[str]]
    is_public: bool
    public_token: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_dt(cls, t: Track) -> "TrackOut":
        return cls(
            id=t.id,
            name=t.name,
            file_format=t.file_format,
            distance_km=t.distance_km,
            duration_sec=t.duration_sec,
            recorded_at=t.recorded_at.isoformat() if t.recorded_at else None,
            uploaded_at=t.uploaded_at.isoformat() if t.uploaded_at else None,
            speed_avg=t.speed_avg,
            speed_max=t.speed_max,
            speed_min=t.speed_min,
            regions=t.regions,
            is_public=t.is_public,
            public_token=t.public_token,
        )


class TrackDetail(TrackOut):
    raw_points: Optional[object] = None
    normalized_points: Optional[object] = None
    speed_segments: Optional[object] = None

    @classmethod
    def from_orm_dt(cls, t: Track) -> "TrackDetail":  # type: ignore[override]
        base = TrackOut.from_orm_dt(t)
        return cls(
            **base.model_dump(),
            raw_points=t.raw_points,
            normalized_points=t.normalized_points,
            speed_segments=t.speed_segments,
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[TrackOut])
def list_tracks(
    sort: Optional[str] = Query(None, pattern="^(newest|oldest|longest|fastest)$"),
    search: Optional[str] = Query(None, max_length=200),
    bbox: Optional[str] = Query(None, description="minLng,minLat,maxLng,maxLat"),
    file_format: Optional[str] = Query(None),
    speed_avg_min: Optional[float] = Query(None),
    speed_avg_max: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Track).filter(Track.user_id == current_user.id)

    if search:
        q = q.filter(Track.name.ilike(f"%{search}%"))

    if file_format:
        if file_format not in ALLOWED_FORMATS:
            raise HTTPException(status_code=400, detail="Invalid file_format")
        q = q.filter(Track.file_format == file_format)

    if speed_avg_min is not None:
        q = q.filter(Track.speed_avg >= speed_avg_min)
    if speed_avg_max is not None:
        q = q.filter(Track.speed_avg <= speed_avg_max)

    if bbox:
        try:
            min_lng, min_lat, max_lng, max_lat = (float(x) for x in bbox.split(","))
        except ValueError:
            raise HTTPException(status_code=400, detail="bbox must be minLng,minLat,maxLng,maxLat")
        envelope = ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
        q = q.filter(ST_Intersects(Track.geom, envelope))

    order_map = {
        "newest": Track.uploaded_at.desc(),
        "oldest": Track.uploaded_at.asc(),
        "longest": Track.distance_km.desc(),
        "fastest": Track.speed_avg.desc(),
    }
    q = q.order_by(order_map.get(sort or "newest", Track.uploaded_at.desc()))

    return [TrackOut.from_orm_dt(t) for t in q.all()]


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_track(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    header = await file.read(2048)
    await file.seek(0)

    try:
        fmt = _detect_format(header, file.filename or "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    content = header + await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    name = (file.filename or "track").rsplit(".", 1)[0]
    track = Track(user_id=current_user.id, name=name, file_format=fmt, raw_points=None)
    db.add(track)
    db.commit()
    db.refresh(track)

    task = process_track.delay(track.id, content)
    return {"track_id": track.id, "task_id": task.id}


@router.get("/public/{public_token}", response_model=TrackDetail)
def get_public_track(public_token: str, db: Session = Depends(get_db)):
    track = db.query(Track).filter(Track.public_token == public_token, Track.is_public == True).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return TrackDetail.from_orm_dt(track)


@router.get("/{track_id}", response_model=TrackDetail)
def get_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return TrackDetail.from_orm_dt(track)


@router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    db.delete(track)
    db.commit()


@router.patch("/{track_id}/publish", response_model=TrackOut)
def toggle_publish(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    track.is_public = not track.is_public
    db.commit()
    db.refresh(track)
    return TrackOut.from_orm_dt(track)
