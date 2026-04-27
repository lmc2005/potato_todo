from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import AiConversation, AiDraft, AiMessage, ScheduleEvent, Subject, Task, now_local
from app.services.settings import get_setting, set_setting
from app.services.stats import compute_stats

logger = logging.getLogger("potato_todo.ai")

TIME_PLANNING_RE = re.compile(
    r"\b("
    r"today|tonight|tomorrow|this morning|this afternoon|this evening|"
    r"next day|next two days|next 2 days|next three days|next 3 days|"
    r"this week|next week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"calendar|schedule|time block|timeslot|time slot|slot|hour|hours|minute|minutes|"
    r"am|pm|morning|afternoon|evening|night|before|after|between|from .* to|"
    r"\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}"
    r")\b",
    flags=re.IGNORECASE,
)


def build_snapshot(db: Session, start: date, end: date) -> dict[str, Any]:
    stats = compute_stats(db, start, end)
    subjects = [
        {
            "id": subject.id,
            "name": subject.name,
            "daily_goal_minutes": subject.daily_goal_minutes,
            "weekly_goal_minutes": subject.weekly_goal_minutes,
            "monthly_goal_minutes": subject.monthly_goal_minutes,
            "archived": subject.archived,
        }
        for subject in db.query(Subject).order_by(Subject.name.asc()).all()
    ]
    tasks = [
        {
            "id": task.id,
            "title": task.title,
            "subject_id": task.subject_id,
            "status": task.status,
            "priority": task.priority,
            "due_at": task.due_at.isoformat() if task.due_at else None,
            "estimated_minutes": task.estimated_minutes,
            "notes": task.notes,
        }
        for task in db.query(Task).order_by(Task.created_at.desc()).all()
    ]
    events = [
        {
            "id": event.id,
            "title": event.title,
            "subject_id": event.subject_id,
            "task_id": event.task_id,
            "start_at": event.start_at.isoformat(),
            "end_at": event.end_at.isoformat(),
            "source": event.source,
            "notes": event.notes,
        }
        for event in db.query(ScheduleEvent).order_by(ScheduleEvent.start_at.asc()).all()
    ]
    return {"range": {"start": start.isoformat(), "end": end.isoformat()}, "subjects": subjects, "tasks": tasks, "events": events, "stats": stats}


def _extract_json(content: str) -> dict[str, Any]:
    content = content.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", content, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        content = fenced.group(1).strip()
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="The model did not return valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="The model response must be a JSON object.")
    return parsed


def _normalize_conversation(conversation: list[dict[str, str]] | None) -> list[dict[str, str]]:
    turns: list[dict[str, str]] = []
    for item in conversation or []:
        role = str(item.get("role") or "").strip()
        content = str(item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        turns.append({"role": role, "content": content[:20000]})
    return turns[-12:]


def _llm_config(db: Session) -> tuple[str, str, str, str]:
    base_url = (get_setting(db, "llm_base_url", "") or "").rstrip("/")
    api_key = get_setting(db, "llm_api_key", "") or ""
    model = get_setting(db, "llm_model", "gpt-5.4") or "gpt-5.4"
    reasoning_effort = (get_setting(db, "llm_reasoning_effort", "medium") or "").strip()
    if not base_url or not api_key:
        raise HTTPException(status_code=400, detail="LLM base URL and API key are required in Settings.")
    return base_url, api_key, model, reasoning_effort


def _extract_text_content(data: dict[str, Any]) -> str:
    message = data.get("choices", [{}])[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
        return "".join(parts).strip()
    return str(content or "").strip()


async def _llm_request(db: Session, body: dict[str, Any]) -> tuple[dict[str, Any], str]:
    base_url, api_key, model, reasoning_effort = _llm_config(db)
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, **body}
    if reasoning_effort and model.startswith("gpt-5"):
        body["reasoning_effort"] = reasoning_effort
    logger.info(
        "LLM request\nurl=%s\nmodel=%s\npayload=%s",
        url,
        model,
        json.dumps(body, ensure_ascii=False, indent=2),
    )
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, headers=headers, json=body)
    logger.info(
        "LLM response\nurl=%s\nstatus=%s\nbody=%s",
        url,
        response.status_code,
        response.text,
    )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {response.text[:500]}")
    data = response.json()
    content = _extract_text_content(data)
    if not content:
        raise HTTPException(status_code=502, detail="The model returned an empty response.")
    return data, content


