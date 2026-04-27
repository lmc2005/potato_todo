from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Setting


DEFAULT_SETTINGS = {
    "llm_base_url": "",
    "llm_api_key": "",
    "llm_model": "gpt-4o-mini",
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
        return DEFAULT_SETTINGS.get(key, default)
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


def get_all_settings(db: Session, include_secret: bool = False) -> dict[str, str | None]:
    values = DEFAULT_SETTINGS.copy()
    for row in db.query(Setting).all():
        values[row.key] = row.value
    if not include_secret and values.get("llm_api_key"):
        values["llm_api_key"] = "********"
    return values


def get_int_setting(db: Session, key: str, default: int) -> int:
    raw = get_setting(db, key, str(default))
    try:
        return int(raw or default)
    except ValueError:
        return default
