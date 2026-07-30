from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = "HS256"

# bcrypt silently truncates at 72 bytes — we raise early to avoid silent data loss
_BCRYPT_MAX = 72


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > _BCRYPT_MAX:
        raise ValueError("Password must be 72 bytes or fewer")
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    raw = plain.encode("utf-8")
    if len(raw) > _BCRYPT_MAX:
        return False
    return bcrypt.checkpw(raw, hashed.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.JWT_EXPIRES_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "iat": now},
        settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> tuple[int, datetime]:
    """Returns (user_id, issued_at) — issued_at lets callers reject tokens
    minted before a password change (see get_current_user)."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    try:
        user_id = int(payload["sub"])
        issued_at = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
    except (KeyError, TypeError, ValueError) as exc:
        raise JWTError("Invalid token payload") from exc
    return user_id, issued_at
