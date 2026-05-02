from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import ROOT_DIR, SessionLocal, engine, get_db, init_db
from app.models import AiConversation, ScheduleEvent, StudyRoomMember, StudySession, Subject, Task, TimerState, User, now_local
from app.services.ai import (
    ANALYZE_SYSTEM_PROMPT,
    PLAN_SYSTEM_PROMPT,
    apply_plan_draft,
    build_snapshot,
    call_llm,
    call_llm_text,
    create_draft,
    delete_chat_conversation,
    draft_to_payload,
    ensure_ai_enabled,
    get_chat_conversation_payload,
    get_daily_quote,
    list_chat_conversations,
    normalize_plan_payload,
    planning_requests_schedule,
    save_chat_exchange,
)
from app.services.auth import authenticate_user, create_user, normalize_email, require_user, user_label, verify_password
from app.services.backup import clear_all_data, export_payload, import_payload
from app.services.rooms import (
    close_room,
    create_room,
    get_room_for_member,
    get_room_snapshot,
    join_room_by_code,
    kick_member,
    leave_room,
    list_user_rooms,
    reset_room_code,
    room_detail_payload,
)
from app.services.settings import get_all_user_settings, get_int_user_setting, get_public_llm_settings, get_site_ai_config, set_setting, set_user_setting
from app.services.stats import compute_stats, sync_overdue_tasks
from app.services.timer import current_timer, pause_timer, resume_timer, skip_pomodoro, start_pomodoro, start_timer, stop_timer


def serialize_subject(subject: Subject, total_focus_seconds: int = 0) -> dict[str, Any]:
    return {
        "id": subject.id,
        "name": subject.name,
        "color": subject.color,
        "daily_goal_minutes": subject.daily_goal_minutes,
        "weekly_goal_minutes": subject.weekly_goal_minutes,
        "monthly_goal_minutes": subject.monthly_goal_minutes,
        "total_focus_seconds": int(total_focus_seconds or 0),
        "archived": subject.archived,
    }


def serialize_task(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "subject_id": task.subject_id,
        "subject": task.subject.name if task.subject else None,
        "subject_color": task.subject.color if task.subject else "#9CA3AF",
        "status": task.status,
        "priority": task.priority,
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "estimated_minutes": task.estimated_minutes,
        "notes": task.notes,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat(),
    }


def serialize_event(event: ScheduleEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "subject_id": event.subject_id,
        "task_id": event.task_id,
        "start_at": event.start_at.isoformat(),
        "end_at": event.end_at.isoformat(),
        "source": event.source,
        "notes": event.notes,
    }


def llm_settings_payload(db: Session, user: User) -> dict[str, Any]:
    site = get_public_llm_settings(db)
    settings = get_all_user_settings(db, user.id)
    return {
        **site,
        "model": settings.get("llm_model", site["model"]) or site["model"],
        "reasoning_effort": settings.get("llm_reasoning_effort", site["reasoning_effort"]) or site["reasoning_effort"],
    }


def owned_subject(db: Session, user_id: int, subject_id: int | None) -> Subject | None:
    if subject_id is None:
        return None
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.user_id == user_id).first()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return subject


def owned_task(db: Session, user_id: int, task_id: int | None) -> Task | None:
    if task_id is None:
        return None
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


def owned_event(db: Session, user_id: int, event_id: int | None) -> ScheduleEvent | None:
    if event_id is None:
        return None
    event = db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id, ScheduleEvent.user_id == user_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    return event


PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def sort_tasks(rows: list[Task]) -> list[Task]:
    def key(task: Task):
        if task.status == "done":
            return (2, datetime.max, PRIORITY_ORDER.get(task.priority, 1), -(task.completed_at or task.updated_at).timestamp())
        if task.due_at:
            return (0, task.due_at, PRIORITY_ORDER.get(task.priority, 1), -task.created_at.timestamp())
        return (1, datetime.max, PRIORITY_ORDER.get(task.priority, 1), -task.created_at.timestamp())

    return sorted(rows, key=key)


def user_room_ids(db: Session, user_id: int) -> list[int]:
    return [
        room_id
        for (room_id,) in db.query(StudyRoomMember.room_id)
        .filter(StudyRoomMember.user_id == user_id, StudyRoomMember.status == "active")
        .all()
    ]


__all__ = [
    "AiConversation",
    "ANALYZE_SYSTEM_PROMPT",
    "PLAN_SYSTEM_PROMPT",
    "ROOT_DIR",
    "SessionLocal",
    "Subject",
    "Task",
    "ScheduleEvent",
    "StudySession",
    "TimerState",
    "User",
    "apply_plan_draft",
    "authenticate_user",
    "build_snapshot",
    "call_llm",
    "call_llm_text",
    "clear_all_data",
    "close_room",
    "compute_stats",
    "create_draft",
    "create_room",
    "create_user",
    "current_timer",
    "delete_chat_conversation",
    "draft_to_payload",
    "engine",
    "ensure_ai_enabled",
    "export_payload",
    "get_all_user_settings",
    "get_chat_conversation_payload",
    "get_daily_quote",
    "get_db",
    "get_int_user_setting",
    "get_public_llm_settings",
    "get_room_for_member",
    "get_room_snapshot",
    "get_site_ai_config",
    "import_payload",
    "init_db",
    "join_room_by_code",
    "kick_member",
    "leave_room",
    "list_chat_conversations",
    "list_user_rooms",
    "llm_settings_payload",
    "normalize_email",
    "normalize_plan_payload",
    "now_local",
    "owned_event",
    "owned_subject",
    "owned_task",
    "pause_timer",
    "planning_requests_schedule",
    "reset_room_code",
    "resume_timer",
    "room_detail_payload",
    "save_chat_exchange",
    "serialize_event",
    "serialize_subject",
    "serialize_task",
    "set_setting",
    "set_user_setting",
    "skip_pomodoro",
    "sort_tasks",
    "start_pomodoro",
    "start_timer",
    "stop_timer",
    "sync_overdue_tasks",
    "user_label",
    "user_room_ids",
    "verify_password",
]
