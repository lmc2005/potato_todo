from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas import AiChatSendIn, AiRequestIn

from ...core.deps import get_current_user
from ...legacy_bridge import User, get_db
from .domain import item_payload, list_payload
from .service import (
    apply_draft,
    create_analysis_draft,
    create_plan_draft,
    list_chat_sessions,
    list_drafts,
    load_chat_session,
    load_daily_quote,
    remove_chat_session,
    send_chat_message,
)


router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/plan")
async def plan(payload: AiRequestIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(await create_plan_draft(db, user.id, payload))


@router.post("/analyze")
async def analyze(payload: AiRequestIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(await create_analysis_draft(db, user.id, payload))


@router.get("/chat/sessions")
def sessions(db=Depends(get_db), user: User = Depends(get_current_user)):
    return list_payload(list_chat_sessions(db, user.id))


@router.get("/chat/sessions/{conversation_id}")
def session(conversation_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(load_chat_session(db, user.id, conversation_id))


@router.delete("/chat/sessions/{conversation_id}")
def delete_session(conversation_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    return remove_chat_session(db, user.id, conversation_id)


@router.post("/chat/send")
async def send(payload: AiChatSendIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(await send_chat_message(db, user.id, payload))


@router.get("/daily-quote")
async def daily_quote(db=Depends(get_db)):
    return item_payload(await load_daily_quote(db))


@router.get("/drafts")
def drafts(db=Depends(get_db), user: User = Depends(get_current_user)):
    return list_payload(list_drafts(db, user.id))


@router.post("/drafts/{draft_id}/apply")
def apply(draft_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(apply_draft(db, user.id, draft_id))
