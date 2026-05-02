from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from time import perf_counter
from typing import Any
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app.database import ROOT_DIR, get_db, init_db
from app.models import (
    AiConversation,
    ScheduleEvent,
    StudyRoomMember,
    StudySession,
    Subject,
    Task,
    TimerState,
    User,
    now_local,
)
from app.schemas import (
    AiChatSendIn,
    AiRequestIn,
    ClearDataIn,
    LlmSettingsIn,
    PomodoroSettingsIn,
    PomodoroStartIn,
    RoomCreateIn,
    RoomJoinIn,
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
    ensure_ai_enabled,
    get_chat_conversation_payload,
    get_daily_quote,
    list_chat_conversations,
    normalize_plan_payload,
    planning_requests_schedule,
    save_chat_exchange,
)
from app.services.auth import authenticate_user, claim_legacy_data, create_user, get_current_user, login_user, logout_user, require_user, user_label
from app.services.backup import clear_all_data, export_payload, import_payload
from app.services.rooms import (
    close_room,
    create_room,
    get_room_for_member,
    get_room_snapshot,
    join_room_by_code,
    kick_member,
    leave_room,
    list_user_rooms,
    reset_room_code,
    room_detail_payload,
)
from app.services.settings import (
    get_all_user_settings,
    get_int_user_setting,
    get_public_llm_settings,
    get_setting,
    get_site_ai_config,
    set_setting,
    set_user_setting,
)
from app.services.stats import compute_stats, sync_overdue_tasks
from app.services.timer import current_timer, pause_timer, resume_timer, skip_pomodoro, start_pomodoro, start_timer, stop_timer

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")

logger = logging.getLogger("potato_todo.http")


class RoomEventHub:
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        self._listeners: dict[int, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._lock = threading.Lock()

    def subscribe(self, room_id: int) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        with self._lock:
            self._listeners.setdefault(room_id, set()).add(queue)
        return queue

    def unsubscribe(self, room_id: int, queue: asyncio.Queue[dict[str, Any]]) -> None:
        with self._lock:
            listeners = self._listeners.get(room_id)
            if not listeners:
                return
            listeners.discard(queue)
            if not listeners:
                self._listeners.pop(room_id, None)

    def publish(self, room_id: int, changed_user_id: int | None, reason: str) -> None:
        event = {
            "room_id": room_id,
            "changed_user_id": changed_user_id,
            "changed_at": now_local().isoformat(),
            "reason": reason,
        }
        with self._lock:
            listeners = list(self._listeners.get(room_id, set()))
        for queue in listeners:
            self.loop.call_soon_threadsafe(self._queue_event, queue, event)

    @staticmethod
    def _queue_event(queue: asyncio.Queue[dict[str, Any]], event: dict[str, Any]) -> None:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass


def seed_defaults() -> None:
    init_db()


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_defaults()
    app.state.room_hub = RoomEventHub(asyncio.get_running_loop())
    yield


app = FastAPI(title="POTATO-TODO", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "potato-todo-dev-secret"),
    same_site="lax",
    https_only=os.getenv("COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes", "on"},
    max_age=60 * 60 * 24 * 30,
)
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
    if lowered.startswith("text/event-stream"):
        return False
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

    response_content_type = response.headers.get("content-type", "")
    duration_ms = (perf_counter() - started) * 1000
    if response_content_type.lower().startswith("text/event-stream"):
        logger.info(
            "HTTP response %s %s status=%s duration_ms=%.2f content_type=%s body=<stream>",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            response_content_type or "<unknown>",
        )
        return response

    response_body = await _read_response_body(response)
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


def _query_user(request: Request, db: Session) -> User | None:
    return get_current_user(request, db)


def _require_template_user(request: Request, db: Session) -> User | None:
    user = _query_user(request, db)
    if user is None:
        return None
    return user


def _redirect_to_login(request: Request) -> RedirectResponse:
    target = request.url.path
    if request.url.query:
        target = f"{target}?{request.url.query}"
    query = urlencode({"next": target})
    return RedirectResponse(url=f"/login?{query}", status_code=303)


