from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from app.core.database import Base


class InviteToken(Base):
    """Admin-generated registration bypass, used when
    AppSettings.registration_enabled is off. max_uses=1 (the default,
    "single-use") burns the token on its first successful registration;
    max_uses=None means unlimited uses until an admin revokes it."""

    __tablename__ = "invite_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    max_uses = Column(Integer, nullable=True)  # None = unlimited
    use_count = Column(Integer, nullable=False, default=0)
    revoked = Column(Boolean, nullable=False, default=False)
