from __future__ import annotations

from ...legacy_bridge import close_room, create_room, get_room_for_member, get_room_snapshot, join_room_by_code, kick_member, leave_room, list_user_rooms, reset_room_code, room_detail_payload


def list_rooms(db, user_id: int) -> list[dict]:
    return list_user_rooms(db, user_id)


def create_room_item(db, user, name: str, member_limit: int, timezone: str) -> dict:
    room = create_room(db, user, name, member_limit=member_limit, timezone=timezone)
    return room_detail_payload(db, room.id, user.id)


def join_room_item(db, user, join_code: str) -> dict:
    room = join_room_by_code(db, user, join_code)
    return room_detail_payload(db, room.id, user.id)


def room_detail_item(db, room_id: int, user_id: int) -> dict:
    return room_detail_payload(db, room_id, user_id)


def room_snapshot_item(db, room_id: int, user_id: int) -> dict:
    return get_room_snapshot(db, room_id, user_id)


def leave_room_item(db, room_id: int, user_id: int) -> dict:
    leave_room(db, room_id, user_id)
    return {"left": True}


def reset_room_code_item(db, room_id: int, user_id: int) -> dict:
    room = reset_room_code(db, room_id, user_id)
    return room_detail_payload(db, room.id, user_id)


def close_room_item(db, room_id: int, user_id: int) -> dict:
    room = close_room(db, room_id, user_id)
    return room_detail_payload(db, room.id, user_id)


def kick_room_member_item(db, room_id: int, owner_user_id: int, member_user_id: int) -> dict:
    kick_member(db, room_id, owner_user_id, member_user_id)
    return {"kicked": True}
