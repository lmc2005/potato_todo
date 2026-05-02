from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import StudySession, Subject, TimerState


def query_subjects(db: Session, user_id: int, include_archived: bool) -> list[Subject]:
    query = db.query(Subject).filter(Subject.user_id == user_id).order_by(Subject.archived.asc(), Subject.name.asc())
    if not include_archived:
        query = query.filter(Subject.archived.is_(False))
    return query.all()


def subject_focus_totals(db: Session, user_id: int) -> dict[int, int]:
    return dict(
        db.query(StudySession.subject_id, func.coalesce(func.sum(StudySession.focus_seconds), 0))
        .filter(StudySession.user_id == user_id)
        .group_by(StudySession.subject_id)
        .all()
    )


def get_subject(db: Session, user_id: int, subject_id: int) -> Subject | None:
    return db.query(Subject).filter(Subject.id == subject_id, Subject.user_id == user_id).first()


def active_timer_for_subject(db: Session, user_id: int, subject_id: int) -> TimerState | None:
    return db.query(TimerState).filter(TimerState.user_id == user_id, TimerState.subject_id == subject_id).first()
