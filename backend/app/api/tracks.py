import datetime
from typing import List, Optional
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope
from pydantic import BaseModel, Field
from sqlalchemy import cast, func
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.http_utils import safe_content_disposition
from app.core.redis_client import redis_client
from app.models.track import Track
from app.models.user import User
from app.services.parser_factory import _haversine
from app.tasks.process_track import process_track

router = APIRouter(prefix="/api/tracks", tags=["tracks"])

MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB

# task_id -> user_id mapping for ownership checks in /api/tasks/{id}/status,
# TTL matches how long a client might reasonably still be polling.
TASK_OWNER_TTL_SECONDS = 24 * 3600


def _register_task_owner(task_id: str, user_id: int) -> None:
    redis_client.setex(f"task_owner:{task_id}", TASK_OWNER_TTL_SECONDS, str(user_id))

# Magic bytes for supported formats
MAGIC = {
    b"<?xml": ["gpx", "kml", "tcx"],
    b"\x0e\x10\x09\x08": ["fit"],
    b"{": ["geojson"],
}

ALLOWED_FORMATS = {"gpx", "kml", "tcx", "fit", "geojson"}


# ── Schemas ────────────────────────────────────────────────────────────────────

class Point(BaseModel):
    lat: float
    lon: float


class CreateTrackBody(BaseModel):
    name: str = Field(..., max_length=255)
    points: List[Point]
    format: str = "gpx"


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


def _points_to_gpx(points: List[Point]) -> str:
    """Convert points to GPX format."""
    header = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>Track</name><trkseg>\n'
    trkpts = "\n".join([
        f'<trkpt lat="{xml_escape(str(p.lat))}" lon="{xml_escape(str(p.lon))}"><ele>0</ele></trkpt>'
        for p in points
    ])
    footer = '\n</trkseg></trk>\n</gpx>'
    return header + trkpts + footer


def _points_to_kml(points: List[Point]) -> str:
    """Convert points to KML format."""
    coords = " ".join([f"{xml_escape(str(p.lon))},{xml_escape(str(p.lat))},0" for p in points])
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>{coords}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>'''


def _points_to_geojson(points: List[Point]) -> str:
    """Convert points to GeoJSON format."""
    import json
    coordinates = [[p.lon, p.lat] for p in points]
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": coordinates,
                },
            }
        ],
    }
    return json.dumps(geojson)


def _points_to_tcx(points: List[Point]) -> str:
    """Convert points to TCX format.

    Points from Track Creator carry no elevation/time (see Point schema) — so
    unlike a real GPS recording, Time here is synthetic (export time + 1s per
    point) rather than fabricated. AltitudeMeters is omitted entirely (optional
    in the TCX schema) instead of a false hardcoded 0.
    """
    start = datetime.datetime.now(datetime.timezone.utc)
    trackpoints = "\n".join([
        f'    <Trackpoint><Position><LatitudeDegrees>{xml_escape(str(p.lat))}</LatitudeDegrees>'
        f'<LongitudeDegrees>{xml_escape(str(p.lon))}</LongitudeDegrees></Position>'
        f'<Time>{(start + datetime.timedelta(seconds=i)).strftime("%Y-%m-%dT%H:%M:%SZ")}</Time></Trackpoint>'
        for i, p in enumerate(points)
    ])
    start_str = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Other">
      <Lap StartTime="{start_str}">
        <Track>
{trackpoints}
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>'''


