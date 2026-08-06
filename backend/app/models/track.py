import secrets
from datetime import datetime, timezone

from geoalchemy2 import Geometry
from sqlalchemy import (
    ARRAY,
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)

from app.core.database import Base


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    file_format = Column(String(10), nullable=False, index=True)

    distance_km = Column(Float, index=True)
    duration_sec = Column(Integer)
    moving_time_sec = Column(Integer, nullable=True)
    recorded_at = Column(DateTime(timezone=True), index=True)
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    # Set when the Celery task actually acquires the sequential-processing
    # lock and starts working on this track — NULL while still queued behind
    # other uploads. The stuck-processing reaper (list_tracks) uses this,
    # not uploaded_at, to tell "genuinely still queued" apart from "worker
    # died mid-task" — see M1-followup in the security audit backlog.
    processing_started_at = Column(DateTime(timezone=True), nullable=True)

    speed_avg = Column(Float, index=True)
    speed_max = Column(Float)
    speed_min = Column(Float)

    elevation_gain = Column(Float)
    elevation_loss = Column(Float)

    regions = Column(ARRAY(Text), default=list)
    geom = Column(Geometry("LINESTRING", srid=4326))
    raw_points = Column(JSON)
    # Hex color (e.g. "#4986e8"), set once at creation when the owner has
    # User.randomize_track_colors on — null means "use the frontend's
    # sequential per-list-position color" (TrackLayer's colorForIndex).
    color = Column(String(7), nullable=True)
    normalized_points = Column(JSON)
    speed_segments = Column(JSON)

    is_public = Column(Boolean, default=False)
    public_token = Column(String(64), unique=True, default=lambda: secrets.token_urlsafe(32))

    # "processing" | "done" | "error" — set to "processing" at upload, then
    # finalized by the Celery task. See M1: a track stuck in "processing"
    # (e.g. worker crash mid-task) is lazily reaped in list_tracks().
    status = Column(String(20), nullable=False, default="processing", index=True)
    error_detail = Column(Text, nullable=True)
