from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from app.schemas import ScheduleEventIn, ScheduleEventPatch

from ...core.deps import get_current_user
from ...legacy_bridge import User, get_db
from .domain import item_payload, list_payload
from .service import create_event_item, delete_event_item, list_event_items, update_event_item


router = APIRouter(prefix="/calendar/events", tags=["calendar"])


@router.get("")
def list_events(start: date | None = None, end: date | None = None, db=Depends(get_db), user: User = Depends(get_current_user)):
    return list_payload(list_event_items(db, user.id, start, end))


@router.post("")
def create_event(payload: ScheduleEventIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(create_event_item(db, user.id, payload))


@router.patch("/{event_id}")
def update_event(event_id: int, payload: ScheduleEventPatch, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(update_event_item(db, user.id, event_id, payload))


@router.delete("/{event_id}")
def delete_event(event_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    return delete_event_item(db, user.id, event_id)
