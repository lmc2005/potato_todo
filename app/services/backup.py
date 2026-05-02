from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.database import ROOT_DIR
from app.models import (
    AiConversation,
    AiDraft,
    AiMessage,
    ScheduleEvent,
    StudySession,
    Subject,
    Task,
    TimerState,
    UserSetting,
)


BACKUP_DIR = ROOT_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

USER_MODELS = [Subject, Task, ScheduleEvent, StudySession, TimerState, AiDraft, AiConversation, UserSetting]


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _serialize_rows(rows: list[Any], model: type) -> list[dict[str, Any]]:
    mapper = inspect(model)
    output = []
    for row in rows:
        output.append({column.key: _serialize_value(getattr(row, column.key)) for column in mapper.columns})
    return output


def export_payload(db: Session, user_id: int) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "version": 2,
        "exported_at": datetime.now().replace(microsecond=0).isoformat(),
        "tables": {},
    }
    for model in USER_MODELS:
        payload["tables"][model.__tablename__] = _serialize_rows(
            db.query(model).filter(model.user_id == user_id).all(),
            model,
        )

    conversations = db.query(AiConversation).filter(AiConversation.user_id == user_id).all()
    conversation_ids = [conversation.id for conversation in conversations]
    messages = []
    if conversation_ids:
        messages = (
            db.query(AiMessage)
            .filter(AiMessage.conversation_id.in_(conversation_ids))
            .order_by(AiMessage.created_at.asc(), AiMessage.id.asc())
            .all()
        )
    payload["tables"][AiMessage.__tablename__] = _serialize_rows(messages, AiMessage)
    return payload


