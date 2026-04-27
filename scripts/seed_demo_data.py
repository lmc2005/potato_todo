from __future__ import annotations

import random
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from app.database import SessionLocal, init_db
from app.models import AiConversation, AiDraft, AiMessage, ScheduleEvent, StudySession, Subject, Task, TimerState, now_local
from app.services.backup import save_backup_file


SEED = 20260427
START_DATE = date(2026, 3, 10)
TODAY = date(2026, 4, 27)
END_DATE = TODAY

SUBJECTS = [
    {
        "name": "Mathematics",
        "color": "#7C9CFF",
        "daily_goal_minutes": 95,
        "weekly_goal_minutes": 560,
        "monthly_goal_minutes": 2200,
        "tasks": [
            "Review algebra drills",
            "Finish calculus exercises",
            "Correct mock test mistakes",
            "Rebuild formula sheet",
            "Timed problem set",
            "Geometry theorem recap",
        ],
    },
    {
        "name": "English",
        "color": "#5FD6C8",
        "daily_goal_minutes": 55,
        "weekly_goal_minutes": 320,
        "monthly_goal_minutes": 1400,
        "tasks": [
            "Read essay passages",
            "Vocabulary retention review",
            "Listening shadowing",
            "Write short response",
            "Grammar repair set",
            "Past paper reading block",
        ],
    },
    {
        "name": "Physics",
        "color": "#FFB36D",
        "daily_goal_minutes": 75,
        "weekly_goal_minutes": 430,
        "monthly_goal_minutes": 1900,
        "tasks": [
            "Force and motion recap",
            "Waves concept map",
            "Electric field exercises",
            "Experimental methods review",
            "Solve mixed mechanics set",
            "Error log cleanup",
        ],
    },
    {
        "name": "Chemistry",
        "color": "#F27EAD",
        "daily_goal_minutes": 65,
        "weekly_goal_minutes": 390,
        "monthly_goal_minutes": 1650,
        "tasks": [
            "Organic reaction patterns",
            "Ionic equation practice",
            "Lab notes rewrite",
            "Moles and ratios drill",
            "Periodic trends summary",
            "Mock correction block",
        ],
    },
    {
        "name": "Computer Science",
        "color": "#89A7FF",
        "daily_goal_minutes": 80,
        "weekly_goal_minutes": 470,
        "monthly_goal_minutes": 2050,
        "tasks": [
            "Python debugging kata",
            "Data structure revision",
            "Algorithm timing notes",
            "Binary tree practice",
            "SQL query drills",
            "Refactor mini project",
        ],
    },
    {
        "name": "History",
        "color": "#9BD37F",
        "daily_goal_minutes": 40,
        "weekly_goal_minutes": 250,
        "monthly_goal_minutes": 1080,
        "tasks": [
            "Cold War chronology review",
            "Source analysis practice",
            "Essay outline rehearsal",
            "Memorize treaty details",
            "Past paper timed question",
            "Compare historiography notes",
        ],
    },
]


def local_dt(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute))


