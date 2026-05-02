from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ScheduleEvent, StudySession, Subject, Task, TimerState, now_local
from app.schemas import PomodoroStartIn, TimerStartIn


def get_active_timer(db: Session, user_id: int) -> TimerState | None:
    return (
        db.query(TimerState)
        .filter(TimerState.user_id == user_id)
        .order_by(TimerState.id.asc())
        .first()
    )


def _require_subject(db: Session, user_id: int, subject_id: int) -> None:
    subject = (
        db.query(Subject)
        .filter(Subject.id == subject_id, Subject.user_id == user_id, Subject.archived.is_(False))
        .first()
    )
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")


def _validate_optional_links(db: Session, user_id: int, task_id: int | None, schedule_event_id: int | None) -> None:
    if task_id is not None:
        task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found.")
    if schedule_event_id is not None:
        event = (
            db.query(ScheduleEvent)
            .filter(ScheduleEvent.id == schedule_event_id, ScheduleEvent.user_id == user_id)
            .first()
        )
        if event is None:
            raise HTTPException(status_code=404, detail="Schedule event not found.")


def _focus_seconds(timer: TimerState, end_at: datetime) -> int:
    raw_seconds = int((end_at - timer.started_at).total_seconds()) - timer.accumulated_pause_seconds
    if timer.is_paused and timer.paused_at:
        raw_seconds = int((timer.paused_at - timer.started_at).total_seconds()) - timer.accumulated_pause_seconds
    raw_seconds = max(raw_seconds, 0)
    if timer.mode == "count_down" and timer.countdown_seconds:
        return min(raw_seconds, timer.countdown_seconds)
    if timer.mode == "pomodoro" and timer.pomodoro_phase == "focus":
        return min(raw_seconds, timer.focus_minutes * 60)
    if timer.mode == "pomodoro":
        return 0
    return raw_seconds


def _record_session(
    db: Session,
    timer: TimerState,
    end_at: datetime,
    reason: str,
    adjusted_focus_seconds: int | None = None,
) -> StudySession | None:
    focus_seconds = adjusted_focus_seconds if adjusted_focus_seconds is not None else _focus_seconds(timer, end_at)
    if focus_seconds <= 0:
        return None
    session = StudySession(
        user_id=timer.user_id,
        subject_id=timer.subject_id,
        task_id=timer.task_id,
        schedule_event_id=timer.schedule_event_id,
        mode=timer.mode,
        started_at=timer.started_at,
        ended_at=end_at,
        focus_seconds=focus_seconds,
        paused_seconds=timer.accumulated_pause_seconds,
        stop_reason=reason,
    )
    db.add(session)
    return session


def _timer_payload(timer: TimerState, completed: str | None = None) -> dict:
    now = now_local()
    elapsed = _focus_seconds(timer, now)
    remaining = None
    if timer.countdown_end_at:
        anchor = timer.paused_at if timer.is_paused and timer.paused_at else now
        remaining = max(int((timer.countdown_end_at - anchor).total_seconds()), 0)
    return {
        "active": True,
        "completed": completed,
        "id": timer.id,
        "mode": timer.mode,
        "subject_id": timer.subject_id,
        "task_id": timer.task_id,
        "schedule_event_id": timer.schedule_event_id,
        "started_at": timer.started_at.isoformat(),
        "is_paused": timer.is_paused,
        "elapsed_seconds": elapsed,
        "remaining_seconds": remaining,
        "countdown_seconds": timer.countdown_seconds,
        "pomodoro_phase": timer.pomodoro_phase,
        "pomodoro_round": timer.pomodoro_round,
        "pomodoro_total_rounds": timer.pomodoro_total_rounds,
    }


def start_timer(db: Session, user_id: int, data: TimerStartIn) -> dict:
    if get_active_timer(db, user_id):
        raise HTTPException(status_code=409, detail="A timer is already running.")
    _require_subject(db, user_id, data.subject_id)
    _validate_optional_links(db, user_id, data.task_id, data.schedule_event_id)
    if data.mode == "count_down" and not data.duration_minutes:
        raise HTTPException(status_code=400, detail="Countdown duration is required.")

    started_at = now_local()
    countdown_seconds = data.duration_minutes * 60 if data.duration_minutes else None
    timer = TimerState(
        user_id=user_id,
        mode=data.mode,
        subject_id=data.subject_id,
        task_id=data.task_id,
        schedule_event_id=data.schedule_event_id,
        started_at=started_at,
        countdown_seconds=countdown_seconds,
        countdown_end_at=started_at + timedelta(seconds=countdown_seconds) if countdown_seconds else None,
    )
    db.add(timer)
    db.commit()
    db.refresh(timer)
    return _timer_payload(timer)