def save_backup_file(db: Session, user_id: int, prefix: str = "backup") -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"{prefix}-user-{user_id}-{timestamp}.json"
    path.write_text(json.dumps(export_payload(db, user_id), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    return datetime.fromisoformat(str(value))


def _clear_user_data(db: Session, user_id: int) -> None:
    conversation_ids = [row.id for row in db.query(AiConversation.id).filter(AiConversation.user_id == user_id).all()]
    if conversation_ids:
        db.query(AiMessage).filter(AiMessage.conversation_id.in_(conversation_ids)).delete(synchronize_session=False)
    db.query(AiConversation).filter(AiConversation.user_id == user_id).delete(synchronize_session=False)
    db.query(AiDraft).filter(AiDraft.user_id == user_id).delete(synchronize_session=False)
    db.query(TimerState).filter(TimerState.user_id == user_id).delete(synchronize_session=False)
    db.query(StudySession).filter(StudySession.user_id == user_id).delete(synchronize_session=False)
    db.query(ScheduleEvent).filter(ScheduleEvent.user_id == user_id).delete(synchronize_session=False)
    db.query(Task).filter(Task.user_id == user_id).delete(synchronize_session=False)
    db.query(Subject).filter(Subject.user_id == user_id).delete(synchronize_session=False)
    db.query(UserSetting).filter(UserSetting.user_id == user_id).delete(synchronize_session=False)


def import_payload(db: Session, user_id: int, payload: dict[str, Any]) -> Path:
    if not isinstance(payload, dict) or "tables" not in payload:
        raise ValueError("Invalid backup file.")
    pre_import = save_backup_file(db, user_id, "pre-import")
    tables = payload.get("tables") or {}

    subject_map: dict[int, int] = {}
    task_map: dict[int, int] = {}
    event_map: dict[int, int] = {}
    conversation_map: dict[int, int] = {}

    try:
        _clear_user_data(db, user_id)
        db.flush()

        for row in tables.get("subjects", []) or []:
            subject = Subject(
                user_id=user_id,
                name=row.get("name") or "Untitled subject",
                color=row.get("color") or "#5E8CFF",
                daily_goal_minutes=int(row.get("daily_goal_minutes") or 0),
                weekly_goal_minutes=int(row.get("weekly_goal_minutes") or 0),
                monthly_goal_minutes=int(row.get("monthly_goal_minutes") or 0),
                archived=bool(row.get("archived", False)),
                created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                updated_at=_parse_datetime(row.get("updated_at")) or datetime.now().replace(microsecond=0),
            )
            db.add(subject)
            db.flush()
            if row.get("id") is not None:
                subject_map[int(row["id"])] = subject.id

        for row in tables.get("tasks", []) or []:
            task = Task(
                user_id=user_id,
                title=row.get("title") or "Untitled task",
                subject_id=subject_map.get(int(row["subject_id"])) if row.get("subject_id") is not None else None,
                status=row.get("status") if row.get("status") in {"todo", "in_progress", "done", "undone"} else "todo",
                priority=row.get("priority") if row.get("priority") in {"low", "medium", "high"} else "medium",
                due_at=_parse_datetime(row.get("due_at")),
                estimated_minutes=row.get("estimated_minutes"),
                notes=row.get("notes"),
                completed_at=_parse_datetime(row.get("completed_at")),
                created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                updated_at=_parse_datetime(row.get("updated_at")) or datetime.now().replace(microsecond=0),
            )
            db.add(task)
            db.flush()
            if row.get("id") is not None:
                task_map[int(row["id"])] = task.id

        for row in tables.get("schedule_events", []) or []:
            start_at = _parse_datetime(row.get("start_at"))
            end_at = _parse_datetime(row.get("end_at"))
            if start_at is None or end_at is None:
                continue
            event = ScheduleEvent(
                user_id=user_id,
                title=row.get("title") or "Untitled event",
                subject_id=subject_map.get(int(row["subject_id"])) if row.get("subject_id") is not None else None,
                task_id=task_map.get(int(row["task_id"])) if row.get("task_id") is not None else None,
                start_at=start_at,
                end_at=end_at,
                source=row.get("source") if row.get("source") in {"manual", "ai"} else "manual",
                notes=row.get("notes"),
                created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                updated_at=_parse_datetime(row.get("updated_at")) or datetime.now().replace(microsecond=0),
            )
            db.add(event)
            db.flush()
            if row.get("id") is not None:
                event_map[int(row["id"])] = event.id

        for row in tables.get("study_sessions", []) or []:
            started_at = _parse_datetime(row.get("started_at"))
            ended_at = _parse_datetime(row.get("ended_at"))
            if started_at is None or ended_at is None:
                continue
            subject_id = subject_map.get(int(row["subject_id"])) if row.get("subject_id") is not None else None
            if subject_id is None:
                continue
            db.add(
                StudySession(
                    user_id=user_id,
                    subject_id=subject_id,
                    task_id=task_map.get(int(row["task_id"])) if row.get("task_id") is not None else None,
                    schedule_event_id=event_map.get(int(row["schedule_event_id"])) if row.get("schedule_event_id") is not None else None,
                    mode=row.get("mode") or "count_up",
                    started_at=started_at,
                    ended_at=ended_at,
                    focus_seconds=int(row.get("focus_seconds") or 0),
                    paused_seconds=int(row.get("paused_seconds") or 0),
                    stop_reason=row.get("stop_reason") or "manual_stop",
                    created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                )
            )

        for row in tables.get("timer_states", []) or []:
            started_at = _parse_datetime(row.get("started_at"))
            subject_id = subject_map.get(int(row["subject_id"])) if row.get("subject_id") is not None else None
            if started_at is None or subject_id is None:
                continue
            db.add(
                TimerState(
                    user_id=user_id,
                    mode=row.get("mode") or "count_up",
                    subject_id=subject_id,
                    task_id=task_map.get(int(row["task_id"])) if row.get("task_id") is not None else None,
                    schedule_event_id=event_map.get(int(row["schedule_event_id"])) if row.get("schedule_event_id") is not None else None,
                    started_at=started_at,
                    paused_at=_parse_datetime(row.get("paused_at")),
                    accumulated_pause_seconds=int(row.get("accumulated_pause_seconds") or 0),
                    countdown_seconds=row.get("countdown_seconds"),
                    countdown_end_at=_parse_datetime(row.get("countdown_end_at")),
                    is_paused=bool(row.get("is_paused", False)),
                    pomodoro_phase=row.get("pomodoro_phase"),
                    pomodoro_round=int(row.get("pomodoro_round") or 1),
                    pomodoro_total_rounds=int(row.get("pomodoro_total_rounds") or 4),
                    focus_minutes=int(row.get("focus_minutes") or 25),
                    short_break_minutes=int(row.get("short_break_minutes") or 5),
                    long_break_minutes=int(row.get("long_break_minutes") or 15),
                    created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                    updated_at=_parse_datetime(row.get("updated_at")) or datetime.now().replace(microsecond=0),
                )
            )

        for row in tables.get("ai_drafts", []) or []:
            db.add(
                AiDraft(
                    user_id=user_id,
                    kind=row.get("kind") or "plan",
                    status=row.get("status") or "pending",
                    input_snapshot=row.get("input_snapshot") or "{}",
                    payload=row.get("payload") or "{}",
                    raw_response=row.get("raw_response"),
                    created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                    applied_at=_parse_datetime(row.get("applied_at")),
                )
            )

        for row in tables.get("ai_conversations", []) or []:
            conversation = AiConversation(
                user_id=user_id,
                mode=row.get("mode") or "chat",
                title=row.get("title") or "New chat",
                created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                updated_at=_parse_datetime(row.get("updated_at")) or datetime.now().replace(microsecond=0),
            )
            db.add(conversation)
            db.flush()
            if row.get("id") is not None:
                conversation_map[int(row["id"])] = conversation.id

        for row in tables.get("ai_messages", []) or []:
            conversation_id = conversation_map.get(int(row["conversation_id"])) if row.get("conversation_id") is not None else None
            if conversation_id is None:
                continue
            db.add(
                AiMessage(
                    conversation_id=conversation_id,
                    role=row.get("role") or "assistant",
                    content=row.get("content") or "",
                    created_at=_parse_datetime(row.get("created_at")) or datetime.now().replace(microsecond=0),
                )
            )

        for row in tables.get("user_settings", []) or []:
            db.add(
                UserSetting(
                    user_id=user_id,
                    key=row.get("key") or "",
                    value=row.get("value"),
                    updated_at=_parse_datetime(row.get("updated_at")) or datetime.now().replace(microsecond=0),
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        raise
    return pre_import


def clear_all_data(db: Session, user_id: int) -> Path:
    pre_clear = save_backup_file(db, user_id, "pre-clear")
    try:
        _clear_user_data(db, user_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return pre_clear
