from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ScheduleEvent
from app.schemas import ScheduleEventIn, ScheduleEventPatch

from ...legacy_bridge import owned_subject, owned_task, serialize_event
from .repository import get_event


def list_event_items(db: Session, user_id: int, start: date | None, end: date | None) -> list[dict]:
    query = db.query(ScheduleEvent).filter(ScheduleEvent.user_id == user_id).order_by(ScheduleEvent.start_at.asc())
    if start:
        query = query.filter(ScheduleEvent.end_at >= datetime.combine(start, datetime.min.time()))
    if end:
        query = query.filter(ScheduleEvent.start_at <= datetime.combine(end, datetime.max.time()))
    return [serialize_event(event) for event in query.all()]


def create_event_item(db: Session, user_id: int, payload: ScheduleEventIn) -> dict:
    if payload.subject_id is not None:
        owned_subject(db, user_id, payload.subject_id)
    if payload.task_id is not None:
        owned_task(db, user_id, payload.task_id)
    event = ScheduleEvent(user_id=user_id, **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return serialize_event(event)


def update_event_item(db: Session, user_id: int, event_id: int, payload: ScheduleEventPatch) -> dict:
    event = get_event(db, user_id, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    updates = payload.model_dump(exclude_unset=True)
    if "subject_id" in updates:
        owned_subject(db, user_id, updates.get("subject_id"))
    if "task_id" in updates:
        owned_task(db, user_id, updates.get("task_id"))
    for key, value in updates.items():
        setattr(event, key, value)
    if event.end_at <= event.start_at:
        raise HTTPException(status_code=400, detail="End time must be after start time.")
    db.commit()
    db.refresh(event)
    return serialize_event(event)


def delete_event_item(db: Session, user_id: int, event_id: int) -> dict:
    event = get_event(db, user_id, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    db.delete(event)
    db.commit()
    return {"deleted": True}
