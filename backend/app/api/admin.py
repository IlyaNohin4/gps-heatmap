import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.auth import _send_reset_email
from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.core.security import hash_password
from app.models.app_settings import AppSettings
from app.models.invite_token import InviteToken
from app.models.password_reset import PasswordReset
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get_settings_row(db: Session) -> AppSettings:
    # Singleton — created by migration 0023, but get_or_create here too in
    # case that row is ever missing (manual DB edits, a future reset).
    row = db.get(AppSettings, 1)
    if row is None:
        row = AppSettings(id=1, registration_enabled=True)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# ── Registration toggle ──────────────────────────────────────────────────────

class SettingsOut(BaseModel):
    registration_enabled: bool


class UpdateSettingsRequest(BaseModel):
    registration_enabled: bool


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    return _get_settings_row(db)


@router.patch("/settings", response_model=SettingsOut)
def update_settings(
    body: UpdateSettingsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    row = _get_settings_row(db)
    row.registration_enabled = body.registration_enabled
    db.commit()
    db.refresh(row)
    return row


# ── Invite links ──────────────────────────────────────────────────────────────

class InviteOut(BaseModel):
    id: int
    token: str
    created_at: Optional[datetime] = None
    max_uses: Optional[int] = None
    use_count: int
    revoked: bool

    model_config = {"from_attributes": True}


class CreateInviteRequest(BaseModel):
    # None = unlimited uses (multi-use, lives until an admin revokes it);
    # 1 = single-use (burns itself on the first successful registration).
    max_uses: Optional[int] = 1


@router.get("/invites", response_model=List[InviteOut])
def list_invites(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    return db.query(InviteToken).order_by(InviteToken.created_at.desc()).all()


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: CreateInviteRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    if body.max_uses is not None and body.max_uses < 1:
        raise HTTPException(status_code=400, detail="max_uses must be at least 1")
    invite = InviteToken(
        token=secrets.token_urlsafe(24),
        created_by=admin.id,
        max_uses=body.max_uses,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    invite = db.get(InviteToken, invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.revoked = True
    db.commit()


# ── User management ──────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id: int
    email: str
    is_admin: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UpdateUserEmailRequest(BaseModel):
    email: EmailStr


class SetUserAdminRequest(BaseModel):
    is_admin: bool


class SetUserPasswordRequest(BaseModel):
    new_password: str


@router.get("/users", response_model=List[AdminUserOut])
def list_users(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    q = db.query(User)
    if search:
        q = q.filter(User.email.ilike(f"%{search.strip()}%"))
    return q.order_by(User.created_at.desc()).limit(200).all()


@router.patch("/users/{user_id}/email", response_model=AdminUserOut)
def set_user_email(
    user_id: int,
    body: UpdateUserEmailRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    normalized = body.email.strip().lower()
    if db.query(User).filter(User.email == normalized, User.id != user_id).first():
        raise HTTPException(status_code=409, detail="Email already in use")
    user.email = normalized
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/admin", response_model=AdminUserOut)
def set_user_admin(
    user_id: int,
    body: SetUserAdminRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    if user_id == admin.id and not body.is_admin:
        # Not a hard rule (there's no other bootstrap path to become an
        # admin besides a manual DB flip), but stopping the only-admin case
        # from locking themselves out with a stray click is cheap insurance.
        raise HTTPException(status_code=400, detail="Cannot remove your own admin access")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = body.is_admin
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def set_user_password(
    user_id: int,
    body: SetUserPasswordRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(body.new_password)
    # Invalidates every token issued before this instant (see deps.py) —
    # same effect as a self-service password change, just admin-initiated.
    user.password_changed_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/users/{user_id}/send-reset-email", status_code=status.HTTP_204_NO_CONTENT)
def send_reset_email(
    user_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """Admin-triggered version of POST /auth/forgot-password — same token/
    email flow, just skipped the "does this email exist" ambiguity since
    the admin is looking straight at the user row."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.query(PasswordReset).filter(
        PasswordReset.user_id == user.id,
        (PasswordReset.used == True) | (PasswordReset.expires_at <= datetime.now(timezone.utc)),
    ).delete(synchronize_session=False)

    token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    db.add(PasswordReset(token=token_hash, user_id=user.id, expires_at=expires))
    db.commit()

    background_tasks.add_task(_send_reset_email, user.email, token, user.id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Use account settings to delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
