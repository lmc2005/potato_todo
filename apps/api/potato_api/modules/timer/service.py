from __future__ import annotations

from sqlalchemy.orm import Session

from app.schemas import PomodoroStartIn, TimerStartIn, TimerStopIn

from ...legacy_bridge import current_timer, pause_timer, resume_timer, skip_pomodoro, start_pomodoro, start_timer, stop_timer


def start_free_timer(db: Session, user_id: int, payload: TimerStartIn) -> dict:
    return start_timer(db, user_id, payload)


def pause_active_timer(db: Session, user_id: int) -> dict:
    return pause_timer(db, user_id)


def resume_active_timer(db: Session, user_id: int) -> dict:
    return resume_timer(db, user_id)


def stop_active_timer(db: Session, user_id: int, payload: TimerStopIn | None) -> dict:
    return stop_timer(db, user_id, adjusted_focus_minutes=payload.adjusted_focus_minutes if payload else None)


def current_timer_state(db: Session, user_id: int) -> dict:
    return current_timer(db, user_id)


def start_pomodoro_timer(db: Session, user_id: int, payload: PomodoroStartIn) -> dict:
    return start_pomodoro(db, user_id, payload)


def skip_current_pomodoro(db: Session, user_id: int) -> dict:
    return skip_pomodoro(db, user_id)
