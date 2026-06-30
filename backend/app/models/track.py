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
    file_format = Column(String(10), nullable=False)

    distance_km = Column(Float)
    duration_sec = Column(Integer)
    recorded_at = Column(DateTime(timezone=True))
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    speed_avg = Column(Float)
    speed_max = Column(Float)
    speed_min = Column(Float)

    regions = Column(ARRAY(Text), default=list)
    geom = Column(Geometry("LINESTRING", srid=4326))
    raw_points = Column(JSON)
    normalized_points = Column(JSON)
    speed_segments = Column(JSON)

    is_public = Column(Boolean, default=False)
    public_token = Column(String(64), unique=True, default=lambda: secrets.token_urlsafe(32))
