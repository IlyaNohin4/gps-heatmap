from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    # JWTs issued before this timestamp are rejected (see get_current_user) —
    # lets a password change/reset invalidate any already-issued tokens.
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # User preferences (synced across devices)
    language = Column(String(8), nullable=False, server_default="en")
    theme = Column(String(10), nullable=False, server_default="light")
    unit_distance = Column(String(4), nullable=False, server_default="km")
    unit_speed = Column(String(8), nullable=False, server_default="kmh")
    notifications_enabled = Column(Boolean, nullable=False, server_default="true")
    show_start_end_markers = Column(Boolean, nullable=False, server_default="true")
    # When on, newly created/uploaded tracks get a random color (from the
    # same swatch set as POI colors) baked into Track.color at creation time,
    # instead of the frontend's default sequential-by-list-position color.
    randomize_track_colors = Column(Boolean, nullable=False, server_default="false")
    # Which screen corner toast notifications stack in — was frontend-only
    # localStorage state; moved server-side so it (like the rest of these
    # prefs) survives across devices/reloads without relying on local
    # persistence at all.
    toast_position = Column(String(12), nullable=False, server_default="top-right")