def page(request: Request, name: str, template_name: str, db: Session, user: User, extra: dict[str, Any] | None = None) -> HTMLResponse:
    today = now_local().date()
    analytics_start = today - timedelta(days=20)
    context = {
        "request": request,
        "active_page": name,
        "today": today.isoformat(),
        "analytics_default_start": analytics_start.isoformat(),
        "analytics_default_end": today.isoformat(),
        "settings": get_all_user_settings(db, user.id),
        "current_user": user,
        "current_user_label": user_label(user),
        "ai_enabled": get_site_ai_config(db)["enabled"],
    }
    if extra:
        context.update(extra)
    return templates.TemplateResponse(request, template_name, context)


def _owned_subject(db: Session, user_id: int, subject_id: int | None) -> Subject | None:
    if subject_id is None:
        return None
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.user_id == user_id).first()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return subject


def _owned_task(db: Session, user_id: int, task_id: int | None) -> Task | None:
    if task_id is None:
        return None
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


def _owned_event(db: Session, user_id: int, event_id: int | None) -> ScheduleEvent | None:
    if event_id is None:
        return None
    event = db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id, ScheduleEvent.user_id == user_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    return event


PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _sort_tasks(rows: list[Task]) -> list[Task]:
    def key(task: Task):
        if task.status == "done":
            return (2, datetime.max, PRIORITY_ORDER.get(task.priority, 1), -(task.completed_at or task.updated_at).timestamp())
        if task.due_at:
            return (0, task.due_at, PRIORITY_ORDER.get(task.priority, 1), -task.created_at.timestamp())
        return (1, datetime.max, PRIORITY_ORDER.get(task.priority, 1), -task.created_at.timestamp())

    return sorted(rows, key=key)


def _user_room_ids(db: Session, user_id: int) -> list[int]:
    return [
        room_id
        for (room_id,) in db.query(StudyRoomMember.room_id)
        .filter(StudyRoomMember.user_id == user_id, StudyRoomMember.status == "active")
        .all()
    ]


def _publish_room_event(room_id: int, changed_user_id: int | None, reason: str) -> None:
    hub: RoomEventHub | None = getattr(app.state, "room_hub", None)
    if hub is not None:
        hub.publish(room_id, changed_user_id, reason)


def _publish_user_room_updates(db: Session, user_id: int, reason: str) -> None:
    for room_id in _user_room_ids(db, user_id):
        _publish_room_event(room_id, user_id, reason)


def serialize_subject(subject: Subject, total_focus_seconds: int = 0) -> dict[str, Any]:
    return {
        "id": subject.id,
        "name": subject.name,
        "color": subject.color,
        "daily_goal_minutes": subject.daily_goal_minutes,
        "weekly_goal_minutes": subject.weekly_goal_minutes,
        "monthly_goal_minutes": subject.monthly_goal_minutes,
        "total_focus_seconds": int(total_focus_seconds or 0),
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


def llm_settings_payload(db: Session, user: User) -> dict[str, Any]:
    site = get_public_llm_settings(db)
    return {
        **site,
        "model": get_all_user_settings(db, user.id).get("llm_model", site["model"]) or site["model"],
        "reasoning_effort": get_all_user_settings(db, user.id).get("llm_reasoning_effort", site["reasoning_effort"])
        or site["reasoning_effort"],
    }


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, db: Session = Depends(get_db), next: str | None = None):
    user = _query_user(request, db)
    if user is not None:
        return RedirectResponse(url=next or "/", status_code=303)
    return templates.TemplateResponse(request, "login.html", {"request": request, "next": next, "mode": "login"})


@app.post("/login")
def login_submit(
    request: Request,
    db: Session = Depends(get_db),
    email: str = Form(...),
    password: str = Form(...),
    next: str | None = Form(default=None),
):
    user = authenticate_user(db, email, password)
    if user is None:
        return templates.TemplateResponse(
            request,
            "login.html",
            {"request": request, "next": next, "mode": "login", "error": "Invalid email or password."},
            status_code=400,
        )
    login_user(request, user)
    return RedirectResponse(url=next or "/", status_code=303)


