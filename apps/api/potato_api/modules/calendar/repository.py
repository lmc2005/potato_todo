from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import ScheduleEvent


def get_event(db: Session, user_id: int, event_id: int) -> ScheduleEvent | None:
    return db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id, ScheduleEvent.user_id == user_id).first()
