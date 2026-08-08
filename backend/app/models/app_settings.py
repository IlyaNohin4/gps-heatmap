from sqlalchemy import Boolean, Column, Integer

from app.core.database import Base


class AppSettings(Base):
    """Singleton row (id always 1) holding global, admin-controlled toggles —
    currently just registration_enabled. Not a User preference (those live
    on User itself), this is instance-wide config."""

    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True)
    registration_enabled = Column(Boolean, nullable=False, server_default="true")