@app.get("/register", response_class=HTMLResponse)
def register_page(request: Request, db: Session = Depends(get_db), next: str | None = None):
    user = _query_user(request, db)
    if user is not None:
        return RedirectResponse(url=next or "/", status_code=303)
    return templates.TemplateResponse(request, "login.html", {"request": request, "next": next, "mode": "register"})


@app.post("/register")
def register_submit(
    request: Request,
    db: Session = Depends(get_db),
    email: str = Form(...),
    password: str = Form(...),
    confirm_password: str = Form(...),
    next: str | None = Form(default=None),
):
    if password != confirm_password:
        return templates.TemplateResponse(
            request,
            "login.html",
            {"request": request, "next": next, "mode": "register", "error": "Passwords do not match."},
            status_code=400,
        )
    before_count = db.query(User).count()
    try:
        user = create_user(db, email, password)
    except HTTPException as exc:
        return templates.TemplateResponse(
            request,
            "login.html",
            {"request": request, "next": next, "mode": "register", "error": exc.detail},
            status_code=exc.status_code,
        )
    if before_count == 0:
        claim_legacy_data(db, user.id)
    login_user(request, user)
    return RedirectResponse(url=next or "/", status_code=303)


@app.post("/logout")
def logout_submit(request: Request):
    logout_user(request)
    return RedirectResponse(url="/login", status_code=303)


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "dashboard", "dashboard.html", db, user)


@app.get("/focus", response_class=HTMLResponse)
def focus(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "focus", "focus.html", db, user)


@app.get("/tasks", response_class=HTMLResponse)
def tasks_page(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "tasks", "tasks.html", db, user)


@app.get("/calendar", response_class=HTMLResponse)
def calendar_page(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "calendar", "calendar.html", db, user)


@app.get("/analytics", response_class=HTMLResponse)
def analytics_page(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "analytics", "analytics.html", db, user)


@app.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "settings", "settings.html", db, user)


@app.get("/assistant", response_class=HTMLResponse)
def assistant_page(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "assistant", "assistant.html", db, user)


