from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import ROOT_DIR, SessionLocal, get_db, init_db
from app.models import ScheduleEvent, Setting, StudySession, Subject, Task, now_local
from app.schemas import (
    AiRequestIn,
    ClearDataIn,
    LlmSettingsIn,
    PomodoroSettingsIn,
    PomodoroStartIn,
    ScheduleEventIn,
    ScheduleEventPatch,
    SubjectIn,
    SubjectPatch,
    TaskIn,
    TaskPatch,
    TimerStartIn,
    TimerStopIn,
)
from app.services.ai import (
    ANALYZE_SYSTEM_PROMPT,
    PLAN_SYSTEM_PROMPT,
    apply_plan_draft,
    build_snapshot,
    call_llm,
    create_draft,
    draft_to_payload,
)
from app.services.backup import clear_all_data, export_payload, import_payload
from app.services.settings import get_all_settings, get_int_setting, set_setting
from app.services.stats import compute_stats
from app.services.timer import current_timer, pause_timer, resume_timer, skip_pomodoro, start_pomodoro, start_timer, stop_timer


def seed_defaults() -> None:
    init_db()


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_defaults()
    yield


app = FastAPI(title="Local Study Planner & Timer", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT_DIR / "app" / "static"), name="static")
templates = Jinja2Templates(directory=ROOT_DIR / "app" / "templates")


def page(request: Request, name: str, template_name: str, db: Session) -> HTMLResponse:
    return templates.TemplateResponse(
        template_name,
        {
            "request": request,
            "active_page": name,
            "today": now_local().date().isoformat(),
            "settings": get_all_settings(db),
        },
    )


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    return page(request, "dashboard", "dashboard.html", db)


@app.get("/focus", response_class=HTMLResponse)
def focus(request: Request, db: Session = Depends(get_db)):
    return page(request, "focus", "focus.html", db)


@app.get("/tasks", response_class=HTMLResponse)
def tasks_page(request: Request, db: Session = Depends(get_db)):
    return page(request, "tasks", "tasks.html", db)


@app.get("/calendar", response_class=HTMLResponse)
def calendar_page(request: Request, db: Session = Depends(get_db)):
    return page(request, "calendar", "calendar.html", db)


@app.get("/analytics", response_class=HTMLResponse)
def analytics_page(request: Request, db: Session = Depends(get_db)):
    return page(request, "analytics", "analytics.html", db)


@app.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request, db: Session = Depends(get_db)):
    return page(request, "settings", "settings.html", db)


def serialize_subject(subject: Subject) -> dict[str, Any]:
    return {
        "id": subject.id,
        "name": subject.name,
        "color": subject.color,
        "daily_goal_minutes": subject.daily_goal_minutes,
        "weekly_goal_minutes": subject.weekly_goal_minutes,
        "monthly_goal_minutes": subject.monthly_goal_minutes,
        "archived": subject.archived,
    }


def serialize_task(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "subject_id": task.subject_id,
        "subject": task.subject.name if task.subject else None,
        "subject_color": task.subject.color if task.subject else "#9CA3AF",
        "status": task.status,
        "priority": task.priority,
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "estimated_minutes": task.estimated_minutes,
        "notes": task.notes,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat(),
    }


def serialize_event(event: ScheduleEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "subject_id": event.subject_id,
        "task_id": event.task_id,
        "start_at": event.start_at.isoformat(),
        "end_at": event.end_at.isoformat(),
        "source": event.source,
        "notes": event.notes,
    }


@app.get("/api/subjects")
def list_subjects(include_archived: bool = False, db: Session = Depends(get_db)):
    query = db.query(Subject).order_by(Subject.archived.asc(), Subject.name.asc())
    if not include_archived:
        query = query.filter(Subject.archived.is_(False))
    return [serialize_subject(subject) for subject in query.all()]


@app.post("/api/subjects")
def create_subject(data: SubjectIn, db: Session = Depends(get_db)):
    subject = Subject(**data.model_dump())
    db.add(subject)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Subject name already exists.") from exc
    db.refresh(subject)
    return serialize_subject(subject)


