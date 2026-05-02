from __future__ import annotations

import os
from typing import Any

from sqlalchemy.orm import Session

from app.models import Setting, UserSetting


DEFAULT_USER_SETTINGS = {
    "llm_model": "gpt-5.4",
    "llm_reasoning_effort": "medium",
    "pomodoro_focus_minutes": "25",
    "pomodoro_short_break_minutes": "5",
    "pomodoro_long_break_minutes": "15",
    "pomodoro_total_rounds": "4",
    "notifications_enabled": "true",
    "theme": "glass",
}


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    setting = db.get(Setting, key)
    if setting is None:
        return default
    return setting.value


def set_setting(db: Session, key: str, value: str | None) -> Setting:
    setting = db.get(Setting, key)
    if setting is None:
        setting = Setting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    db.refresh(setting)
    return setting


def get_user_setting(db: Session, user_id: int, key: str, default: str | None = None) -> str | None:
    row = (
        db.query(UserSetting)
        .filter(UserSetting.user_id == user_id, UserSetting.key == key)
        .first()
    )
    if row is None:
        return DEFAULT_USER_SETTINGS.get(key, default)
    return row.value


def set_user_setting(db: Session, user_id: int, key: str, value: str | None) -> UserSetting:
    row = (
        db.query(UserSetting)
        .filter(UserSetting.user_id == user_id, UserSetting.key == key)
        .first()
    )
    if row is None:
        row = UserSetting(user_id=user_id, key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()
    db.refresh(row)
    return row


def get_all_user_settings(db: Session, user_id: int, include_secret: bool = False) -> dict[str, str | None]:
    values = DEFAULT_USER_SETTINGS.copy()
    for row in db.query(UserSetting).filter(UserSetting.user_id == user_id).all():
        values[row.key] = row.value
    if not include_secret and values.get("llm_api_key"):
        values["llm_api_key"] = "********"
    return values


def get_int_user_setting(db: Session, user_id: int, key: str, default: int) -> int:
    raw = get_user_setting(db, user_id, key, str(default))
    try:
        return int(raw or default)
    except ValueError:
        return default


def _truthy(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_site_ai_config(db: Session) -> dict[str, Any]:
    env_base_url = (os.getenv("OPENAI_BASE_URL") or "").rstrip("/")
    env_api_key = os.getenv("OPENAI_API_KEY") or ""
    env_model = os.getenv("OPENAI_MODEL") or ""
    env_reasoning = os.getenv("OPENAI_REASONING_EFFORT") or ""
    enabled_env = os.getenv("AI_ENABLED")

    legacy_base_url = (get_setting(db, "llm_base_url", "") or "").rstrip("/")
    legacy_api_key = get_setting(db, "llm_api_key", "") or ""
    legacy_model = get_setting(db, "llm_model", DEFAULT_USER_SETTINGS["llm_model"]) or DEFAULT_USER_SETTINGS["llm_model"]
    legacy_reasoning = (
        get_setting(db, "llm_reasoning_effort", DEFAULT_USER_SETTINGS["llm_reasoning_effort"])
        or DEFAULT_USER_SETTINGS["llm_reasoning_effort"]
    )

    base_url = env_base_url or legacy_base_url
    api_key = env_api_key or legacy_api_key
    model = env_model or legacy_model
    reasoning_effort = env_reasoning or legacy_reasoning
    enabled = _truthy(enabled_env, default=bool(base_url and api_key)) if enabled_env is not None else bool(base_url and api_key)

    return {
        "enabled": enabled,
        "base_url": base_url,
        "api_key": api_key,
        "model": model or DEFAULT_USER_SETTINGS["llm_model"],
        "reasoning_effort": reasoning_effort or DEFAULT_USER_SETTINGS["llm_reasoning_effort"],
        "managed_by_environment": bool(env_base_url or env_api_key or env_model or env_reasoning or enabled_env is not None),
    }


def get_public_llm_settings(db: Session) -> dict[str, Any]:
    config = get_site_ai_config(db)
    return {
        "enabled": config["enabled"],
        "base_url": config["base_url"],
        "api_key": "********" if config["api_key"] else "",
        "model": config["model"],
        "reasoning_effort": config["reasoning_effort"],
        "managed_by_environment": config["managed_by_environment"],
    }