async def call_llm(
    db: Session,
    system_prompt: str,
    user_payload: dict[str, Any],
    instruction: str | None = None,
    conversation: list[dict[str, str]] | None = None,
) -> tuple[dict[str, Any], str]:
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": "Use the following local study snapshot as the current source of truth.\n"
            + json.dumps(user_payload, ensure_ascii=False),
        },
    ]
    messages.extend(_normalize_conversation(conversation))
    if instruction:
        messages.append({"role": "user", "content": instruction})
    _, content = await _llm_request(
        db,
        {
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": messages,
        },
    )
    return _extract_json(content), content


async def call_llm_text(
    db: Session,
    system_prompt: str | None,
    instruction: str,
    conversation: list[dict[str, str]] | None = None,
    context: dict[str, Any] | None = None,
) -> str:
    messages: list[dict[str, str]] = []
    if system_prompt and system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt})
    if context:
        messages.append({"role": "system", "content": "Local context:\n" + json.dumps(context, ensure_ascii=False)})
    messages.extend(_normalize_conversation(conversation))
    messages.append({"role": "user", "content": instruction})
    _, content = await _llm_request(
        db,
        {
            "temperature": 0.55,
            "messages": messages,
        },
    )
    return content.strip()


def planning_requests_schedule(instruction: str | None, conversation: list[dict[str, str]] | None = None) -> bool:
    segments = [instruction or ""]
    segments.extend(str(item.get("content") or "") for item in (conversation or []) if item.get("role") == "user")
    haystack = "\n".join(segment.strip() for segment in segments if segment and segment.strip())
    if not haystack:
        return False
    return bool(TIME_PLANNING_RE.search(haystack))


