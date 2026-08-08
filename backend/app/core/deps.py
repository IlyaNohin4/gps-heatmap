from datetime import timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        user_id, issued_at = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.password_changed_at is not None:
        # SQLite (used in tests) returns naive datetimes even for
        # DateTime(timezone=True) columns; Postgres returns aware ones.
        changed_at = user.password_changed_at
        if changed_at.tzinfo is None:
            changed_at = changed_at.replace(tzinfo=timezone.utc)
        # JWT "iat" is second-granular (whole-second floor per the JWT spec),
        # while password_changed_at keeps microseconds — floor it too so a
        # token issued in the very same second as the password change isn't
        # incorrectly treated as "before" it.
        changed_at = changed_at.replace(microsecond=0)
        if issued_at < changed_at:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no longer valid")
    return user


def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    """Gate for the /api/admin/* routes — same auth as get_current_user, plus
    is_admin. 403 (not 404) since the caller is authenticated, just not
    authorized; matches the rest of the app's convention."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
