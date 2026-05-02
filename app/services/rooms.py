from __future__ import annotations

import secrets
import string
from datetime import datetime, time
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import StudyRoom, StudyRoomMember, StudySession, Task, TimerState, User, now_local
from app.services.auth import user_label


ROOM_JOIN_CODE_LENGTH = 8
ROOM_DEFAULT_LIMIT = 20


def _today_bounds_for_timezone(timezone_name: str) -> tuple[datetime, datetime, str]:
    tz = ZoneInfo(timezone_name or "Asia/Shanghai")
    today = datetime.now(tz).date()
    return datetime.combine(today, time.min), datetime.combine(today, time.max), today.isoformat()


def _task_anchor_for_today(task: Task) -> datetime:
    if task.status == "done" and task.completed_at:
        return task.completed_at
    if task.due_at:
        return task.due_at
    return task.created_at


def _generate_join_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(ROOM_JOIN_CODE_LENGTH))


def generate_unique_join_code(db: Session) -> str:
    for _ in range(50):
        code = _generate_join_code()
        exists = db.query(StudyRoom.id).filter(StudyRoom.join_code == code).first()
        if exists is None:
            return code
    raise HTTPException(status_code=500, detail="Unable to allocate a unique room code.")


def _active_member_query(db: Session, room_id: int):
    return db.query(StudyRoomMember).filter(
        StudyRoomMember.room_id == room_id,
        StudyRoomMember.status == "active",
    )


def touch_room(room: StudyRoom) -> None:
    room.updated_at = now_local()


def create_room(db: Session, owner: User, name: str, member_limit: int = ROOM_DEFAULT_LIMIT, timezone: str = "Asia/Shanghai") -> StudyRoom:
    room = StudyRoom(
        owner_user_id=owner.id,
        name=name.strip(),
        join_code=generate_unique_join_code(db),
        member_limit=max(2, min(int(member_limit or ROOM_DEFAULT_LIMIT), ROOM_DEFAULT_LIMIT)),
        timezone=timezone or "Asia/Shanghai",
        status="active",
    )
    db.add(room)
    db.flush()
    db.add(
        StudyRoomMember(
            room_id=room.id,
            user_id=owner.id,
            role="owner",
            status="active",
        )
    )
    db.commit()
    db.refresh(room)
    return room


def list_user_rooms(db: Session, user_id: int) -> list[dict]:
    memberships = (
        db.query(StudyRoomMember)
        .options(joinedload(StudyRoomMember.room))
        .filter(StudyRoomMember.user_id == user_id, StudyRoomMember.status != "kicked")
        .order_by(StudyRoomMember.joined_at.asc())
        .all()
    )
    results = []
    for membership in memberships:
        room = membership.room
        active_count = _active_member_query(db, room.id).count()
        results.append(
            {
                "room_id": room.id,
                "name": room.name,
                "join_code": room.join_code,
                "status": room.status,
                "timezone": room.timezone,
                "member_limit": room.member_limit,
                "member_count": active_count,
                "role": membership.role,
                "membership_status": membership.status,
                "joined_at": membership.joined_at.isoformat(),
                "updated_at": room.updated_at.isoformat(),
            }
        )
    return results


def get_room_membership(db: Session, room_id: int, user_id: int, require_active: bool = True) -> StudyRoomMember:
    query = db.query(StudyRoomMember).filter(
        StudyRoomMember.room_id == room_id,
        StudyRoomMember.user_id == user_id,
    )
    if require_active:
        query = query.filter(StudyRoomMember.status == "active")
    membership = query.first()
    if membership is None:
        raise HTTPException(status_code=404, detail="Room membership not found.")
    return membership