def _event_to_task(item: dict[str, Any]) -> dict[str, Any] | None:
    title = str(item.get("title") or "").strip()
    if not title:
        return None
    estimated_minutes: int | None = None
    start_at = item.get("start_at")
    end_at = item.get("end_at")
    if start_at and end_at:
        try:
            duration = datetime.fromisoformat(str(end_at)) - datetime.fromisoformat(str(start_at))
            estimated_minutes = max(1, int(duration.total_seconds() // 60))
        except ValueError:
            estimated_minutes = None
    return {
        "title": title,
        "subject_id": item.get("subject_id"),
        "priority": item.get("priority") if item.get("priority") in {"low", "medium", "high"} else "medium",
        "estimated_minutes": estimated_minutes,
        "notes": item.get("notes") or item.get("reason"),
        "reason": item.get("reason") or item.get("notes"),
    }


def normalize_plan_payload(payload: dict[str, Any], schedule_requested: bool) -> dict[str, Any]:
    normalized = dict(payload)
    tasks = list(normalized.get("tasks") or [])
    schedule_events = list(normalized.get("schedule_events") or normalized.get("events") or [])
    normalized["risks"] = list(normalized.get("risks") or [])

    if not schedule_requested and schedule_events:
        existing_titles = {str(task.get("title") or "").strip().lower() for task in tasks if task.get("title")}
        for item in schedule_events:
            converted = _event_to_task(item)
            if not converted:
                continue
            key = str(converted.get("title") or "").strip().lower()
            if key and key not in existing_titles:
                tasks.append(converted)
                existing_titles.add(key)
        schedule_events = []

    normalized["tasks"] = tasks
    normalized["schedule_events"] = schedule_events
    normalized.pop("events", None)
    return normalized


def create_draft(db: Session, kind: str, snapshot: dict[str, Any], payload: dict[str, Any], raw_response: str | None) -> AiDraft:
    draft = AiDraft(
        kind=kind,
        input_snapshot=json.dumps(snapshot, ensure_ascii=False),
        payload=json.dumps(payload, ensure_ascii=False),
        raw_response=raw_response,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


def draft_to_payload(draft: AiDraft) -> dict[str, Any]:
    return {
        "id": draft.id,
        "kind": draft.kind,
        "status": draft.status,
        "payload": json.loads(draft.payload),
        "created_at": draft.created_at.isoformat(),
        "applied_at": draft.applied_at.isoformat() if draft.applied_at else None,
    }


def _chat_title_from_message(message: str) -> str:
    title = " ".join(str(message or "").strip().split())
    if not title:
        return "New chat"
    return title[:56] + "..." if len(title) > 56 else title


def serialize_chat_message(message: AiMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
    }


def serialize_chat_conversation(conversation: AiConversation) -> dict[str, Any]:
    last_message = conversation.messages[-1] if conversation.messages else None
    return {
        "id": conversation.id,
        "mode": conversation.mode,
        "title": conversation.title,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
        "message_count": len(conversation.messages),
        "preview": (last_message.content[:120] + "...") if last_message and len(last_message.content) > 120 else (last_message.content if last_message else ""),
    }


def list_chat_conversations(db: Session) -> list[dict[str, Any]]:
    conversations = (
        db.query(AiConversation)
        .filter(AiConversation.mode == "chat")
        .order_by(AiConversation.updated_at.desc(), AiConversation.id.desc())
        .all()
    )
    return [serialize_chat_conversation(conversation) for conversation in conversations]


def get_chat_conversation_payload(db: Session, conversation_id: int) -> dict[str, Any]:
    conversation = db.get(AiConversation, conversation_id)
    if conversation is None or conversation.mode != "chat":
        raise HTTPException(status_code=404, detail="Chat conversation not found.")
    return {
        **serialize_chat_conversation(conversation),
        "messages": [serialize_chat_message(message) for message in conversation.messages],
    }


def delete_chat_conversation(db: Session, conversation_id: int) -> None:
    conversation = db.get(AiConversation, conversation_id)
    if conversation is None or conversation.mode != "chat":
        raise HTTPException(status_code=404, detail="Chat conversation not found.")
    db.delete(conversation)
    db.commit()


def save_chat_exchange(
    db: Session,
    user_message: str,
    assistant_message: str,
    conversation_id: int | None = None,
) -> dict[str, Any]:
    conversation = db.get(AiConversation, conversation_id) if conversation_id else None
    if conversation_id and (conversation is None or conversation.mode != "chat"):
        raise HTTPException(status_code=404, detail="Chat conversation not found.")
    if conversation is None:
        conversation = AiConversation(mode="chat", title=_chat_title_from_message(user_message))
        db.add(conversation)
        db.flush()
    elif len(conversation.messages) <= 1 and conversation.title == "New chat":
        conversation.title = _chat_title_from_message(user_message)
    conversation.updated_at = now_local()
    db.add(AiMessage(conversation_id=conversation.id, role="user", content=user_message))
    db.add(AiMessage(conversation_id=conversation.id, role="assistant", content=assistant_message))
    db.commit()
    db.refresh(conversation)
    return get_chat_conversation_payload(db, conversation.id)


def apply_plan_draft(db: Session, draft_id: int) -> dict[str, int]:
    draft = db.get(AiDraft, draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found.")
    if draft.kind != "plan":
        raise HTTPException(status_code=400, detail="Only planning drafts can be applied.")
    if draft.status != "pending":
        raise HTTPException(status_code=400, detail="Draft has already been handled.")

    payload = json.loads(draft.payload)
    created_tasks = 0
    created_events = 0
    for item in payload.get("tasks", []) or []:
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        task = Task(
            title=title,
            subject_id=item.get("subject_id"),
            priority=item.get("priority") if item.get("priority") in {"low", "medium", "high"} else "medium",
            status="todo",
            estimated_minutes=item.get("estimated_minutes"),
            notes=item.get("notes") or item.get("reason"),
        )
        db.add(task)
        created_tasks += 1
    for item in payload.get("schedule_events", []) or payload.get("events", []) or []:
        title = str(item.get("title") or "").strip()
        start_at = item.get("start_at")
        end_at = item.get("end_at")
        if not title or not start_at or not end_at:
            continue
        try:
            event = ScheduleEvent(
                title=title,
                subject_id=item.get("subject_id"),
                task_id=item.get("task_id"),
                start_at=_parse_dt(start_at),
                end_at=_parse_dt(end_at),
                source="ai",
                notes=item.get("notes") or item.get("reason"),
            )
        except ValueError:
            continue
        db.add(event)
        created_events += 1
    draft.status = "applied"
    draft.applied_at = now_local()
    db.commit()
    return {"created_tasks": created_tasks, "created_events": created_events}


def _parse_dt(value: str):
    return datetime.fromisoformat(value)


def _coerce_quote_payload(payload: dict[str, Any]) -> dict[str, str]:
    quote = str(payload.get("quote") or "").strip()
    author = str(payload.get("author") or "").strip()
    source = str(payload.get("source") or "").strip()
    if not quote or not author:
        raise HTTPException(status_code=502, detail="The model did not return a usable daily quote.")
    return {
        "quote": quote,
        "author": author,
        "source": source or "Unknown source",
    }


async def get_daily_quote(db: Session, target_date: date | None = None) -> dict[str, Any]:
    target_date = target_date or now_local().date()
    cached_date = get_setting(db, "daily_quote_date", "")
    cached_payload = get_setting(db, "daily_quote_payload", "")
    if cached_date == target_date.isoformat() and cached_payload:
        try:
            cached = json.loads(cached_payload)
        except json.JSONDecodeError:
            cached = None
        if isinstance(cached, dict) and cached.get("quote") and cached.get("author"):
            return {**cached, "cached": True}

    payload, _ = await call_llm(
        db,
        DAILY_QUOTE_SYSTEM_PROMPT,
        {"date": target_date.isoformat(), "locale": "en"},
        instruction="Return one concise, uplifting English quote suitable for a study dashboard.",
    )
    quote_payload = _coerce_quote_payload(payload)
    set_setting(db, "daily_quote_date", target_date.isoformat())
    set_setting(db, "daily_quote_payload", json.dumps(quote_payload, ensure_ascii=False))
    return {**quote_payload, "cached": False}


PLAN_SYSTEM_PROMPT = """You are a study planning assistant. Return strict JSON only.
The JSON object must use this shape:
{
  "summary": "short planning summary",
  "tasks": [{"title": "...", "subject_id": 1, "priority": "medium", "estimated_minutes": 45, "notes": "...", "reason": "..."}],
  "schedule_events": [{"title": "...", "subject_id": 1, "task_id": null, "start_at": "YYYY-MM-DDTHH:MM:SS", "end_at": "YYYY-MM-DDTHH:MM:SS", "notes": "...", "reason": "..."}],
  "risks": ["..."]
}
Always return a complete replacement draft, not a partial patch.
Always include both "tasks" and "schedule_events" arrays, even when they are empty.
Use local-time ISO datetimes and only reference subject/task ids present in the input.
The input snapshot includes a "planning_mode" field:
- if "task_only", put every actionable suggestion into "tasks" and leave "schedule_events" empty.
- if "task_and_schedule", you may create both tasks and calendar blocks when that helps."""


ANALYZE_SYSTEM_PROMPT = """You are a study analytics assistant. Return strict JSON only.
The JSON object must use this shape:
{
  "summary": "short data-backed summary",
  "patterns": ["..."],
  "problems": ["..."],
  "goal_progress": ["..."],
  "recommendations": ["clear action ..."],
  "risks": ["..."]
}
Base every claim on the provided local study data."""


DAILY_QUOTE_SYSTEM_PROMPT = """You are a quote assistant. Return strict JSON only.
The JSON object must use this shape:
{
  "quote": "One short inspiring English quote.",
  "author": "Person name",
  "source": "Speech, book, interview, or work title"
}
Return a real famous quote with accurate attribution.
Keep the quote concise and suitable for a study dashboard."""
