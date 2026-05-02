from __future__ import annotations

from sqlalchemy.orm import Session

from app.schemas import LlmSettingsIn, PomodoroSettingsIn

from ...legacy_bridge import get_all_user_settings, get_int_user_setting, get_site_ai_config, llm_settings_payload, set_setting, set_user_setting


def load_llm_settings(db: Session, user) -> dict:
    return llm_settings_payload(db, user)


def save_llm_settings(db: Session, user, payload: LlmSettingsIn) -> dict:
    if payload.model is not None:
        set_user_setting(db, user.id, "llm_model", payload.model)
    if payload.reasoning_effort is not None:
        set_user_setting(db, user.id, "llm_reasoning_effort", payload.reasoning_effort)
    site = get_site_ai_config(db)
    if not site["managed_by_environment"]:
        if payload.base_url is not None:
            set_setting(db, "llm_base_url", payload.base_url.rstrip("/"))
        if payload.api_key is not None and payload.api_key != "********":
            set_setting(db, "llm_api_key", payload.api_key)
    return llm_settings_payload(db, user)


def load_pomodoro_settings(db: Session, user) -> dict:
    return {
        "focus_minutes": get_int_user_setting(db, user.id, "pomodoro_focus_minutes", 25),
        "short_break_minutes": get_int_user_setting(db, user.id, "pomodoro_short_break_minutes", 5),
        "long_break_minutes": get_int_user_setting(db, user.id, "pomodoro_long_break_minutes", 15),
        "total_rounds": get_int_user_setting(db, user.id, "pomodoro_total_rounds", 4),
    }


def save_pomodoro_settings(db: Session, user, payload: PomodoroSettingsIn) -> dict:
    set_user_setting(db, user.id, "pomodoro_focus_minutes", str(payload.focus_minutes))
    set_user_setting(db, user.id, "pomodoro_short_break_minutes", str(payload.short_break_minutes))
    set_user_setting(db, user.id, "pomodoro_long_break_minutes", str(payload.long_break_minutes))
    set_user_setting(db, user.id, "pomodoro_total_rounds", str(payload.total_rounds))
    return load_pomodoro_settings(db, user)