def start_pomodoro(db: Session, user_id: int, data: PomodoroStartIn) -> dict:
    if get_active_timer(db, user_id):
        raise HTTPException(status_code=409, detail="A timer is already running.")
    _require_subject(db, user_id, data.subject_id)
    _validate_optional_links(db, user_id, data.task_id, data.schedule_event_id)
    started_at = now_local()
    timer = TimerState(
        user_id=user_id,
        mode="pomodoro",
        subject_id=data.subject_id,
        task_id=data.task_id,
        schedule_event_id=data.schedule_event_id,
        started_at=started_at,
        countdown_seconds=data.focus_minutes * 60,
        countdown_end_at=started_at + timedelta(minutes=data.focus_minutes),
        pomodoro_phase="focus",
        pomodoro_round=1,
        pomodoro_total_rounds=data.total_rounds,
        focus_minutes=data.focus_minutes,
        short_break_minutes=data.short_break_minutes,
        long_break_minutes=data.long_break_minutes,
    )
    db.add(timer)
    db.commit()
    db.refresh(timer)
    return _timer_payload(timer)


def pause_timer(db: Session, user_id: int) -> dict:
    timer = get_active_timer(db, user_id)
    if timer is None:
        raise HTTPException(status_code=404, detail="No active timer.")
    if not timer.is_paused:
        timer.is_paused = True
        timer.paused_at = now_local()
    db.commit()
    db.refresh(timer)
    return _timer_payload(timer)


def resume_timer(db: Session, user_id: int) -> dict:
    timer = get_active_timer(db, user_id)
    if timer is None:
        raise HTTPException(status_code=404, detail="No active timer.")
    if timer.is_paused and timer.paused_at:
        now = now_local()
        paused_seconds = int((now - timer.paused_at).total_seconds())
        timer.accumulated_pause_seconds += max(paused_seconds, 0)
        if timer.countdown_end_at:
            timer.countdown_end_at += timedelta(seconds=max(paused_seconds, 0))
        timer.paused_at = None
        timer.is_paused = False
    db.commit()
    db.refresh(timer)
    return _timer_payload(timer)


def stop_timer(
    db: Session,
    user_id: int,
    reason: str = "manual_stop",
    adjusted_focus_minutes: int | None = None,
) -> dict:
    timer = get_active_timer(db, user_id)
    if timer is None:
        raise HTTPException(status_code=404, detail="No active timer.")
    end_at = timer.paused_at if timer.is_paused and timer.paused_at else now_local()
    adjusted_focus_seconds = None
    if adjusted_focus_minutes is not None:
        if timer.mode != "count_up":
            raise HTTPException(status_code=400, detail="Adjusted focus time is only supported for count-up sessions.")
        adjusted_focus_seconds = adjusted_focus_minutes * 60
        reason = "manual_stop_adjusted"
    session = _record_session(db, timer, end_at, reason, adjusted_focus_seconds)
    db.delete(timer)
    db.commit()
    return {
        "active": False,
        "completed": reason,
        "session_id": session.id if session else None,
        "focus_seconds": session.focus_seconds if session else 0,
    }


def _advance_pomodoro(db: Session, timer: TimerState, now: datetime) -> dict:
    if timer.pomodoro_phase == "focus":
        _record_session(db, timer, timer.countdown_end_at or now, "pomodoro_focus_complete")
        if timer.pomodoro_round >= timer.pomodoro_total_rounds:
            db.delete(timer)
            db.commit()
            return {"active": False, "completed": "pomodoro_complete"}
        break_minutes = timer.long_break_minutes if timer.pomodoro_round % 4 == 0 else timer.short_break_minutes
        timer.started_at = now
        timer.accumulated_pause_seconds = 0
        timer.is_paused = False
        timer.paused_at = None
        timer.pomodoro_phase = "break"
        timer.countdown_seconds = break_minutes * 60
        timer.countdown_end_at = now + timedelta(minutes=break_minutes)
        db.commit()
        db.refresh(timer)
        return _timer_payload(timer, "focus_complete")

    timer.pomodoro_round += 1
    timer.started_at = now
    timer.accumulated_pause_seconds = 0
    timer.is_paused = False
    timer.paused_at = None
    timer.pomodoro_phase = "focus"
    timer.countdown_seconds = timer.focus_minutes * 60
    timer.countdown_end_at = now + timedelta(minutes=timer.focus_minutes)
    db.commit()
    db.refresh(timer)
    return _timer_payload(timer, "break_complete")


def current_timer(db: Session, user_id: int) -> dict:
    timer = get_active_timer(db, user_id)
    if timer is None:
        return {"active": False}
    if timer.is_paused:
        return _timer_payload(timer)
    now = now_local()
    if timer.countdown_end_at and now >= timer.countdown_end_at:
        if timer.mode == "pomodoro":
            return _advance_pomodoro(db, timer, now)
        session = _record_session(db, timer, timer.countdown_end_at, "completed")
        db.delete(timer)
        db.commit()
        return {
            "active": False,
            "completed": "completed",
            "session_id": session.id if session else None,
            "focus_seconds": session.focus_seconds if session else 0,
        }
    return _timer_payload(timer)


def skip_pomodoro(db: Session, user_id: int) -> dict:
    timer = get_active_timer(db, user_id)
    if timer is None or timer.mode != "pomodoro":
        raise HTTPException(status_code=404, detail="No active Pomodoro timer.")
    timer.countdown_end_at = now_local()
    db.commit()
    return current_timer(db, user_id)
