from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.schemas import PomodoroStartIn, TimerStartIn, TimerStopIn

from ...core.deps import get_current_user
from ...core.room_hub import publish_user_room_updates
from ...legacy_bridge import User, get_db
from .domain import result_payload
from .service import current_timer_state, pause_active_timer, resume_active_timer, skip_current_pomodoro, start_free_timer, start_pomodoro_timer, stop_active_timer


router = APIRouter(prefix="/timer", tags=["timer"])


@router.post("/start")
def start_timer(payload: TimerStartIn, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = start_free_timer(db, user.id, payload)
    publish_user_room_updates(request.app, db, user.id, "timer_started")
    return result_payload(result)


@router.post("/pause")
def pause(request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = pause_active_timer(db, user.id)
    publish_user_room_updates(request.app, db, user.id, "timer_paused")
    return result_payload(result)


@router.post("/resume")
def resume(request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = resume_active_timer(db, user.id)
    publish_user_room_updates(request.app, db, user.id, "timer_resumed")
    return result_payload(result)


@router.post("/stop")
def stop(payload: TimerStopIn | None = None, request: Request = None, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = stop_active_timer(db, user.id, payload)
    if request is not None:
        publish_user_room_updates(request.app, db, user.id, "timer_stopped")
    return result_payload(result)


@router.get("/current")
def current(request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = current_timer_state(db, user.id)
    if result.get("completed") or not result.get("active", False):
        publish_user_room_updates(request.app, db, user.id, "timer_current_sync")
    return result_payload(result)


@router.post("/pomodoro/start")
def start_pomodoro(payload: PomodoroStartIn, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = start_pomodoro_timer(db, user.id, payload)
    publish_user_room_updates(request.app, db, user.id, "pomodoro_started")
    return result_payload(result)


@router.post("/pomodoro/skip")
def skip_pomodoro(request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = skip_current_pomodoro(db, user.id)
    publish_user_room_updates(request.app, db, user.id, "pomodoro_skipped")
    return result_payload(result)
