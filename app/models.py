from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_local() -> datetime:
    return datetime.now().replace(microsecond=0)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    subjects: Mapped[list["Subject"]] = relationship(back_populates="user")
    tasks: Mapped[list["Task"]] = relationship(back_populates="user")
    schedule_events: Mapped[list["ScheduleEvent"]] = relationship(back_populates="user")
    study_sessions: Mapped[list["StudySession"]] = relationship(back_populates="user")
    timer_states: Mapped[list["TimerState"]] = relationship(back_populates="user")
    ai_drafts: Mapped[list["AiDraft"]] = relationship(back_populates="user")
    ai_conversations: Mapped[list["AiConversation"]] = relationship(back_populates="user")
    user_settings: Mapped[list["UserSetting"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned_rooms: Mapped[list["StudyRoom"]] = relationship(back_populates="owner")
    room_memberships: Mapped[list["StudyRoomMember"]] = relationship(back_populates="user")


class Subject(Base):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_subjects_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="#5E8CFF", nullable=False)
    daily_goal_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    weekly_goal_minutes: Mapped[int] = mapped_column(Integer, default=420, nullable=False)
    monthly_goal_minutes: Mapped[int] = mapped_column(Integer, default=1800, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    user: Mapped[User] = relationship(back_populates="subjects")
    tasks: Mapped[list["Task"]] = relationship(back_populates="subject")
    sessions: Mapped[list["StudySession"]] = relationship(back_populates="subject")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="todo", nullable=False)
    priority: Mapped[str] = mapped_column(String(32), default="medium", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    user: Mapped[User] = relationship(back_populates="tasks")
    subject: Mapped[Subject | None] = relationship(back_populates="tasks")
    sessions: Mapped[list["StudySession"]] = relationship(back_populates="task")


class ScheduleEvent(Base):
    __tablename__ = "schedule_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    user: Mapped[User] = relationship(back_populates="schedule_events")


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    schedule_event_id: Mapped[int | None] = mapped_column(ForeignKey("schedule_events.id"), nullable=True)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    focus_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    paused_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stop_reason: Mapped[str] = mapped_column(String(64), default="manual_stop", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)

    user: Mapped[User] = relationship(back_populates="study_sessions")
    subject: Mapped[Subject] = relationship(back_populates="sessions")
    task: Mapped[Task | None] = relationship(back_populates="sessions")


class TimerState(Base):
    __tablename__ = "timer_states"
    __table_args__ = (UniqueConstraint("user_id", name="uq_timer_states_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    schedule_event_id: Mapped[int | None] = mapped_column(ForeignKey("schedule_events.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    accumulated_pause_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    countdown_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    countdown_end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pomodoro_phase: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pomodoro_round: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    pomodoro_total_rounds: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    focus_minutes: Mapped[int] = mapped_column(Integer, default=25, nullable=False)
    short_break_minutes: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    long_break_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    user: Mapped[User] = relationship(back_populates="timer_states")


class AiDraft(Base):
    __tablename__ = "ai_drafts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    input_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship(back_populates="ai_drafts")


class AiConversation(Base):
    __tablename__ = "ai_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(32), default="chat", nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    user: Mapped[User] = relationship(back_populates="ai_conversations")
    messages: Mapped[list["AiMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AiMessage.created_at.asc()",
    )


class AiMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("ai_conversations.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)

    conversation: Mapped[AiConversation] = relationship(back_populates="messages")


class UserSetting(Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_settings_user_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    user: Mapped[User] = relationship(back_populates="user_settings")


class StudyRoom(Base):
    __tablename__ = "study_rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    join_code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    member_limit: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Shanghai", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)

    owner: Mapped[User] = relationship(back_populates="owned_rooms")
    members: Mapped[list["StudyRoomMember"]] = relationship(back_populates="room", cascade="all, delete-orphan")


class StudyRoomMember(Base):
    __tablename__ = "study_room_members"
    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_study_room_members_room_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("study_rooms.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), default="member", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, nullable=False)

    room: Mapped[StudyRoom] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="room_memberships")


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_local, onupdate=now_local, nullable=False)