def _points_to_fit(points: List[Point]) -> bytes:
    """Convert points to a valid FIT course file via fit-tool.

    Replaces the previous hand-rolled binary (no CRC, no message definitions,
    rejected by Strava/Garmin Connect) with a spec-compliant FIT course:
    FileId -> Course -> Event(START) -> Record* -> Event(STOP_ALL) -> Lap.
    Like _points_to_tcx, timestamps are synthetic (no real time data for a
    drawn track) and distance is accumulated via haversine between points.
    """
    from fit_tool.fit_file_builder import FitFileBuilder
    from fit_tool.profile.messages.course_message import CourseMessage
    from fit_tool.profile.messages.event_message import EventMessage
    from fit_tool.profile.messages.file_id_message import FileIdMessage
    from fit_tool.profile.messages.lap_message import LapMessage
    from fit_tool.profile.messages.record_message import RecordMessage
    from fit_tool.profile.profile_type import Event, EventType, FileType, Manufacturer, Sport

    builder = FitFileBuilder(auto_define=True, min_string_size=50)

    start_dt = datetime.datetime.now(datetime.timezone.utc)
    start_ts = round(start_dt.timestamp() * 1000)

    file_id = FileIdMessage()
    file_id.type = FileType.COURSE
    file_id.manufacturer = Manufacturer.DEVELOPMENT.value
    file_id.product = 0
    file_id.time_created = start_ts
    builder.add(file_id)

    course = CourseMessage()
    course.course_name = "Track"
    course.sport = Sport.CYCLING
    builder.add(course)

    start_event = EventMessage()
    start_event.event = Event.TIMER
    start_event.event_type = EventType.START
    start_event.timestamp = start_ts
    builder.add(start_event)

    records = []
    distance_m = 0.0
    prev: Optional[Point] = None
    ts = start_ts
    for p in points:
        if prev is not None:
            distance_m += _haversine(prev.lat, prev.lon, p.lat, p.lon) * 1000
        record = RecordMessage()
        record.position_lat = p.lat
        record.position_long = p.lon
        record.distance = distance_m
        record.timestamp = ts
        records.append(record)
        prev = p
        ts += 1000  # synthetic 1s spacing — no real timing data for a drawn track
    builder.add_all(records)

    stop_event = EventMessage()
    stop_event.event = Event.TIMER
    stop_event.event_type = EventType.STOP_ALL
    stop_event.timestamp = ts
    builder.add(stop_event)

    lap = LapMessage()
    lap.timestamp = ts
    lap.start_time = start_ts
    lap.total_elapsed_time = (ts - start_ts) / 1000
    lap.total_timer_time = (ts - start_ts) / 1000
    lap.total_distance = distance_m
    builder.add(lap)

    return builder.build().to_bytes()


# ── Schemas ────────────────────────────────────────────────────────────────────

class TrackOut(BaseModel):
    id: int
    name: str
    file_format: str
    distance_km: Optional[float]
    duration_sec: Optional[int]
    moving_time_sec: Optional[int]
    recorded_at: Optional[str]
    uploaded_at: Optional[str]
    speed_avg: Optional[float]
    speed_max: Optional[float]
    speed_min: Optional[float]
    elevation_gain: Optional[float]
    elevation_loss: Optional[float]
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
            moving_time_sec=t.moving_time_sec,
            recorded_at=t.recorded_at.isoformat() if t.recorded_at else None,
            uploaded_at=t.uploaded_at.isoformat() if t.uploaded_at else None,
            speed_avg=t.speed_avg,
            speed_max=t.speed_max,
            speed_min=t.speed_min,
            elevation_gain=t.elevation_gain,
            elevation_loss=t.elevation_loss,
            regions=t.regions,
            is_public=t.is_public,
            public_token=t.public_token,
        )


class TrackListResponse(BaseModel):
    items: List[TrackOut]
    total: int
    has_more: bool


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

@router.get("", response_model=TrackListResponse)
def list_tracks(
    sort: Optional[str] = Query(None, pattern="^(newest|oldest|longest|shortest|fastest|slowest)$"),
    search: Optional[str] = Query(None, max_length=200),
    bbox: Optional[str] = Query(None, description="minLng,minLat,maxLng,maxLat"),
    file_format: Optional[str] = Query(None),
    speed_avg_min: Optional[float] = Query(None),
    speed_avg_max: Optional[float] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
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
        "shortest": Track.distance_km.asc(),
        "fastest": Track.speed_avg.desc(),
        "slowest": Track.speed_avg.asc(),
    }
    q = q.order_by(order_map.get(sort or "newest", Track.uploaded_at.desc()))

    total = q.count()
    items = q.offset(offset).limit(limit).all()
    has_more = offset + limit < total

    return TrackListResponse(
        items=[TrackOut.from_orm_dt(t) for t in items],
        total=total,
        has_more=has_more,
    )


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
    _register_task_owner(task.id, current_user.id)
    return {"track_id": track.id, "task_id": task.id}


def _validate_track_points(points: List[Point]) -> None:
    if len(points) < 2:
        raise HTTPException(status_code=400, detail="At least 2 points required")
    for point in points:
        if not (-90 <= point.lat <= 90):
            raise HTTPException(status_code=400, detail="Invalid latitude")
        if not (-180 <= point.lon <= 180):
            raise HTTPException(status_code=400, detail="Invalid longitude")


def _convert_points_to_file(points: List[Point], fmt: str) -> bytes:
    if fmt == "gpx":
        return _points_to_gpx(points).encode("utf-8")
    elif fmt == "kml":
        return _points_to_kml(points).encode("utf-8")
    elif fmt == "geojson":
        return _points_to_geojson(points).encode("utf-8")
    elif fmt == "tcx":
        return _points_to_tcx(points).encode("utf-8")
    elif fmt == "fit":
        return _points_to_fit(points)
    raise HTTPException(status_code=400, detail="Unsupported format")


