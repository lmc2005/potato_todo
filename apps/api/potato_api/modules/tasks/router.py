from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.schemas import TaskIn, TaskPatch

from ...core.deps import get_current_user
from ...core.room_hub import publish_user_room_updates
from ...legacy_bridge import User, get_db
from .domain import item_payload, list_payload
from .service import create_task_item, delete_task_item, list_task_items, update_task_item


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("")
def list_tasks(status: str | None = None, db=Depends(get_db), user: User = Depends(get_current_user)):
    return list_payload(list_task_items(db, user.id, status))


@router.post("")
def create_task(payload: TaskIn, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = create_task_item(db, user.id, payload)
    publish_user_room_updates(request.app, db, user.id, "task_created")
    return item_payload(result)


@router.patch("/{task_id}")
def update_task(task_id: int, payload: TaskPatch, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = update_task_item(db, user.id, task_id, payload)
    publish_user_room_updates(request.app, db, user.id, "task_updated")
    return item_payload(result)


@router.delete("/{task_id}")
def delete_task(task_id: int, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = delete_task_item(db, user.id, task_id)
    publish_user_room_updates(request.app, db, user.id, "task_deleted")
    return result
