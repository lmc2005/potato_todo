from __future__ import annotations

import asyncio
import threading
from typing import Any

from app.models import StudyRoomMember, now_local
from sqlalchemy.orm import Session


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


def publish_room_event(app, room_id: int, changed_user_id: int | None, reason: str) -> None:
    hub: RoomEventHub | None = getattr(app.state, "room_hub", None)
    if hub is not None:
        hub.publish(room_id, changed_user_id, reason)


def user_room_ids(db: Session, user_id: int) -> list[int]:
    return [
        room_id
        for (room_id,) in db.query(StudyRoomMember.room_id)
        .filter(StudyRoomMember.user_id == user_id, StudyRoomMember.status == "active")
        .all()
    ]


def publish_user_room_updates(app, db: Session, user_id: int, reason: str) -> None:
    for room_id in user_room_ids(db, user_id):
        publish_room_event(app, room_id, user_id, reason)