def get_room_for_member(db: Session, room_id: int, user_id: int, require_active: bool = True) -> StudyRoom:
    membership = get_room_membership(db, room_id, user_id, require_active=require_active)
    room = db.get(StudyRoom, membership.room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    return room


def join_room_by_code(db: Session, user: User, join_code: str) -> StudyRoom:
    code = str(join_code or "").strip().upper()
    room = db.query(StudyRoom).filter(StudyRoom.join_code == code).first()
    if room is None:
        raise HTTPException(status_code=404, detail="Invalid room code.")
    if room.status != "active":
        raise HTTPException(status_code=400, detail="This room is closed.")

    membership = (
        db.query(StudyRoomMember)
        .filter(StudyRoomMember.room_id == room.id, StudyRoomMember.user_id == user.id)
        .first()
    )
    if membership is not None:
        if membership.status == "kicked":
            raise HTTPException(status_code=403, detail="You were removed from this room.")
        if membership.status == "active":
            raise HTTPException(status_code=400, detail="You are already in this room.")
        membership.status = "active"
        membership.joined_at = now_local()
        touch_room(room)
        db.commit()
        db.refresh(room)
        return room

    active_count = _active_member_query(db, room.id).count()
    if active_count >= room.member_limit:
        raise HTTPException(status_code=400, detail="This room is full.")

    db.add(
        StudyRoomMember(
            room_id=room.id,
            user_id=user.id,
            role="member",
            status="active",
        )
    )
    touch_room(room)
    db.commit()
    db.refresh(room)
    return room


def _room_member_users(db: Session, room_id: int) -> list[tuple[StudyRoomMember, User]]:
    rows = (
        db.query(StudyRoomMember, User)
        .join(User, User.id == StudyRoomMember.user_id)
        .filter(StudyRoomMember.room_id == room_id, StudyRoomMember.status == "active")
        .order_by(StudyRoomMember.joined_at.asc(), StudyRoomMember.id.asc())
        .all()
    )
    return rows


def _task_lists_for_members(db: Session, member_ids: list[int], day_start: datetime, day_end: datetime) -> dict[int, dict]:
    tasks = db.query(Task).filter(Task.user_id.in_(member_ids)).all() if member_ids else []
    summary: dict[int, dict] = {
        user_id: {
            "done_count": 0,
            "unfinished_count": 0,
            "late_done_count": 0,
            "completed_titles": [],
            "in_progress_titles": [],
            "completed_total": 0,
            "in_progress_total": 0,
        }
        for user_id in member_ids
    }
    for task in tasks:
        bucket = summary.setdefault(
            task.user_id,
            {
                "done_count": 0,
                "unfinished_count": 0,
                "late_done_count": 0,
                "completed_titles": [],
                "in_progress_titles": [],
                "completed_total": 0,
                "in_progress_total": 0,
            },
        )
        anchor = _task_anchor_for_today(task)
        if not (day_start <= anchor <= day_end):
            if task.status == "in_progress":
                if task.updated_at >= day_start and task.updated_at <= day_end:
                    bucket["in_progress_titles"].append(task.title)
                    bucket["in_progress_total"] += 1
            continue

        if task.status == "done" and task.completed_at:
            bucket["done_count"] += 1
            bucket["completed_total"] += 1
            bucket["completed_titles"].append(task.title)
            if task.due_at and task.completed_at > task.due_at:
                bucket["late_done_count"] += 1
        else:
            bucket["unfinished_count"] += 1
            if task.status == "in_progress":
                bucket["in_progress_titles"].append(task.title)
                bucket["in_progress_total"] += 1

    for bucket in summary.values():
        bucket["completed_titles"] = bucket["completed_titles"][:5]
        bucket["in_progress_titles"] = bucket["in_progress_titles"][:5]
    return summary


def get_room_snapshot(db: Session, room_id: int, user_id: int) -> dict:
    room = get_room_for_member(db, room_id, user_id, require_active=True)
    day_start, day_end, room_today = _today_bounds_for_timezone(room.timezone)
    member_rows = _room_member_users(db, room.id)
    member_ids = [user.id for _, user in member_rows]

    focus_totals = {
        row[0]: int(row[1] or 0)
        for row in (
            db.query(StudySession.user_id, func.coalesce(func.sum(StudySession.focus_seconds), 0))
            .filter(
                StudySession.user_id.in_(member_ids),
                StudySession.started_at <= day_end,
                StudySession.ended_at >= day_start,
            )
            .group_by(StudySession.user_id)
            .all()
        )
    } if member_ids else {}
    active_timer_users = {
        row[0]
        for row in db.query(TimerState.user_id).filter(TimerState.user_id.in_(member_ids)).all()
    } if member_ids else set()
    task_summary = _task_lists_for_members(db, member_ids, day_start, day_end)

    members = []
    for membership, member_user in member_rows:
        stats = task_summary.get(member_user.id, {})
        completed_titles = stats.get("completed_titles", [])
        in_progress_titles = stats.get("in_progress_titles", [])
        member_payload = {
            "user_id": member_user.id,
            "label": user_label(member_user),
            "email": member_user.email,
            "role": membership.role,
            "joined_at": membership.joined_at.isoformat(),
            "focus_seconds_today": int(focus_totals.get(member_user.id, 0)),
            "done_count_today": int(stats.get("done_count", 0)),
            "unfinished_count_today": int(stats.get("unfinished_count", 0)),
            "late_done_count_today": int(stats.get("late_done_count", 0)),
            "completed_titles_today": completed_titles,
            "completed_titles_more": max(int(stats.get("completed_total", 0)) - len(completed_titles), 0),
            "in_progress_titles_today": in_progress_titles,
            "in_progress_titles_more": max(int(stats.get("in_progress_total", 0)) - len(in_progress_titles), 0),
            "is_focusing": member_user.id in active_timer_users,
        }
        members.append(member_payload)

    members.sort(
        key=lambda item: (
            -item["focus_seconds_today"],
            -item["done_count_today"],
            item["late_done_count_today"],
            next(
                membership.joined_at
                for membership, member_user in member_rows
                if member_user.id == item["user_id"]
            ),
        )
    )
    for index, item in enumerate(members, start=1):
        item["rank"] = index

    return {
        "room": {
            "id": room.id,
            "name": room.name,
            "join_code": room.join_code,
            "status": room.status,
            "member_limit": room.member_limit,
            "timezone": room.timezone,
            "today": room_today,
            "owner_user_id": room.owner_user_id,
            "updated_at": room.updated_at.isoformat(),
            "is_owner": room.owner_user_id == user_id,
        },
        "member_count": len(member_rows),
        "active_focus_count": sum(1 for item in members if item["is_focusing"]),
        "members": members,
    }


def leave_room(db: Session, room_id: int, user_id: int) -> None:
    membership = get_room_membership(db, room_id, user_id, require_active=True)
    room = db.get(StudyRoom, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    if membership.role == "owner":
        raise HTTPException(status_code=400, detail="The owner cannot leave an active room. Close the room instead.")
    membership.status = "left"
    touch_room(room)
    db.commit()


def reset_room_code(db: Session, room_id: int, owner_user_id: int) -> StudyRoom:
    room = get_room_for_member(db, room_id, owner_user_id, require_active=True)
    membership = get_room_membership(db, room_id, owner_user_id, require_active=True)
    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the room owner can reset the room code.")
    room.join_code = generate_unique_join_code(db)
    touch_room(room)
    db.commit()
    db.refresh(room)
    return room


def close_room(db: Session, room_id: int, owner_user_id: int) -> StudyRoom:
    room = get_room_for_member(db, room_id, owner_user_id, require_active=True)
    membership = get_room_membership(db, room_id, owner_user_id, require_active=True)
    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the room owner can close the room.")
    room.status = "closed"
    touch_room(room)
    db.commit()
    db.refresh(room)
    return room


def kick_member(db: Session, room_id: int, owner_user_id: int, member_user_id: int) -> None:
    room = get_room_for_member(db, room_id, owner_user_id, require_active=True)
    owner_membership = get_room_membership(db, room_id, owner_user_id, require_active=True)
    if owner_membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the room owner can remove members.")
    if member_user_id == owner_user_id:
        raise HTTPException(status_code=400, detail="The room owner cannot remove themself.")
    membership = get_room_membership(db, room_id, member_user_id, require_active=True)
    membership.status = "kicked"
    touch_room(room)
    db.commit()


def room_detail_payload(db: Session, room_id: int, user_id: int) -> dict:
    room = get_room_for_member(db, room_id, user_id, require_active=False)
    active_members = _active_member_query(db, room.id).count()
    membership = get_room_membership(db, room_id, user_id, require_active=False)
    if membership.status == "kicked":
        raise HTTPException(status_code=403, detail="You no longer have access to this room.")
    if membership.status != "active" and room.status != "closed":
        raise HTTPException(status_code=403, detail="This room is no longer active for your account.")
    return {
        "id": room.id,
        "name": room.name,
        "join_code": room.join_code,
        "status": room.status,
        "member_limit": room.member_limit,
        "member_count": active_members,
        "timezone": room.timezone,
        "owner_user_id": room.owner_user_id,
        "updated_at": room.updated_at.isoformat(),
        "role": membership.role,
        "membership_status": membership.status,
        "is_owner": membership.role == "owner",
    }
