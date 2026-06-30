from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # User preferences (synced across devices)
    language = Column(String(8), nullable=False, server_default="en")
    theme = Column(String(10), nullable=False, server_default="light")
    unit_distance = Column(String(4), nullable=False, server_default="km")
    unit_speed = Column(String(8), nullable=False, server_default="kmh")
