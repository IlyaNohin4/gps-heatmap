from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.core.database import Base

# Suggested categories every account starts with (see auth.py register()) —
# keep in sync with frontend/src/utils/poiCategories.js POI_CATEGORIES, so
# the picker and "Manage categories" always show the same list.
DEFAULT_CATEGORIES = [
    'Food', 'Medical', 'Transport', 'Accommodation', 'Tourism',
    'Amenities', 'Bicycle', 'Public Transport', 'Other',
]


class POICategory(Base):
    """A user-registered category name, independent of whether any POI uses
    it yet — lets a category be created ahead of time (see /api/poi/categories
    POST), mirroring how POIImport lists can exist empty."""

    __tablename__ = "poi_categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_poi_categories_user_name"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
