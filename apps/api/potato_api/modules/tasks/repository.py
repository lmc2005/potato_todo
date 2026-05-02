from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Task


def get_task(db: Session, user_id: int, task_id: int) -> Task | None:
    return db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()


def query_tasks(db: Session, user_id: int, status: str | None) -> list[Task]:
    query = db.query(Task).filter(Task.user_id == user_id)
    if status:
        if status == "pending":
            query = query.filter(Task.status != "done")
        else:
            query = query.filter(Task.status == status)
    return query.all()
