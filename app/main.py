from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from time import perf_counter
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import ROOT_DIR, SessionLocal, get_db, init_db
from app.models import AiConversation, ScheduleEvent, Setting, StudySession, Subject, Task, TimerState, now_local
from app.schemas import (
    AiChatSendIn,
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
    call_llm_text,
    create_draft,
    delete_chat_conversation,
    draft_to_payload,
    get_daily_quote,
    get_chat_conversation_payload,
    list_chat_conversations,
    normalize_plan_payload,
    planning_requests_schedule,
    save_chat_exchange,
)
from app.services.backup import clear_all_data, export_payload, import_payload
from app.services.settings import get_all_settings, get_int_setting, set_setting
from app.services.stats import compute_stats, sync_overdue_tasks
from app.services.timer import current_timer, pause_timer, resume_timer, skip_pomodoro, start_pomodoro, start_timer, stop_timer

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")

logger = logging.getLogger("potato_todo.http")


def seed_defaults() -> None:
    init_db()


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_defaults()
    yield


app = FastAPI(title="Local Study Planner & Timer", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT_DIR / "app" / "static"), name="static")
templates = Jinja2Templates(directory=ROOT_DIR / "app" / "templates")


def _mask_sensitive_data(value: Any) -> Any:
    if isinstance(value, dict):
        masked: dict[str, Any] = {}
        for key, item in value.items():
            if key.lower() in {"api_key", "authorization", "token", "password"}:
                masked[key] = "********"
            else:
                masked[key] = _mask_sensitive_data(item)
        return masked
    if isinstance(value, list):
        return [_mask_sensitive_data(item) for item in value]
    return value


def _format_log_payload(body: bytes, content_type: str | None) -> str:
    if not body:
        return "<empty>"
    text = body.decode("utf-8", errors="replace")
    if content_type and "application/json" in content_type.lower():
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return text
        return json.dumps(_mask_sensitive_data(parsed), ensure_ascii=False, indent=2)
    return text


def _format_query_params(request: Request) -> str:
    if not request.query_params:
        return "<empty>"
    grouped: dict[str, Any] = {}
    for key, value in request.query_params.multi_items():
        if key in grouped:
            existing = grouped[key]
            if isinstance(existing, list):
                existing.append(value)
            else:
                grouped[key] = [existing, value]
        else:
            grouped[key] = value
    return json.dumps(grouped, ensure_ascii=False, indent=2)


def _make_receive(body: bytes):
    sent = False

    async def receive() -> dict[str, Any]:
        nonlocal sent
        if sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


async def _read_response_body(response: Response) -> bytes:
    if hasattr(response, "body") and response.body is not None:
        return response.body
    if not hasattr(response, "body_iterator") or response.body_iterator is None:
        return b""
    chunks: list[bytes] = []
    async for chunk in response.body_iterator:
        chunks.append(chunk)
    return b"".join(chunks)


def _should_log_response_body(path: str, content_type: str) -> bool:
    lowered = content_type.lower()
    return path.startswith("/api") or lowered.startswith("application/json") or lowered.startswith("text/plain")


@app.middleware("http")
async def log_http_traffic(request: Request, call_next):
    raw_body = await request.body()
    request = Request(request.scope, _make_receive(raw_body))
    content_type = request.headers.get("content-type", "")
    started = perf_counter()
    logger.info(
        "HTTP request %s %s\nquery=%s\nbody=%s",
        request.method,
        request.url.path,
        _format_query_params(request),
        _format_log_payload(raw_body, content_type),
    )
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (perf_counter() - started) * 1000
        logger.exception("HTTP request failed %s %s in %.2fms", request.method, request.url.path, duration_ms)
        raise

    response_body = await _read_response_body(response)
    duration_ms = (perf_counter() - started) * 1000
    response_content_type = response.headers.get("content-type", "")
    if _should_log_response_body(request.url.path, response_content_type):
        logger.info(
            "HTTP response %s %s status=%s duration_ms=%.2f\ncontent_type=%s\nbody=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            response_content_type or "<unknown>",
            _format_log_payload(response_body, response_content_type),
        )
    else:
        logger.info(
            "HTTP response %s %s status=%s duration_ms=%.2f content_type=%s body=<omitted>",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            response_content_type or "<unknown>",
        )

    return Response(
        content=response_body,
        status_code=response.status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
        background=response.background,
    )


