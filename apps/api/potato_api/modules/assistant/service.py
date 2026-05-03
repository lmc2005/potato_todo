from __future__ import annotations

import json
from datetime import date, timedelta
from collections.abc import AsyncIterator

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.schemas import AiChatSendIn, AiRequestIn

from ...legacy_bridge import (
    ANALYZE_SYSTEM_PROMPT,
    PLAN_SYSTEM_PROMPT,
    AiConversation,
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
    now_local,
    planning_requests_schedule,
    save_chat_exchange,
    stream_llm_text,
)


def ai_dates(payload: AiRequestIn) -> tuple[date, date]:
    today = now_local().date()
    start = payload.start or today - timedelta(days=6)
    end = payload.end or today
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")
    return start, end


async def create_plan_draft(db: Session, user_id: int, payload: AiRequestIn) -> dict:
    ensure_ai_enabled(db)
    start, end = ai_dates(payload)
    snapshot = build_snapshot(db, user_id, start, end)
    instruction = payload.instruction or "Create a practical study plan from the provided tasks, schedule, goals, and study history."
    schedule_requested = planning_requests_schedule(instruction, payload.conversation)
    llm_snapshot = {
        **snapshot,
        "instruction": instruction,
        "conversation": payload.conversation or [],
        "planning_mode": "task_and_schedule" if schedule_requested else "task_only",
    }
    plan_payload, raw = await call_llm(db, user_id, PLAN_SYSTEM_PROMPT, llm_snapshot, instruction=instruction, conversation=payload.conversation)
    normalized = normalize_plan_payload(plan_payload, schedule_requested=schedule_requested)
    draft = create_draft(db, user_id, "plan", llm_snapshot, normalized, raw)
    return draft_to_payload(draft)


async def create_analysis_draft(db: Session, user_id: int, payload: AiRequestIn) -> dict:
    ensure_ai_enabled(db)
    start, end = ai_dates(payload)
    snapshot = build_snapshot(db, user_id, start, end)
    instruction = payload.instruction or "Analyze study habits and provide concise, actionable advice."
    llm_snapshot = {**snapshot, "instruction": instruction}
    analysis_payload, raw = await call_llm(db, user_id, ANALYZE_SYSTEM_PROMPT, snapshot, instruction=instruction)
    draft = create_draft(db, user_id, "analysis", llm_snapshot, analysis_payload, raw)
    return draft_to_payload(draft)


def list_chat_sessions(db: Session, user_id: int) -> list[dict]:
    ensure_ai_enabled(db)
    return list_chat_conversations(db, user_id)


def load_chat_session(db: Session, user_id: int, conversation_id: int) -> dict:
    ensure_ai_enabled(db)
    return get_chat_conversation_payload(db, user_id, conversation_id)


def remove_chat_session(db: Session, user_id: int, conversation_id: int) -> dict:
    ensure_ai_enabled(db)
    delete_chat_conversation(db, user_id, conversation_id)
    return {"deleted": True}


async def send_chat_message(db: Session, user_id: int, payload: AiChatSendIn) -> dict:
    ensure_ai_enabled(db)
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")
    conversation_turns: list[dict[str, str]] = []
    if payload.conversation_id is not None:
        conversation = db.query(AiConversation).filter(AiConversation.id == payload.conversation_id, AiConversation.user_id == user_id).first()
        if conversation is None or conversation.mode != "chat":
            raise HTTPException(status_code=404, detail="Chat conversation not found.")
        conversation_turns = [
            {"role": item.role, "content": item.content}
            for item in conversation.messages
            if item.role in {"user", "assistant"} and item.content
        ]
    assistant_message = await call_llm_text(db, user_id, None, message, conversation=conversation_turns)
    conversation_payload = save_chat_exchange(db, user_id, message, assistant_message, conversation_id=payload.conversation_id)
    return {
        "conversation": conversation_payload,
        "assistant_message": assistant_message,
        "sessions": list_chat_conversations(db, user_id),
    }


async def stream_chat_message(db: Session, user_id: int, payload: AiChatSendIn) -> AsyncIterator[str]:
    ensure_ai_enabled(db)
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    conversation_turns: list[dict[str, str]] = []
    if payload.conversation_id is not None:
        conversation = db.query(AiConversation).filter(AiConversation.id == payload.conversation_id, AiConversation.user_id == user_id).first()
        if conversation is None or conversation.mode != "chat":
            raise HTTPException(status_code=404, detail="Chat conversation not found.")
        conversation_turns = [
            {"role": item.role, "content": item.content}
            for item in conversation.messages
            if item.role in {"user", "assistant"} and item.content
        ]

    yield json.dumps({"type": "thinking"}, ensure_ascii=False) + "\n"

    assistant_parts: list[str] = []
    try:
        async for chunk in stream_llm_text(db, user_id, None, message, conversation=conversation_turns):
            assistant_parts.append(chunk)
            yield json.dumps({"type": "chunk", "content": chunk}, ensure_ascii=False) + "\n"
    except HTTPException as exc:
        yield json.dumps({"type": "error", "detail": exc.detail}, ensure_ascii=False) + "\n"
        return
    except Exception:
        yield json.dumps({"type": "error", "detail": "Unexpected streaming error."}, ensure_ascii=False) + "\n"
        return

    assistant_message = "".join(assistant_parts).strip()
    if not assistant_message:
        yield json.dumps({"type": "error", "detail": "The model returned an empty response."}, ensure_ascii=False) + "\n"
        return

    conversation_payload = save_chat_exchange(db, user_id, message, assistant_message, conversation_id=payload.conversation_id)
    yield json.dumps(
        {
            "type": "done",
            "item": {
                "conversation": conversation_payload,
                "assistant_message": assistant_message,
                "sessions": list_chat_conversations(db, user_id),
            },
        },
        ensure_ascii=False,
    ) + "\n"


async def load_daily_quote(db: Session) -> dict:
    try:
        return await get_daily_quote(db, now_local().date())
    except HTTPException as exc:
        if exc.status_code not in {400, 503}:
            raise
    return {
        "quote": "Stay hungry, stay foolish.",
        "author": "Steve Jobs",
        "source": "Stanford Commencement Address",
        "cached": False,
        "fallback": True,
    }


def list_drafts(db: Session, user_id: int) -> list[dict]:
    from app.models import AiDraft

    drafts = db.query(AiDraft).filter(AiDraft.user_id == user_id).order_by(AiDraft.created_at.desc()).limit(20).all()
    return [draft_to_payload(draft) for draft in drafts]


def apply_draft(db: Session, user_id: int, draft_id: int) -> dict:
    return apply_plan_draft(db, user_id, draft_id)