@app.get("/rooms", response_class=HTMLResponse)
def rooms_page(request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    return page(request, "rooms", "rooms.html", db, user)


@app.get("/rooms/{room_id}", response_class=HTMLResponse)
def room_detail_page(room_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_template_user(request, db)
    if user is None:
        return _redirect_to_login(request)
    room = room_detail_payload(db, room_id, user.id)
    return page(request, "rooms", "room_detail.html", db, user, extra={"room": room})


def current_user_dep(request: Request, db: Session = Depends(get_db)) -> User:
    return require_user(request, db)


@app.get("/api/subjects")
def list_subjects(
    request: Request,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(current_user_dep),
):
    query = db.query(Subject).filter(Subject.user_id == user.id).order_by(Subject.archived.asc(), Subject.name.asc())
    if not include_archived:
        query = query.filter(Subject.archived.is_(False))
    subjects = query.all()
    focus_totals = dict(
        db.query(StudySession.subject_id, func.coalesce(func.sum(StudySession.focus_seconds), 0))
        .filter(StudySession.user_id == user.id)
        .group_by(StudySession.subject_id)
        .all()
    )
    return [serialize_subject(subject, total_focus_seconds=focus_totals.get(subject.id, 0)) for subject in subjects]


@app.post("/api/subjects")
def create_subject_api(data: SubjectIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    subject = Subject(user_id=user.id, **data.model_dump())
    db.add(subject)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Subject name already exists.") from exc
    db.refresh(subject)
    return serialize_subject(subject, total_focus_seconds=0)


@app.patch("/api/subjects/{subject_id}")
def update_subject(subject_id: int, data: SubjectPatch, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.user_id == user.id).first()
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
    total_focus_seconds = (
        db.query(func.coalesce(func.sum(StudySession.focus_seconds), 0))
        .filter(StudySession.user_id == user.id, StudySession.subject_id == subject.id)
        .scalar()
    )
    return serialize_subject(subject, total_focus_seconds=total_focus_seconds or 0)


@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.user_id == user.id).first()
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")

    active_timer = db.query(TimerState).filter(TimerState.user_id == user.id, TimerState.subject_id == subject_id).first()
    if active_timer is not None:
        raise HTTPException(status_code=400, detail="Stop the active timer before deleting this subject.")

    session_count = db.query(StudySession).filter(StudySession.user_id == user.id, StudySession.subject_id == subject_id).count()
    if session_count:
        raise HTTPException(status_code=400, detail="This subject already has recorded study sessions and cannot be deleted.")

    detached_tasks = (
        db.query(Task)
        .filter(Task.user_id == user.id, Task.subject_id == subject_id)
        .update({Task.subject_id: None}, synchronize_session=False)
    )
    detached_events = (
        db.query(ScheduleEvent)
        .filter(ScheduleEvent.user_id == user.id, ScheduleEvent.subject_id == subject_id)
        .update({ScheduleEvent.subject_id: None}, synchronize_session=False)
    )
    db.delete(subject)
    db.commit()
    return {"deleted": True, "detached_tasks": detached_tasks, "detached_events": detached_events}


@app.get("/api/tasks")
def list_tasks(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user_dep),
):
    sync_overdue_tasks(db, user.id)
    query = db.query(Task).filter(Task.user_id == user.id)
    if status:
        if status == "pending":
            query = query.filter(Task.status != "done")
        else:
            query = query.filter(Task.status == status)
    tasks = _sort_tasks(query.all())
    return [serialize_task(task) for task in tasks]


@app.post("/api/tasks")
def create_task_api(data: TaskIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    if data.subject_id is not None:
        _owned_subject(db, user.id, data.subject_id)
    task = Task(user_id=user.id, **data.model_dump())
    if task.status == "done":
        task.completed_at = task.completed_at or now_local()
    db.add(task)
    db.commit()
    sync_overdue_tasks(db, user.id)
    db.refresh(task)
    _publish_user_room_updates(db, user.id, "task_created")
    return serialize_task(task)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, data: TaskPatch, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    if "subject_id" in data.model_dump(exclude_unset=True):
        _owned_subject(db, user.id, data.subject_id)
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(task, key, value)
    if updates.get("status") == "done" and task.completed_at is None:
        task.completed_at = now_local()
    if updates.get("status") and updates.get("status") != "done":
        task.completed_at = None
    db.commit()
    sync_overdue_tasks(db, user.id)
    db.refresh(task)
    _publish_user_room_updates(db, user.id, "task_updated")
    return serialize_task(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    db.delete(task)
    db.commit()
    _publish_user_room_updates(db, user.id, "task_deleted")
    return {"deleted": True}


@app.get("/api/schedule-events")
def list_schedule_events(
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user_dep),
):
    query = db.query(ScheduleEvent).filter(ScheduleEvent.user_id == user.id).order_by(ScheduleEvent.start_at.asc())
    if start:
        query = query.filter(ScheduleEvent.end_at >= datetime.combine(start, datetime.min.time()))
    if end:
        query = query.filter(ScheduleEvent.start_at <= datetime.combine(end, datetime.max.time()))
    return [serialize_event(event) for event in query.all()]


@app.post("/api/schedule-events")
def create_schedule_event(data: ScheduleEventIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    if data.subject_id is not None:
        _owned_subject(db, user.id, data.subject_id)
    if data.task_id is not None:
        _owned_task(db, user.id, data.task_id)
    event = ScheduleEvent(user_id=user.id, **data.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return serialize_event(event)


@app.patch("/api/schedule-events/{event_id}")
def update_schedule_event(event_id: int, data: ScheduleEventPatch, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    event = db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id, ScheduleEvent.user_id == user.id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    updates = data.model_dump(exclude_unset=True)
    if "subject_id" in updates:
        _owned_subject(db, user.id, updates.get("subject_id"))
    if "task_id" in updates:
        _owned_task(db, user.id, updates.get("task_id"))
    for key, value in updates.items():
        setattr(event, key, value)
    if event.end_at <= event.start_at:
        raise HTTPException(status_code=400, detail="End time must be after start time.")
    db.commit()
    db.refresh(event)
    return serialize_event(event)


@app.delete("/api/schedule-events/{event_id}")
def delete_schedule_event(event_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    event = db.query(ScheduleEvent).filter(ScheduleEvent.id == event_id, ScheduleEvent.user_id == user.id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    db.delete(event)
    db.commit()
    return {"deleted": True}


@app.post("/api/timer/start")
def api_timer_start(data: TimerStartIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = start_timer(db, user.id, data)
    _publish_user_room_updates(db, user.id, "timer_started")
    return result


@app.post("/api/timer/pause")
def api_timer_pause(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = pause_timer(db, user.id)
    _publish_user_room_updates(db, user.id, "timer_paused")
    return result


@app.post("/api/timer/resume")
def api_timer_resume(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = resume_timer(db, user.id)
    _publish_user_room_updates(db, user.id, "timer_resumed")
    return result


@app.post("/api/timer/stop")
def api_timer_stop(data: TimerStopIn | None = None, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = stop_timer(db, user.id, adjusted_focus_minutes=data.adjusted_focus_minutes if data else None)
    _publish_user_room_updates(db, user.id, "timer_stopped")
    return result


@app.get("/api/timer/current")
def api_timer_current(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = current_timer(db, user.id)
    if result.get("completed") or not result.get("active", False):
        _publish_user_room_updates(db, user.id, "timer_current_sync")
    return result


@app.post("/api/pomodoro/start")
def api_pomodoro_start(data: PomodoroStartIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = start_pomodoro(db, user.id, data)
    _publish_user_room_updates(db, user.id, "pomodoro_started")
    return result


@app.post("/api/pomodoro/skip")
def api_pomodoro_skip(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = skip_pomodoro(db, user.id)
    _publish_user_room_updates(db, user.id, "pomodoro_skipped")
    return result


@app.get("/api/stats")
def api_stats(
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user_dep),
):
    today = now_local().date()
    start = start or today
    end = end or today
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")
    return compute_stats(db, user.id, start, end)


@app.get("/api/settings/llm")
def get_llm_settings(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    return llm_settings_payload(db, user)


@app.post("/api/settings/llm")
def save_llm_settings(data: LlmSettingsIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    if data.model is not None:
        set_user_setting(db, user.id, "llm_model", data.model)
    if data.reasoning_effort is not None:
        set_user_setting(db, user.id, "llm_reasoning_effort", data.reasoning_effort)

    site = get_site_ai_config(db)
    if not site["managed_by_environment"]:
        if data.base_url is not None:
            set_setting(db, "llm_base_url", data.base_url.rstrip("/"))
        if data.api_key is not None and data.api_key != "********":
            set_setting(db, "llm_api_key", data.api_key)
    return llm_settings_payload(db, user)


@app.get("/api/settings/pomodoro")
def get_pomodoro_settings(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    return {
        "focus_minutes": get_int_user_setting(db, user.id, "pomodoro_focus_minutes", 25),
        "short_break_minutes": get_int_user_setting(db, user.id, "pomodoro_short_break_minutes", 5),
        "long_break_minutes": get_int_user_setting(db, user.id, "pomodoro_long_break_minutes", 15),
        "total_rounds": get_int_user_setting(db, user.id, "pomodoro_total_rounds", 4),
    }


@app.post("/api/settings/pomodoro")
def save_pomodoro_settings(data: PomodoroSettingsIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    set_user_setting(db, user.id, "pomodoro_focus_minutes", str(data.focus_minutes))
    set_user_setting(db, user.id, "pomodoro_short_break_minutes", str(data.short_break_minutes))
    set_user_setting(db, user.id, "pomodoro_long_break_minutes", str(data.long_break_minutes))
    set_user_setting(db, user.id, "pomodoro_total_rounds", str(data.total_rounds))
    return get_pomodoro_settings(db, user)


def _ai_dates(data: AiRequestIn) -> tuple[date, date]:
    today = now_local().date()
    start = data.start or today - timedelta(days=6)
    end = data.end or today
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")
    return start, end


@app.post("/api/ai/plan")
async def ai_plan(data: AiRequestIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    ensure_ai_enabled(db)
    start, end = _ai_dates(data)
    snapshot = build_snapshot(db, user.id, start, end)
    instruction = data.instruction or "Create a practical study plan from the provided tasks, schedule, goals, and study history."
    schedule_requested = planning_requests_schedule(instruction, data.conversation)
    llm_snapshot = {
        **snapshot,
        "instruction": instruction,
        "conversation": data.conversation or [],
        "planning_mode": "task_and_schedule" if schedule_requested else "task_only",
    }
    payload, raw = await call_llm(db, user.id, PLAN_SYSTEM_PROMPT, llm_snapshot, instruction=instruction, conversation=data.conversation)
    payload = normalize_plan_payload(payload, schedule_requested=schedule_requested)
    draft = create_draft(db, user.id, "plan", llm_snapshot, payload, raw)
    return draft_to_payload(draft)


@app.post("/api/ai/analyze")
async def ai_analyze(data: AiRequestIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    ensure_ai_enabled(db)
    start, end = _ai_dates(data)
    snapshot = build_snapshot(db, user.id, start, end)
    instruction = data.instruction or "Analyze study habits and provide concise, actionable advice."
    llm_snapshot = {**snapshot, "instruction": instruction}
    payload, raw = await call_llm(db, user.id, ANALYZE_SYSTEM_PROMPT, snapshot, instruction=instruction)
    draft = create_draft(db, user.id, "analysis", llm_snapshot, payload, raw)
    return draft_to_payload(draft)


@app.get("/api/ai/chat/sessions")
def get_chat_sessions(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    ensure_ai_enabled(db)
    return list_chat_conversations(db, user.id)


@app.get("/api/ai/chat/sessions/{conversation_id}")
def get_chat_session(conversation_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    ensure_ai_enabled(db)
    return get_chat_conversation_payload(db, user.id, conversation_id)


@app.delete("/api/ai/chat/sessions/{conversation_id}")
def remove_chat_session(conversation_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    ensure_ai_enabled(db)
    delete_chat_conversation(db, user.id, conversation_id)
    return {"deleted": True}


@app.post("/api/ai/chat/send")
async def ai_chat_send(data: AiChatSendIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    ensure_ai_enabled(db)
    message = data.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    conversation_turns: list[dict[str, str]] = []
    if data.conversation_id is not None:
        conversation = (
            db.query(AiConversation)
            .filter(AiConversation.id == data.conversation_id, AiConversation.user_id == user.id)
            .first()
        )
        if conversation is None or conversation.mode != "chat":
            raise HTTPException(status_code=404, detail="Chat conversation not found.")
        conversation_turns = [
            {"role": item.role, "content": item.content}
            for item in conversation.messages
            if item.role in {"user", "assistant"} and item.content
        ]

    assistant_message = await call_llm_text(db, user.id, None, message, conversation=conversation_turns)
    conversation_payload = save_chat_exchange(db, user.id, message, assistant_message, conversation_id=data.conversation_id)
    return {
        "conversation": conversation_payload,
        "assistant_message": assistant_message,
        "sessions": list_chat_conversations(db, user.id),
    }


@app.get("/api/ai/daily-quote")
async def ai_daily_quote(db: Session = Depends(get_db)):
    try:
        return await get_daily_quote(db, now_local().date())
    except HTTPException as exc:
        if exc.status_code not in {503, 400}:
            raise
    return {
        "quote": "Stay hungry, stay foolish.",
        "author": "Steve Jobs",
        "source": "Stanford Commencement Address",
        "cached": False,
        "fallback": True,
    }


@app.get("/api/ai/drafts")
def list_ai_drafts(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    from app.models import AiDraft

    drafts = (
        db.query(AiDraft)
        .filter(AiDraft.user_id == user.id)
        .order_by(AiDraft.created_at.desc())
        .limit(20)
        .all()
    )
    return [draft_to_payload(draft) for draft in drafts]


@app.post("/api/ai/drafts/{draft_id}/apply")
def apply_ai_draft(draft_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    result = apply_plan_draft(db, user.id, draft_id)
    _publish_user_room_updates(db, user.id, "ai_draft_applied")
    return result


@app.get("/api/backup/export")
def backup_export(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    payload = export_payload(db, user.id)
    body = json.dumps(jsonable_encoder(payload), ensure_ascii=False, indent=2)
    filename = f"study-planner-backup-user-{user.id}-{now_local().strftime('%Y%m%d-%H%M%S')}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/backup/import")
async def backup_import(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    try:
        raw = await file.read()
        payload = json.loads(raw.decode("utf-8"))
        pre_import = import_payload(db, user.id, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Import failed: {exc}") from exc
    _publish_user_room_updates(db, user.id, "backup_imported")
    return {"imported": True, "pre_import_backup": str(pre_import)}


@app.post("/api/data/clear")
def clear_data(data: ClearDataIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    if not data.confirm:
        raise HTTPException(status_code=400, detail="Confirmation is required before clearing all data.")
    pre_clear = clear_all_data(db, user.id)
    _publish_user_room_updates(db, user.id, "data_cleared")
    return {"cleared": True, "pre_clear_backup": str(pre_clear)}


@app.get("/api/rooms")
def api_list_rooms(db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    return list_user_rooms(db, user.id)


@app.post("/api/rooms")
def api_create_room(data: RoomCreateIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    room = create_room(db, user, data.name, member_limit=data.member_limit, timezone=data.timezone)
    _publish_room_event(room.id, user.id, "room_created")
    return room_detail_payload(db, room.id, user.id)


@app.post("/api/rooms/join")
def api_join_room(data: RoomJoinIn, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    room = join_room_by_code(db, user, data.join_code)
    _publish_room_event(room.id, user.id, "room_joined")
    return room_detail_payload(db, room.id, user.id)


@app.get("/api/rooms/{room_id}")
def api_room_detail(room_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    return room_detail_payload(db, room_id, user.id)


@app.get("/api/rooms/{room_id}/snapshot")
def api_room_snapshot(room_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    return get_room_snapshot(db, room_id, user.id)


@app.get("/api/rooms/{room_id}/stream")
async def api_room_stream(room_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    get_room_for_member(db, room_id, user.id, require_active=True)
    queue = app.state.room_hub.subscribe(room_id)

    async def event_generator():
        try:
            initial = {"room_id": room_id, "changed_user_id": user.id, "changed_at": now_local().isoformat(), "reason": "connected"}
            yield f"event: room_update\ndata: {json.dumps(initial, ensure_ascii=False)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"event: room_update\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield "event: ping\ndata: {}\n\n"
        finally:
            app.state.room_hub.unsubscribe(room_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/rooms/{room_id}/leave")
def api_leave_room(room_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    leave_room(db, room_id, user.id)
    _publish_room_event(room_id, user.id, "room_left")
    return {"left": True}


@app.post("/api/rooms/{room_id}/reset-code")
def api_reset_room_code(room_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    room = reset_room_code(db, room_id, user.id)
    _publish_room_event(room.id, user.id, "room_code_reset")
    return room_detail_payload(db, room.id, user.id)


@app.post("/api/rooms/{room_id}/close")
def api_close_room(room_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    room = close_room(db, room_id, user.id)
    _publish_room_event(room.id, user.id, "room_closed")
    return room_detail_payload(db, room.id, user.id)


@app.post("/api/rooms/{room_id}/members/{member_user_id}/kick")
def api_kick_room_member(room_id: int, member_user_id: int, db: Session = Depends(get_db), user: User = Depends(current_user_dep)):
    kick_member(db, room_id, user.id, member_user_id)
    _publish_room_event(room_id, member_user_id, "room_member_kicked")
    return {"kicked": True}


@app.get("/api/news/daily")
def daily_news_placeholder():
    return JSONResponse(status_code=501, content={"detail": "Not implemented yet."})


@app.get("/api/health")
def health():
    return {"ok": True, "time": now_local().isoformat()}
