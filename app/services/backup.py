from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.database import ROOT_DIR
from app.models import AiDraft, ScheduleEvent, Setting, StudySession, Subject, Task, TimerState


BACKUP_DIR = ROOT_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

MODELS = [Subject, Task, ScheduleEvent, StudySession, TimerState, AiDraft, Setting]


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def export_payload(db: Session) -> dict[str, Any]:
    payload: dict[str, Any] = {"version": 1, "exported_at": datetime.now().replace(microsecond=0).isoformat(), "tables": {}}
    for model in MODELS:
        mapper = inspect(model)
        rows = []
        for row in db.query(model).all():
            rows.append({column.key: _serialize_value(getattr(row, column.key)) for column in mapper.columns})
        payload["tables"][model.__tablename__] = rows
    return payload


def save_backup_file(db: Session, prefix: str = "backup") -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"{prefix}-{timestamp}.json"
    path.write_text(json.dumps(export_payload(db), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def import_payload(db: Session, payload: dict[str, Any]) -> Path:
    if not isinstance(payload, dict) or "tables" not in payload:
        raise ValueError("Invalid backup file.")
    pre_import = save_backup_file(db, "pre-import")
    tables = payload.get("tables") or {}
    try:
        for model in reversed(MODELS):
            db.query(model).delete()
        for model in MODELS:
            rows = tables.get(model.__tablename__, [])
            mapper = inspect(model)
            datetime_columns = {column.key for column in mapper.columns if "DateTime" in str(column.type)}
            for row in rows:
                values = dict(row)
                for key in datetime_columns:
                    if values.get(key):
                        values[key] = datetime.fromisoformat(values[key])
                db.add(model(**values))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return pre_import


def clear_all_data(db: Session) -> Path:
    pre_clear = save_backup_file(db, "pre-clear")
    try:
        for model in reversed(MODELS):
            db.query(model).delete()
        db.commit()
    except Exception:
        db.rollback()
        raise
    return pre_clear
