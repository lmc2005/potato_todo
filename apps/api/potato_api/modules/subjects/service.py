from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ScheduleEvent, StudySession, Subject, Task
from app.schemas import SubjectIn, SubjectPatch

from ...legacy_bridge import serialize_subject
from .repository import active_timer_for_subject, get_subject, query_subjects, subject_focus_totals


def list_subject_items(db: Session, user_id: int, include_archived: bool) -> list[dict]:
    subjects = query_subjects(db, user_id, include_archived)
    totals = subject_focus_totals(db, user_id)
    return [serialize_subject(subject, totals.get(subject.id, 0)) for subject in subjects]


def create_subject_item(db: Session, user_id: int, payload: SubjectIn) -> dict:
    subject = Subject(user_id=user_id, **payload.model_dump())
    db.add(subject)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Subject name already exists.") from exc
    db.refresh(subject)
    return serialize_subject(subject, 0)


def update_subject_item(db: Session, user_id: int, subject_id: int, payload: SubjectPatch) -> dict:
    subject = get_subject(db, user_id, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, key, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Subject name already exists.") from exc
    db.refresh(subject)
    total_focus_seconds = (
        db.query(StudySession)
        .filter(StudySession.user_id == user_id, StudySession.subject_id == subject.id)
        .count()
    )
    total_seconds = sum(session.focus_seconds for session in db.query(StudySession).filter(StudySession.user_id == user_id, StudySession.subject_id == subject.id).all())
    if total_focus_seconds < 0:
        total_seconds = 0
    return serialize_subject(subject, total_seconds)


def delete_subject_item(db: Session, user_id: int, subject_id: int) -> dict:
    subject = get_subject(db, user_id, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    if active_timer_for_subject(db, user_id, subject_id) is not None:
        raise HTTPException(status_code=400, detail="Stop the active timer before deleting this subject.")
    session_count = db.query(StudySession).filter(StudySession.user_id == user_id, StudySession.subject_id == subject_id).count()
    if session_count:
        raise HTTPException(status_code=400, detail="This subject already has recorded study sessions and cannot be deleted.")
    detached_tasks = db.query(Task).filter(Task.user_id == user_id, Task.subject_id == subject_id).update({Task.subject_id: None}, synchronize_session=False)
    detached_events = db.query(ScheduleEvent).filter(ScheduleEvent.user_id == user_id, ScheduleEvent.subject_id == subject_id).update({ScheduleEvent.subject_id: None}, synchronize_session=False)
    db.delete(subject)
    db.commit()
    return {"deleted": True, "detached_tasks": detached_tasks, "detached_events": detached_events}