_EXPORT_MEDIA_TYPES = {
    "gpx": "application/gpx+xml",
    "kml": "application/vnd.google-earth.kml+xml",
    "geojson": "application/geo+json",
    "tcx": "application/vnd.garmin.tcx+xml",
    "fit": "application/octet-stream",
}


class ExportTrackBody(BaseModel):
    name: str = Field("Track", max_length=255)
    points: List[Point]
    format: str = "gpx"


@router.post("/export")
async def export_track(
    body: ExportTrackBody,
    current_user: User = Depends(get_current_user),
):
    """Convert waypoints straight to a downloadable file, without saving a
    track — used by Track Creator's "Download" button (as opposed to
    /create, which persists). Reuses the same _points_to_* functions as
    /create so TCX/FIT stay correct in one place instead of two (T28)."""
    if body.format not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Format must be one of {ALLOWED_FORMATS}")
    _validate_track_points(body.points)
    content = _convert_points_to_file(body.points, body.format)

    name = (body.name or "Track").strip() or "Track"
    filename = f"{name}.{body.format}"
    return Response(
        content=content,
        media_type=_EXPORT_MEDIA_TYPES[body.format],
        headers={"Content-Disposition": safe_content_disposition(filename)},
    )


@router.post("/create", response_model=TrackOut, status_code=status.HTTP_201_CREATED)
async def create_track(
    body: CreateTrackBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create track from waypoints (e.g., drawn on map)."""
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Track name required")

    if body.format not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Format must be one of {ALLOWED_FORMATS}")

    _validate_track_points(body.points)
    content = _convert_points_to_file(body.points, body.format)

    # Create track record
    name = body.name.strip()
    track = Track(user_id=current_user.id, name=name, file_format=body.format, raw_points=None)
    db.add(track)
    db.commit()
    db.refresh(track)

    # Queue for async processing
    task = process_track.delay(track.id, content)
    _register_task_owner(task.id, current_user.id)

    return TrackOut.from_orm_dt(track)


class TrackGeometry(BaseModel):
    id: int
    normalized_points: Optional[object] = None


@router.get("/geometries", response_model=List[TrackGeometry])
def list_track_geometries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight bulk endpoint: only id + normalized_points for all of the user's tracks.

    Must be declared above GET /{track_id}, otherwise FastAPI would match
    "geometries" as a track_id path param. Intentionally not paginated — the
    heatmap/map layers need every track's geometry in one call — but capped
    to bound the worst-case response size for a single request.
    """
    tracks = (
        db.query(Track.id, Track.normalized_points)
        .filter(Track.user_id == current_user.id)
        .limit(5000)
        .all()
    )
    return [{"id": t.id, "normalized_points": t.normalized_points} for t in tracks]


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


class RenameBody(BaseModel):
    name: str = Field(..., max_length=255)


@router.patch("/{track_id}/rename", response_model=TrackOut)
def rename_track(
    track_id: int,
    body: RenameBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    track.name = name
    db.commit()
    db.refresh(track)
    return TrackOut.from_orm_dt(track)


def _raw_points_to_gpx(points: List[dict], name: str) -> str:
    header = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n'
        f'<trk><name>{xml_escape(name)}</name><trkseg>\n'
    )
    parts = []
    for p in points:
        attrs = f'lat="{xml_escape(str(p["lat"]))}" lon="{xml_escape(str(p["lon"]))}"'
        children = ""
        if p.get("elevation") is not None:
            children += f'<ele>{p["elevation"]}</ele>'
        if p.get("time"):
            children += f'<time>{xml_escape(p["time"])}</time>'
        parts.append(f'<trkpt {attrs}>{children}</trkpt>')
    return header + "\n".join(parts) + '\n</trkseg></trk>\n</gpx>'


def _raw_points_to_kml(points: List[dict], name: str) -> str:
    coords = " ".join(
        f'{p["lon"]},{p["lat"]},{p.get("elevation") or 0}' for p in points
    )
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>{xml_escape(name)}</name>
      <LineString>
        <coordinates>{coords}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>'''


def _raw_points_to_geojson(points: List[dict], name: str) -> str:
    import json
    coordinates = [
        [p["lon"], p["lat"]] + ([p["elevation"]] if p.get("elevation") is not None else [])
        for p in points
    ]
    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coordinates},
            "properties": {"name": name},
        }],
    }
    return json.dumps(geojson)


def _raw_points_to_tcx(points: List[dict], name: str) -> str:
    start_str = points[0]["time"] if points and points[0].get("time") else \
        datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    trackpoints = []
    for p in points:
        tp = (
            f'<Trackpoint><Position><LatitudeDegrees>{xml_escape(str(p["lat"]))}</LatitudeDegrees>'
            f'<LongitudeDegrees>{xml_escape(str(p["lon"]))}</LongitudeDegrees></Position>'
        )
        if p.get("time"):
            tp += f'<Time>{xml_escape(p["time"])}</Time>'
        if p.get("elevation") is not None:
            tp += f'<AltitudeMeters>{p["elevation"]}</AltitudeMeters>'
        tp += '</Trackpoint>'
        trackpoints.append(tp)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Other">
      <Lap StartTime="{start_str}">
        <Track>
{chr(10).join(trackpoints)}
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>'''


def _raw_points_to_fit(points: List[dict], name: str) -> bytes:
    from fit_tool.fit_file_builder import FitFileBuilder
    from fit_tool.profile.messages.course_message import CourseMessage
    from fit_tool.profile.messages.event_message import EventMessage
    from fit_tool.profile.messages.file_id_message import FileIdMessage
    from fit_tool.profile.messages.lap_message import LapMessage
    from fit_tool.profile.messages.record_message import RecordMessage
    from fit_tool.profile.profile_type import Event, EventType, FileType, Manufacturer, Sport

    def parse_ts(p, fallback_ms):
        if p.get("time"):
            try:
                return round(datetime.datetime.fromisoformat(p["time"]).timestamp() * 1000)
            except ValueError:
                pass
        return fallback_ms

    builder = FitFileBuilder(auto_define=True, min_string_size=50)

    start_dt = datetime.datetime.now(datetime.timezone.utc)
    start_ts = parse_ts(points[0], round(start_dt.timestamp() * 1000)) if points else round(start_dt.timestamp() * 1000)

    file_id = FileIdMessage()
    file_id.type = FileType.COURSE
    file_id.manufacturer = Manufacturer.DEVELOPMENT.value
    file_id.product = 0
    file_id.time_created = start_ts
    builder.add(file_id)

    course = CourseMessage()
    course.course_name = name
    course.sport = Sport.CYCLING
    builder.add(course)

    start_event = EventMessage()
    start_event.event = Event.TIMER
    start_event.event_type = EventType.START
    start_event.timestamp = start_ts
    builder.add(start_event)

    records = []
    distance_m = 0.0
    prev = None
    ts = start_ts
    for i, p in enumerate(points):
        if prev is not None:
            distance_m += _haversine(prev["lat"], prev["lon"], p["lat"], p["lon"]) * 1000
        ts = parse_ts(p, start_ts + i * 1000)
        record = RecordMessage()
        record.position_lat = p["lat"]
        record.position_long = p["lon"]
        record.distance = distance_m
        record.timestamp = ts
        if p.get("elevation") is not None:
            record.altitude = p["elevation"]
        records.append(record)
        prev = p
    builder.add_all(records)

    stop_event = EventMessage()
    stop_event.event = Event.TIMER
    stop_event.event_type = EventType.STOP_ALL
    stop_event.timestamp = ts
    builder.add(stop_event)

    lap = LapMessage()
    lap.timestamp = ts
    lap.start_time = start_ts
    lap.total_elapsed_time = (ts - start_ts) / 1000
    lap.total_timer_time = (ts - start_ts) / 1000
    lap.total_distance = distance_m
    builder.add(lap)

    return builder.build().to_bytes()


_DOWNLOAD_MEDIA_TYPES = {
    "gpx": "application/gpx+xml",
    "kml": "application/vnd.google-earth.kml+xml",
    "geojson": "application/geo+json",
    "tcx": "application/vnd.garmin.tcx+xml",
    "fit": "application/octet-stream",
}


@router.get("/{track_id}/download")
def download_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.raw_points:
        raise HTTPException(status_code=404, detail="No file data available")

    fmt = track.file_format if track.file_format in ALLOWED_FORMATS else "gpx"
    name = track.name or "Track"

    if fmt == "gpx":
        content = _raw_points_to_gpx(track.raw_points, name).encode("utf-8")
    elif fmt == "kml":
        content = _raw_points_to_kml(track.raw_points, name).encode("utf-8")
    elif fmt == "tcx":
        content = _raw_points_to_tcx(track.raw_points, name).encode("utf-8")
    elif fmt == "fit":
        content = _raw_points_to_fit(track.raw_points, name)
    else:
        content = _raw_points_to_geojson(track.raw_points, name).encode("utf-8")

    filename = f"{name}.{fmt}"
    return Response(
        content=content,
        media_type=_DOWNLOAD_MEDIA_TYPES[fmt],
        headers={
            "Content-Disposition": safe_content_disposition(filename),
            "Cache-Control": "no-store",
        },
    )


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
