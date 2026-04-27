from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import AiDraft, ScheduleEvent, Subject, Task, now_local
from app.services.settings import get_setting
from app.services.stats import compute_stats


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


async def call_llm(db: Session, system_prompt: str, user_payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    base_url = (get_setting(db, "llm_base_url", "") or "").rstrip("/")
    api_key = get_setting(db, "llm_api_key", "") or ""
    model = get_setting(db, "llm_model", "gpt-4o-mini") or "gpt-4o-mini"
    if not base_url or not api_key:
        raise HTTPException(status_code=400, detail="LLM base URL and API key are required in Settings.")
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, headers=headers, json=body)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {response.text[:500]}")
    data = response.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        raise HTTPException(status_code=502, detail="The model returned an empty response.")
    return _extract_json(content), content


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


PLAN_SYSTEM_PROMPT = """You are a study planning assistant. Return strict JSON only.
The JSON object must use this shape:
{
  "summary": "short planning summary",
  "tasks": [{"title": "...", "subject_id": 1, "priority": "medium", "estimated_minutes": 45, "notes": "...", "reason": "..."}],
  "schedule_events": [{"title": "...", "subject_id": 1, "task_id": null, "start_at": "YYYY-MM-DDTHH:MM:SS", "end_at": "YYYY-MM-DDTHH:MM:SS", "notes": "...", "reason": "..."}],
  "risks": ["..."]
}
Use local-time ISO datetimes and only reference subject/task ids present in the input."""


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
