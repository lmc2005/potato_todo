from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas import LlmSettingsIn, PomodoroSettingsIn

from ...core.deps import get_current_user
from ...legacy_bridge import User, get_db
from .domain import settings_payload
from .service import load_llm_settings, load_pomodoro_settings, save_llm_settings, save_pomodoro_settings


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/llm")
def get_llm(db=Depends(get_db), user: User = Depends(get_current_user)):
    return settings_payload(load_llm_settings(db, user))


@router.post("/llm")
def save_llm(payload: LlmSettingsIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return settings_payload(save_llm_settings(db, user, payload))


@router.get("/pomodoro")
def get_pomodoro(db=Depends(get_db), user: User = Depends(get_current_user)):
    return settings_payload(load_pomodoro_settings(db, user))


@router.post("/pomodoro")
def save_pomodoro(payload: PomodoroSettingsIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return settings_payload(save_pomodoro_settings(db, user, payload))