def page(request: Request, name: str, template_name: str, db: Session) -> HTMLResponse:
    today = now_local().date()
    analytics_start = today - timedelta(days=20)
    return templates.TemplateResponse(
        template_name,
        {
            "request": request,
            "active_page": name,
            "today": today.isoformat(),
            "analytics_default_start": analytics_start.isoformat(),
            "analytics_default_end": today.isoformat(),
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


@app.get("/assistant", response_class=HTMLResponse)
def assistant_page(request: Request, db: Session = Depends(get_db)):
    return page(request, "assistant", "assistant.html", db)


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


@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: int, db: Session = Depends(get_db)):
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")

    active_timer = db.query(TimerState).filter(TimerState.subject_id == subject_id).first()
    if active_timer is not None:
        raise HTTPException(status_code=400, detail="Stop the active timer before deleting this subject.")

    session_count = db.query(StudySession).filter(StudySession.subject_id == subject_id).count()
    if session_count:
        raise HTTPException(
            status_code=400,
            detail="This subject already has recorded study sessions and cannot be deleted.",
        )

    detached_tasks = (
        db.query(Task)
        .filter(Task.subject_id == subject_id)
        .update({Task.subject_id: None}, synchronize_session=False)
    )
    detached_events = (
        db.query(ScheduleEvent)
        .filter(ScheduleEvent.subject_id == subject_id)
        .update({ScheduleEvent.subject_id: None}, synchronize_session=False)
    )
    db.delete(subject)
    db.commit()
    return {
        "deleted": True,
        "detached_tasks": detached_tasks,
        "detached_events": detached_events,
    }


@app.get("/api/tasks")
def list_tasks(status: str | None = None, db: Session = Depends(get_db)):
    sync_overdue_tasks(db)
    query = db.query(Task).order_by(Task.status.asc(), Task.due_at.asc().nullslast(), Task.created_at.desc())
    if status:
        if status == "pending":
            query = query.filter(Task.status != "done")
        else:
            query = query.filter(Task.status == status)
    return [serialize_task(task) for task in query.all()]


@app.post("/api/tasks")
def create_task(data: TaskIn, db: Session = Depends(get_db)):
    task = Task(**data.model_dump())
    if task.status == "done":
        task.completed_at = task.completed_at or now_local()
    db.add(task)
    db.commit()
    sync_overdue_tasks(db)
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
    sync_overdue_tasks(db)
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
        "reasoning_effort": settings.get("llm_reasoning_effort"),
    }


@app.post("/api/settings/llm")
def save_llm_settings(data: LlmSettingsIn, db: Session = Depends(get_db)):
    if data.base_url is not None:
        set_setting(db, "llm_base_url", data.base_url.rstrip("/"))
    if data.api_key is not None and data.api_key != "********":
        set_setting(db, "llm_api_key", data.api_key)
    if data.model is not None:
        set_setting(db, "llm_model", data.model)
    if data.reasoning_effort is not None:
        set_setting(db, "llm_reasoning_effort", data.reasoning_effort)
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
    instruction = data.instruction or "Create a practical study plan from the provided tasks, schedule, goals, and study history."
    schedule_requested = planning_requests_schedule(instruction, data.conversation)
    llm_snapshot = {
        **snapshot,
        "instruction": instruction,
        "conversation": data.conversation or [],
        "planning_mode": "task_and_schedule" if schedule_requested else "task_only",
    }
    payload, raw = await call_llm(db, PLAN_SYSTEM_PROMPT, llm_snapshot, instruction=instruction, conversation=data.conversation)
    payload = normalize_plan_payload(payload, schedule_requested=schedule_requested)
    draft = create_draft(db, "plan", llm_snapshot, payload, raw)
    return draft_to_payload(draft)


@app.post("/api/ai/analyze")
async def ai_analyze(data: AiRequestIn, db: Session = Depends(get_db)):
    start, end = _ai_dates(data)
    snapshot = build_snapshot(db, start, end)
    instruction = data.instruction or "Analyze study habits and provide concise, actionable advice."
    llm_snapshot = {**snapshot, "instruction": instruction}
    payload, raw = await call_llm(db, ANALYZE_SYSTEM_PROMPT, snapshot, instruction=instruction)
    draft = create_draft(db, "analysis", llm_snapshot, payload, raw)
    return draft_to_payload(draft)


@app.get("/api/ai/chat/sessions")
def get_chat_sessions(db: Session = Depends(get_db)):
    return list_chat_conversations(db)


@app.get("/api/ai/chat/sessions/{conversation_id}")
def get_chat_session(conversation_id: int, db: Session = Depends(get_db)):
    return get_chat_conversation_payload(db, conversation_id)


@app.delete("/api/ai/chat/sessions/{conversation_id}")
def remove_chat_session(conversation_id: int, db: Session = Depends(get_db)):
    delete_chat_conversation(db, conversation_id)
    return {"deleted": True}


@app.post("/api/ai/chat/send")
async def ai_chat_send(data: AiChatSendIn, db: Session = Depends(get_db)):
    message = data.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    conversation_turns: list[dict[str, str]] = []
    if data.conversation_id is not None:
        conversation = db.get(AiConversation, data.conversation_id)
        if conversation is None or conversation.mode != "chat":
            raise HTTPException(status_code=404, detail="Chat conversation not found.")
        conversation_turns = [
            {"role": item.role, "content": item.content}
            for item in conversation.messages
            if item.role in {"user", "assistant"} and item.content
        ]

    assistant_message = await call_llm_text(db, None, message, conversation=conversation_turns)
    conversation_payload = save_chat_exchange(db, message, assistant_message, conversation_id=data.conversation_id)
    return {
        "conversation": conversation_payload,
        "assistant_message": assistant_message,
        "sessions": list_chat_conversations(db),
    }


@app.get("/api/ai/daily-quote")
async def ai_daily_quote(db: Session = Depends(get_db)):
    try:
        return await get_daily_quote(db, now_local().date())
    except HTTPException as exc:
        if exc.status_code != 400:
            raise
    return {
        "quote": "Stay hungry, stay foolish.",
        "author": "Steve Jobs",
        "source": "Stanford Commencement Address",
        "cached": False,
        "fallback": True,
    }


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
