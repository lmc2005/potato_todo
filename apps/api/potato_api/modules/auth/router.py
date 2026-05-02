from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.db import get_db
from ...core.deps import get_current_user
from ...legacy_bridge import User
from .schemas import AuthSessionOut, RegisterInput, LoginInput
from .service import login_user_session, logout_user_session, refresh_user_session, register_user_session, user_profile


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthSessionOut)
def register(payload: RegisterInput, response: Response, db: Session = Depends(get_db)):
    return register_user_session(db, payload, response)


@router.post("/login", response_model=AuthSessionOut)
def login(payload: LoginInput, response: Response, db: Session = Depends(get_db)):
    return login_user_session(db, payload, response)


@router.post("/refresh", response_model=AuthSessionOut)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
):
    return refresh_user_session(db, refresh_token, response)


@router.post("/logout")
def logout(response: Response):
    return logout_user_session(response)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user_profile(user.id, user.email)}
