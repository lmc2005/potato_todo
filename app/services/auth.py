from __future__ import annotations

import hashlib
import hmac
import os
from typing import Type

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models import AiConversation, AiDraft, ScheduleEvent, StudySession, Subject, Task, TimerState, User, UserSetting


PASSWORD_ITERATIONS = 260_000
SESSION_USER_ID_KEY = "user_id"
LEGACY_USER_SCOPED_MODELS: list[Type] = [Subject, Task, ScheduleEvent, StudySession, TimerState, AiDraft, AiConversation]


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_hex, digest_hex = stored_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    try:
        iterations = int(iterations_raw)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        iterations,
    )
    return hmac.compare_digest(check.hex(), digest_hex)


def create_user(db: Session, email: str, password: str) -> User:
    email = normalize_email(email)
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if db.query(User).filter(User.email == email).first() is not None:
        raise HTTPException(status_code=400, detail="Email is already registered.")
    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == normalize_email(email)).first()
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_current_user(request: Request, db: Session) -> User | None:
    user_id = request.session.get(SESSION_USER_ID_KEY)
    if not user_id:
        return None
    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        request.session.pop(SESSION_USER_ID_KEY, None)
        return None
    return user


def require_user(request: Request, db: Session) -> User:
    user = get_current_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def login_user(request: Request, user: User) -> None:
    request.session[SESSION_USER_ID_KEY] = int(user.id)


def logout_user(request: Request) -> None:
    request.session.pop(SESSION_USER_ID_KEY, None)


def user_label(user: User) -> str:
    local = user.email.split("@", 1)[0].strip()
    return local or user.email


def claim_legacy_data(db: Session, user_id: int) -> None:
    updated = False
    for model in LEGACY_USER_SCOPED_MODELS:
        if hasattr(model, "user_id"):
            count = (
                db.query(model)
                .filter(getattr(model, "user_id").is_(None))
                .update({getattr(model, "user_id"): user_id}, synchronize_session=False)
            )
            updated = updated or bool(count)

    for setting_key in (
        "pomodoro_focus_minutes",
        "pomodoro_short_break_minutes",
        "pomodoro_long_break_minutes",
        "pomodoro_total_rounds",
        "notifications_enabled",
        "theme",
        "llm_model",
        "llm_reasoning_effort",
    ):
        exists = (
            db.query(UserSetting)
            .filter(UserSetting.user_id == user_id, UserSetting.key == setting_key)
            .first()
        )
        if exists is not None:
            continue
        from app.models import Setting

        legacy_setting = db.get(Setting, setting_key)
        if legacy_setting is not None:
            db.add(UserSetting(user_id=user_id, key=setting_key, value=legacy_setting.value))
            updated = True
    if updated:
        db.commit()
