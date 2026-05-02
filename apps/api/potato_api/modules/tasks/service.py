from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Task, now_local
from app.schemas import TaskIn, TaskPatch

from ...legacy_bridge import owned_subject, serialize_task, sort_tasks, sync_overdue_tasks
from .repository import get_task, query_tasks


def list_task_items(db: Session, user_id: int, status: str | None) -> list[dict]:
    sync_overdue_tasks(db, user_id)
    tasks = sort_tasks(query_tasks(db, user_id, status))
    return [serialize_task(task) for task in tasks]


def create_task_item(db: Session, user_id: int, payload: TaskIn) -> dict:
    if payload.subject_id is not None:
        owned_subject(db, user_id, payload.subject_id)
    task = Task(user_id=user_id, **payload.model_dump())
    if task.status == "done":
        task.completed_at = task.completed_at or now_local()
    db.add(task)
    db.commit()
    sync_overdue_tasks(db, user_id)
    db.refresh(task)
    return serialize_task(task)


def update_task_item(db: Session, user_id: int, task_id: int, payload: TaskPatch) -> dict:
    task = get_task(db, user_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    data = payload.model_dump(exclude_unset=True)
    if "subject_id" in data:
        owned_subject(db, user_id, data.get("subject_id"))
    for key, value in data.items():
        setattr(task, key, value)
    if data.get("status") == "done" and task.completed_at is None:
        task.completed_at = now_local()
    if data.get("status") and data.get("status") != "done":
        task.completed_at = None
    db.commit()
    sync_overdue_tasks(db, user_id)
    db.refresh(task)
    return serialize_task(task)


def delete_task_item(db: Session, user_id: int, task_id: int) -> dict:
    task = get_task(db, user_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    db.delete(task)
    db.commit()
    return {"deleted": True}
