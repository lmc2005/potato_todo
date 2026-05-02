from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.schemas import RoomCreateIn, RoomJoinIn

from ...core.deps import get_current_user, get_current_user_for_stream
from ...core.room_hub import publish_room_event
from ...legacy_bridge import User, get_db, get_room_for_member, now_local
from .domain import item_payload, list_payload
from .service import close_room_item, create_room_item, join_room_item, kick_room_member_item, leave_room_item, list_rooms, reset_room_code_item, room_detail_item, room_snapshot_item


router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("")
def rooms(db=Depends(get_db), user: User = Depends(get_current_user)):
    return list_payload(list_rooms(db, user.id))


@router.post("")
def create(payload: RoomCreateIn, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    room = create_room_item(db, user, payload.name, payload.member_limit, payload.timezone)
    publish_room_event(request.app, room["id"], user.id, "room_created")
    return item_payload(room)


@router.post("/join")
def join(payload: RoomJoinIn, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    room = join_room_item(db, user, payload.join_code)
    publish_room_event(request.app, room["id"], user.id, "room_joined")
    return item_payload(room)


@router.get("/{room_id}")
def detail(room_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(room_detail_item(db, room_id, user.id))


@router.get("/{room_id}/snapshot")
def snapshot(room_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(room_snapshot_item(db, room_id, user.id))


@router.get("/{room_id}/stream")
async def stream(room_id: int, request: Request, db=Depends(get_db), user: User = Depends(get_current_user_for_stream)):
    get_room_for_member(db, room_id, user.id, require_active=True)
    queue = request.app.state.room_hub.subscribe(room_id)

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
            request.app.state.room_hub.unsubscribe(room_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{room_id}/leave")
def leave(room_id: int, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = leave_room_item(db, room_id, user.id)
    publish_room_event(request.app, room_id, user.id, "room_left")
    return result


@router.post("/{room_id}/reset-code")
def reset_code(room_id: int, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    room = reset_room_code_item(db, room_id, user.id)
    publish_room_event(request.app, room["id"], user.id, "room_code_reset")
    return item_payload(room)


@router.post("/{room_id}/close")
def close(room_id: int, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    room = close_room_item(db, room_id, user.id)
    publish_room_event(request.app, room["id"], user.id, "room_closed")
    return item_payload(room)


@router.post("/{room_id}/members/{member_user_id}/kick")
def kick(room_id: int, member_user_id: int, request: Request, db=Depends(get_db), user: User = Depends(get_current_user)):
    result = kick_room_member_item(db, room_id, user.id, member_user_id)
    publish_room_event(request.app, room_id, member_user_id, "room_member_kicked")
    return result
