from __future__ import annotations

from fastapi import HTTPException, Response, status
from sqlalchemy.orm import Session

from app.models import User

from ...core.security import clear_refresh_cookie, create_access_token, create_refresh_token, decode_token, set_refresh_cookie
from ...legacy_bridge import authenticate_user, create_user, normalize_email
from .domain import auth_user_payload
from .repository import get_user_by_email
from .schemas import AuthSessionOut, LoginInput, RegisterInput


def register_user_session(db: Session, payload: RegisterInput, response: Response) -> AuthSessionOut:
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match.")
    user = create_user(db, payload.email, payload.password)
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, refresh_token)
    return AuthSessionOut(access_token=access_token, user=auth_user_payload(user.id, user.email))


def login_user_session(db: Session, payload: LoginInput, response: Response) -> AuthSessionOut:
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, refresh_token)
    return AuthSessionOut(access_token=access_token, user=auth_user_payload(user.id, user.email))


def refresh_user_session(db: Session, refresh_token: str | None, response: Response) -> AuthSessionOut:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is required.")
    payload = decode_token(refresh_token, "refresh")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not available.")
    access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, new_refresh_token)
    return AuthSessionOut(access_token=access_token, user=auth_user_payload(user.id, user.email))


def logout_user_session(response: Response) -> dict[str, bool]:
    clear_refresh_cookie(response)
    return {"ok": True}


def user_profile(user_id: int, email: str) -> dict[str, str | int]:
    return auth_user_payload(user_id, normalize_email(email))
