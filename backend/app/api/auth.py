import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models.password_reset import PasswordReset
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        return  # Don't reveal whether email exists

    token = secrets.token_urlsafe(64)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    db.add(PasswordReset(token=token, user_id=user.id, expires_at=expires))
    db.commit()

    try:
        import resend
        from app.core.config import settings
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": "noreply@gpsheatmap.app",
            "to": user.email,
            "subject": "Reset your password",
            "html": f"<p>Click to reset: <a href='https://gpsheatmap.app/reset-password/{token}'>Reset password</a></p>",
        })
    except Exception:
        # User-facing behavior stays silent (don't reveal email delivery status),
        # but log so failures (bad API key, network) are diagnosable. Token is still saved.
        logger.error("Failed to send password reset email to user_id=%s", user.id, exc_info=True)


@router.post("/reset-password/{token}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
def reset_password(request: Request, token: str, body: ResetPasswordRequest, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    reset = (
        db.query(PasswordReset)
        .filter(PasswordReset.token == token, PasswordReset.used == False, PasswordReset.expires_at > now)
        .first()
    )
    if not reset:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user = db.get(User, reset.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password_hash = hash_password(body.password)
    reset.used = True
    db.commit()


# ── User profile / preferences ─────────────────────────────────────────────────

VALID_LANGUAGES = {"en", "es", "de", "ru", "uk"}
VALID_THEMES = {"light", "dark"}
VALID_UNIT_DISTANCE = {"km", "mi"}
VALID_UNIT_SPEED = {"kmh", "mph", "ms"}


class UserOut(BaseModel):
    id: int
    email: str
    language: str
    theme: str
    unit_distance: str
    unit_speed: str

    model_config = {"from_attributes": True}


class UpdatePrefsRequest(BaseModel):
    email: Optional[EmailStr] = None
    language: Optional[str] = None
    theme: Optional[str] = None
    unit_distance: Optional[str] = None
    unit_speed: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UpdatePrefsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.email is not None:
        normalized = body.email.lower().strip()
        if normalized != current_user.email:
            if db.query(User).filter(User.email == normalized, User.id != current_user.id).first():
                raise HTTPException(status_code=409, detail="Email already in use")
            current_user.email = normalized
    if body.language is not None:
        if body.language not in VALID_LANGUAGES:
            raise HTTPException(status_code=400, detail="Invalid language")
        current_user.language = body.language
    if body.theme is not None:
        if body.theme not in VALID_THEMES:
            raise HTTPException(status_code=400, detail="Invalid theme")
        current_user.theme = body.theme
    if body.unit_distance is not None:
        if body.unit_distance not in VALID_UNIT_DISTANCE:
            raise HTTPException(status_code=400, detail="Invalid unit_distance")
        current_user.unit_distance = body.unit_distance
    if body.unit_speed is not None:
        if body.unit_speed not in VALID_UNIT_SPEED:
            raise HTTPException(status_code=400, detail="Invalid unit_speed")
        current_user.unit_speed = body.unit_speed
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    db.commit()


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.delete(current_user)
    db.commit()
