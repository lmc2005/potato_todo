from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.models import StudySession, Subject, Task, now_local


def day_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return datetime.combine(start, time.min), datetime.combine(end, time.max)


def _date_range(start: date, end: date) -> list[date]:
    days: list[date] = []
    current = start
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def sync_overdue_tasks(db: Session, user_id: int) -> int:
    now = now_local()
    overdue_tasks = (
        db.query(Task)
        .filter(
            Task.user_id == user_id,
            Task.status.in_(("todo", "in_progress")),
            Task.due_at.isnot(None),
            Task.due_at < now,
        )
        .all()
    )
    for task in overdue_tasks:
        task.status = "undone"
        task.completed_at = None
    if overdue_tasks:
        db.commit()
    return len(overdue_tasks)


def compute_stats(db: Session, user_id: int, start: date, end: date) -> dict:
    sync_overdue_tasks(db, user_id)
    start_dt, end_dt = day_bounds(start, end)
    sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == user_id,
            StudySession.started_at <= end_dt,
            StudySession.ended_at >= start_dt,
        )
        .order_by(StudySession.started_at.asc())
        .all()
    )
    subjects = {subject.id: subject for subject in db.query(Subject).filter(Subject.user_id == user_id).all()}
    tasks = {task.id: task for task in db.query(Task).filter(Task.user_id == user_id).all()}

    total_seconds = sum(session.focus_seconds for session in sessions)
    by_subject: dict[int, int] = defaultdict(int)
    by_task: dict[int, int] = defaultdict(int)
    by_day: dict[str, int] = {day.isoformat(): 0 for day in _date_range(start, end)}

    for session in sessions:
        by_subject[session.subject_id] += session.focus_seconds
        if session.task_id:
            by_task[session.task_id] += session.focus_seconds
        day_key = session.started_at.date().isoformat()
        if day_key in by_day:
            by_day[day_key] += session.focus_seconds

    subject_breakdown = []
    for subject_id, seconds in sorted(by_subject.items(), key=lambda item: item[1], reverse=True):
        subject = subjects.get(subject_id)
        subject_breakdown.append(
            {
                "subject_id": subject_id,
                "name": subject.name if subject else "Unknown",
                "color": subject.color if subject else "#9CA3AF",
                "seconds": seconds,
                "minutes": round(seconds / 60, 1),
                "share": round(seconds / total_seconds, 4) if total_seconds else 0,
            }
        )

    task_ranking = []
    for task_id, seconds in sorted(by_task.items(), key=lambda item: item[1], reverse=True)[:10]:
        task = tasks.get(task_id)
        task_ranking.append(
            {
                "task_id": task_id,
                "title": task.title if task else "Unknown task",
                "seconds": seconds,
                "minutes": round(seconds / 60, 1),
            }
        )

    daily_trend = [
        {"date": day, "seconds": seconds, "minutes": round(seconds / 60, 1)}
        for day, seconds in by_day.items()
    ]
    task_completion_trend = _task_completion_trend(db, user_id, start, end)

    active_days = [datetime.fromisoformat(item["date"]).date() for item in daily_trend if item["seconds"] > 0]
    streak_days = _current_streak(active_days, end)
    goal_completion = _goal_completion(subjects, by_subject, start, end)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "total_seconds": total_seconds,
        "total_minutes": round(total_seconds / 60, 1),
        "session_count": len(sessions),
        "subject_breakdown": subject_breakdown,
        "daily_trend": daily_trend,
        "task_completion_trend": task_completion_trend,
        "task_ranking": task_ranking,
        "streak_days": streak_days,
        "goal_completion": goal_completion,
        "sessions": [
            {
                "id": session.id,
                "subject": subjects.get(session.subject_id).name if subjects.get(session.subject_id) else "Unknown",
                "task": tasks.get(session.task_id).title if session.task_id and tasks.get(session.task_id) else None,
                "mode": session.mode,
                "started_at": session.started_at.isoformat(),
                "ended_at": session.ended_at.isoformat(),
                "focus_seconds": session.focus_seconds,
                "stop_reason": session.stop_reason,
            }
            for session in sessions
        ],
    }


def _current_streak(active_days: list[date], end: date) -> int:
    active = set(active_days)
    current = end
    streak = 0
    while current in active:
        streak += 1
        current -= timedelta(days=1)
    return streak


def _goal_completion(subjects: dict[int, Subject], by_subject: dict[int, int], start: date, end: date) -> list[dict]:
    days = max((end - start).days + 1, 1)
    weeks = max(days / 7, 1 / 7)
    months = max(days / 30, 1 / 30)
    rows = []
    for subject_id, seconds in by_subject.items():
        subject = subjects.get(subject_id)
        if not subject:
            continue
        minutes = seconds / 60
        expected = max(
            subject.daily_goal_minutes * days,
            subject.weekly_goal_minutes * weeks,
            subject.monthly_goal_minutes * months,
        )
        rows.append(
            {
                "subject_id": subject_id,
                "name": subject.name,
                "minutes": round(minutes, 1),
                "target_minutes": round(expected, 1),
                "completion": round(minutes / expected, 4) if expected else 1,
            }
        )
    return sorted(rows, key=lambda row: row["completion"])


def _task_completion_trend(db: Session, user_id: int, start: date, end: date) -> list[dict]:
    start_dt, end_dt = day_bounds(start, end)
    tasks = (
        db.query(Task)
        .filter(
            Task.user_id == user_id,
            Task.due_at.isnot(None),
            Task.due_at >= start_dt,
            Task.due_at <= end_dt,
        )
        .all()
    )
    by_day: dict[str, dict[str, int | float | None]] = {
        day.isoformat(): {
            "date": day.isoformat(),
            "total": 0,
            "completed": 0,
            "on_time": 0,
            "completion_rate": None,
            "on_time_rate": None,
        }
        for day in _date_range(start, end)
    }
    for task in tasks:
        if not task.due_at:
            continue
        key = task.due_at.date().isoformat()
        if key not in by_day:
            continue
        row = by_day[key]
        row["total"] = int(row["total"] or 0) + 1
        if task.status == "done" and task.completed_at:
            row["completed"] = int(row["completed"] or 0) + 1
            if task.completed_at <= task.due_at:
                row["on_time"] = int(row["on_time"] or 0) + 1

    for row in by_day.values():
        total = int(row["total"] or 0)
        if total:
            row["completion_rate"] = round(int(row["completed"] or 0) / total, 4)
            row["on_time_rate"] = round(int(row["on_time"] or 0) / total, 4)
    return list(by_day.values())