@app.patch("/api/subjects/{subject_id}")
def update_subject(subject_id: int, data: SubjectPatch, db: Session = Depends(get_db)):
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(subject, key, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Subject name already exists.") from exc
    db.refresh(subject)
    return serialize_subject(subject)


@app.get("/api/tasks")
def list_tasks(status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Task).order_by(Task.status.asc(), Task.due_at.asc().nullslast(), Task.created_at.desc())
    if status:
        query = query.filter(Task.status == status)
    return [serialize_task(task) for task in query.all()]


@app.post("/api/tasks")
def create_task(data: TaskIn, db: Session = Depends(get_db)):
    task = Task(**data.model_dump())
    if task.status == "done":
        task.completed_at = now_local()
    db.add(task)
    db.commit()
    db.refresh(task)
    return serialize_task(task)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, data: TaskPatch, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(task, key, value)
    if updates.get("status") == "done" and task.completed_at is None:
        task.completed_at = now_local()
    if updates.get("status") and updates.get("status") != "done":
        task.completed_at = None
    db.commit()
    db.refresh(task)
    return serialize_task(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    db.delete(task)
    db.commit()
    return {"deleted": True}


@app.get("/api/schedule-events")
def list_schedule_events(start: date | None = None, end: date | None = None, db: Session = Depends(get_db)):
    query = db.query(ScheduleEvent).order_by(ScheduleEvent.start_at.asc())
    if start:
        query = query.filter(ScheduleEvent.end_at >= datetime.combine(start, datetime.min.time()))
    if end:
        query = query.filter(ScheduleEvent.start_at <= datetime.combine(end, datetime.max.time()))
    return [serialize_event(event) for event in query.all()]


@app.post("/api/schedule-events")
def create_schedule_event(data: ScheduleEventIn, db: Session = Depends(get_db)):
    event = ScheduleEvent(**data.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return serialize_event(event)


@app.patch("/api/schedule-events/{event_id}")
def update_schedule_event(event_id: int, data: ScheduleEventPatch, db: Session = Depends(get_db)):
    event = db.get(ScheduleEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(event, key, value)
    if event.end_at <= event.start_at:
        raise HTTPException(status_code=400, detail="End time must be after start time.")
    db.commit()
    db.refresh(event)
    return serialize_event(event)


@app.delete("/api/schedule-events/{event_id}")
def delete_schedule_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(ScheduleEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    db.delete(event)
    db.commit()
    return {"deleted": True}


@app.post("/api/timer/start")
def api_timer_start(data: TimerStartIn, db: Session = Depends(get_db)):
    return start_timer(db, data)


@app.post("/api/timer/pause")
def api_timer_pause(db: Session = Depends(get_db)):
    return pause_timer(db)


@app.post("/api/timer/resume")
def api_timer_resume(db: Session = Depends(get_db)):
    return resume_timer(db)


@app.post("/api/timer/stop")
def api_timer_stop(data: TimerStopIn | None = None, db: Session = Depends(get_db)):
    return stop_timer(db, adjusted_focus_minutes=data.adjusted_focus_minutes if data else None)


@app.get("/api/timer/current")
def api_timer_current(db: Session = Depends(get_db)):
    return current_timer(db)


@app.post("/api/pomodoro/start")
def api_pomodoro_start(data: PomodoroStartIn, db: Session = Depends(get_db)):
    return start_pomodoro(db, data)


@app.post("/api/pomodoro/skip")
def api_pomodoro_skip(db: Session = Depends(get_db)):
    return skip_pomodoro(db)


@app.get("/api/stats")
def api_stats(start: date | None = None, end: date | None = None, db: Session = Depends(get_db)):
    today = now_local().date()
    start = start or today
    end = end or today
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")
    return compute_stats(db, start, end)


@app.get("/api/settings/llm")
def get_llm_settings(db: Session = Depends(get_db)):
    settings = get_all_settings(db)
    return {
        "base_url": settings.get("llm_base_url"),
        "api_key": settings.get("llm_api_key"),
        "model": settings.get("llm_model"),
    }


@app.post("/api/settings/llm")
def save_llm_settings(data: LlmSettingsIn, db: Session = Depends(get_db)):
    if data.base_url is not None:
        set_setting(db, "llm_base_url", data.base_url.rstrip("/"))
    if data.api_key is not None and data.api_key != "********":
        set_setting(db, "llm_api_key", data.api_key)
    if data.model is not None:
        set_setting(db, "llm_model", data.model)
    return get_llm_settings(db)


@app.get("/api/settings/pomodoro")
def get_pomodoro_settings(db: Session = Depends(get_db)):
    return {
        "focus_minutes": get_int_setting(db, "pomodoro_focus_minutes", 25),
        "short_break_minutes": get_int_setting(db, "pomodoro_short_break_minutes", 5),
        "long_break_minutes": get_int_setting(db, "pomodoro_long_break_minutes", 15),
        "total_rounds": get_int_setting(db, "pomodoro_total_rounds", 4),
    }


@app.post("/api/settings/pomodoro")
def save_pomodoro_settings(data: PomodoroSettingsIn, db: Session = Depends(get_db)):
    set_setting(db, "pomodoro_focus_minutes", str(data.focus_minutes))
    set_setting(db, "pomodoro_short_break_minutes", str(data.short_break_minutes))
    set_setting(db, "pomodoro_long_break_minutes", str(data.long_break_minutes))
    set_setting(db, "pomodoro_total_rounds", str(data.total_rounds))
    return get_pomodoro_settings(db)


def _ai_dates(data: AiRequestIn) -> tuple[date, date]:
    today = now_local().date()
    start = data.start or today - timedelta(days=6)
    end = data.end or today
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")
    return start, end


@app.post("/api/ai/plan")
async def ai_plan(data: AiRequestIn, db: Session = Depends(get_db)):
    start, end = _ai_dates(data)
    snapshot = build_snapshot(db, start, end)
    snapshot["instruction"] = data.instruction or "Create a practical study plan from the provided tasks, schedule, goals, and study history."
    payload, raw = await call_llm(db, PLAN_SYSTEM_PROMPT, snapshot)
    draft = create_draft(db, "plan", snapshot, payload, raw)
    return draft_to_payload(draft)


@app.post("/api/ai/analyze")
async def ai_analyze(data: AiRequestIn, db: Session = Depends(get_db)):
    start, end = _ai_dates(data)
    snapshot = build_snapshot(db, start, end)
    snapshot["instruction"] = data.instruction or "Analyze study habits and provide concise, actionable advice."
    payload, raw = await call_llm(db, ANALYZE_SYSTEM_PROMPT, snapshot)
    draft = create_draft(db, "analysis", snapshot, payload, raw)
    return draft_to_payload(draft)


@app.get("/api/ai/drafts")
def list_ai_drafts(db: Session = Depends(get_db)):
    from app.models import AiDraft

    drafts = db.query(AiDraft).order_by(AiDraft.created_at.desc()).limit(20).all()
    return [draft_to_payload(draft) for draft in drafts]


@app.post("/api/ai/drafts/{draft_id}/apply")
def apply_ai_draft(draft_id: int, db: Session = Depends(get_db)):
    return apply_plan_draft(db, draft_id)


@app.get("/api/backup/export")
def backup_export(db: Session = Depends(get_db)):
    payload = export_payload(db)
    body = json.dumps(jsonable_encoder(payload), ensure_ascii=False, indent=2)
    filename = f"study-planner-backup-{now_local().strftime('%Y%m%d-%H%M%S')}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/backup/import")
async def backup_import(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        raw = await file.read()
        payload = json.loads(raw.decode("utf-8"))
        pre_import = import_payload(db, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Import failed: {exc}") from exc
    return {"imported": True, "pre_import_backup": str(pre_import)}


@app.post("/api/data/clear")
def clear_data(data: ClearDataIn, db: Session = Depends(get_db)):
    if not data.confirm:
        raise HTTPException(status_code=400, detail="Confirmation is required before clearing all data.")
    pre_clear = clear_all_data(db)
    return {"cleared": True, "pre_clear_backup": str(pre_clear)}


@app.get("/api/news/daily")
def daily_news_placeholder():
    return JSONResponse(status_code=501, content={"detail": "Not implemented yet."})


@app.get("/api/health")
def health():
    return {"ok": True, "time": now_local().isoformat()}
