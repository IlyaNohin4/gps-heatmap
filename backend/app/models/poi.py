from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.core.database import Base


class POI(Base):
    __tablename__ = "poi"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    category = Column(String(100), index=True)
    description = Column(Text)
    icon = Column(String(50), nullable=True)
    color = Column(String(20), nullable=True)
    visited = Column(Boolean, nullable=False, default=False, server_default='false')
    source = Column(String(50), default='user')
    import_name = Column(String(255))
    # Raw KML style/altitude, captured on import purely for round-trip export
    # fidelity — independent of `icon`/`color`, which stay our own normalized
    # slug/hex used for in-app markers.
    kml_icon_href = Column(String(500), nullable=True)
    kml_style_color = Column(String(8), nullable=True)
    kml_altitude = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