def iter_days(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def choose_status(index: int, total: int) -> str:
    if index < int(total * 0.55):
        return "done"
    if index < int(total * 0.8):
        return "in_progress"
    return "todo"


def main() -> None:
    random.seed(SEED)
    init_db()

    with SessionLocal() as db:
        backup_path = save_backup_file(db, "pre-demo-seed")

        for model in [TimerState, AiMessage, AiConversation, AiDraft, StudySession, ScheduleEvent, Task, Subject]:
            db.query(model).delete()
        db.commit()

        subject_rows: list[Subject] = []
        for item in SUBJECTS:
            subject = Subject(
                name=item["name"],
                color=item["color"],
                daily_goal_minutes=item["daily_goal_minutes"],
                weekly_goal_minutes=item["weekly_goal_minutes"],
                monthly_goal_minutes=item["monthly_goal_minutes"],
            )
            db.add(subject)
            subject_rows.append(subject)
        db.flush()

        tasks_by_subject: dict[int, list[Task]] = defaultdict(list)
        task_pool: list[Task] = []
        for subject in subject_rows:
            subject_meta = next(item for item in SUBJECTS if item["name"] == subject.name)
            for index, title in enumerate(subject_meta["tasks"]):
                due_day = START_DATE + timedelta(days=random.randint(0, (END_DATE - START_DATE).days))
                status = choose_status(index, len(subject_meta["tasks"]))
                completed_at = None
                if status == "done":
                    completed_day = min(due_day + timedelta(days=random.randint(0, 3)), END_DATE)
                    completed_at = local_dt(completed_day, random.randint(18, 22), random.choice([0, 15, 30, 45]))
                task = Task(
                    title=title,
                    subject_id=subject.id,
                    status=status,
                    priority=random.choice(["low", "medium", "high"]),
                    due_at=local_dt(due_day, random.randint(8, 20), random.choice([0, 15, 30, 45])),
                    estimated_minutes=random.choice([25, 35, 45, 60, 75, 90]),
                    notes=f"{subject.name} practice block.",
                    completed_at=completed_at,
                    created_at=local_dt(max(START_DATE, due_day - timedelta(days=random.randint(2, 12))), random.randint(8, 20), 0),
                )
                db.add(task)
                tasks_by_subject[subject.id].append(task)
                task_pool.append(task)

        future_tasks = [
            ("Finalize weekly review list", "Mathematics"),
            ("Draft speaking practice outline", "English"),
            ("Prepare lab recap summary", "Chemistry"),
            ("Review binary search notes", "Computer Science"),
        ]
        for offset, (title, subject_name) in enumerate(future_tasks, start=0):
            subject = next(row for row in subject_rows if row.name == subject_name)
            task = Task(
                title=title,
                subject_id=subject.id,
                status="todo",
                priority="medium" if offset % 2 == 0 else "high",
                due_at=local_dt(TODAY + timedelta(days=offset), 19, 0),
                estimated_minutes=random.choice([30, 45, 60]),
                notes="Open item kept for dashboard validation.",
                created_at=local_dt(TODAY - timedelta(days=2), 21, 0),
            )
            db.add(task)
            tasks_by_subject[subject.id].append(task)
            task_pool.append(task)

        db.flush()

        for day_index, day in enumerate(iter_days(START_DATE, END_DATE)):
            is_weekend = day.weekday() >= 5
            session_count = random.randint(2, 3) if is_weekend else random.randint(3, 5)
            available_subjects = random.sample(subject_rows, k=random.randint(3, min(5, len(subject_rows))))
            base_starts = [8, 10, 14, 16, 19, 21]

            for session_index in range(session_count):
                subject = available_subjects[session_index % len(available_subjects)]
                subject_tasks = tasks_by_subject[subject.id]
                task = random.choice(subject_tasks)

                bias = 0 if is_weekend else 10
                duration_minutes = max(25, min(120, random.randint(28 + bias, 95 + bias)))
                if day_index % 11 == 0 and session_index == 0:
                    duration_minutes += random.choice([20, 30, 40])
                start_hour = base_starts[min(session_index, len(base_starts) - 1)] + random.choice([-1, 0, 0, 1])
                start_minute = random.choice([0, 10, 15, 20, 30, 40, 45, 50])
                start_at = local_dt(day, max(6, min(22, start_hour)), start_minute)
                end_at = start_at + timedelta(minutes=duration_minutes)
                mode = random.choice(["count_up", "count_down", "pomodoro"])
                stop_reason = "focus_complete" if mode != "count_up" else "manual_stop"

                schedule_event_id = None
                if random.random() < 0.74:
                    event = ScheduleEvent(
                        title=f"{task.title} block",
                        subject_id=subject.id,
                        task_id=task.id,
                        start_at=start_at,
                        end_at=end_at,
                        source="manual",
                        notes=f"Planned {subject.name.lower()} focus session.",
                        created_at=start_at - timedelta(hours=8),
                    )
                    db.add(event)
                    db.flush()
                    schedule_event_id = event.id

                session = StudySession(
                    subject_id=subject.id,
                    task_id=task.id,
                    schedule_event_id=schedule_event_id,
                    mode=mode,
                    started_at=start_at,
                    ended_at=end_at,
                    focus_seconds=duration_minutes * 60,
                    paused_seconds=random.choice([0, 0, 30, 60, 120]),
                    stop_reason=stop_reason,
                    created_at=end_at,
                )
                db.add(session)

                if task.status != "todo" and random.random() < 0.26:
                    task.status = "done"
                    task.completed_at = end_at

        today_subject = next(row for row in subject_rows if row.name == "Computer Science")
        today_task = next(task for task in tasks_by_subject[today_subject.id] if task.status != "done")
        tomorrow_subject = next(row for row in subject_rows if row.name == "Mathematics")
        tomorrow_task = next(task for task in tasks_by_subject[tomorrow_subject.id] if task.status != "done")
        db.add(
            ScheduleEvent(
                title="Evening coding review",
                subject_id=today_subject.id,
                task_id=today_task.id,
                start_at=local_dt(TODAY, 19, 30),
                end_at=local_dt(TODAY, 20, 30),
                source="manual",
                notes="Kept for dashboard and reminder checks.",
                created_at=local_dt(TODAY, 9, 0),
            )
        )
        db.add(
            ScheduleEvent(
                title="Math formula refresh",
                subject_id=tomorrow_subject.id,
                task_id=tomorrow_task.id,
                start_at=local_dt(TODAY + timedelta(days=1), 18, 0),
                end_at=local_dt(TODAY + timedelta(days=1), 19, 10),
                source="manual",
                notes="Future event for calendar navigation.",
                created_at=local_dt(TODAY, 9, 15),
            )
        )

        db.commit()

        session_count = db.query(StudySession).count()
        task_count = db.query(Task).count()
        event_count = db.query(ScheduleEvent).count()
        subject_count = db.query(Subject).count()
        print(f"Backup saved to: {backup_path}")
        print(
            "Seeded demo dataset:",
            f"{subject_count} subjects, {task_count} tasks, {event_count} events, {session_count} study sessions.",
        )
        print(f"Historical study range: {START_DATE.isoformat()} to {END_DATE.isoformat()}")


if __name__ == "__main__":
    main()
