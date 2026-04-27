from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class SubjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    color: str = "#5E8CFF"
    daily_goal_minutes: int = Field(default=60, ge=0)
    weekly_goal_minutes: int = Field(default=420, ge=0)
    monthly_goal_minutes: int = Field(default=1800, ge=0)
    archived: bool = False


class SubjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    color: str | None = None
    daily_goal_minutes: int | None = Field(default=None, ge=0)
    weekly_goal_minutes: int | None = Field(default=None, ge=0)
    monthly_goal_minutes: int | None = Field(default=None, ge=0)
    archived: bool | None = None


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    subject_id: int | None = None
    status: Literal["todo", "in_progress", "done", "undone"] = "todo"
    priority: Literal["low", "medium", "high"] = "medium"
    due_at: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    subject_id: int | None = None
    status: Literal["todo", "in_progress", "done", "undone"] | None = None
    priority: Literal["low", "medium", "high"] | None = None
    due_at: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None
    completed_at: datetime | None = None


class ScheduleEventIn(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    subject_id: int | None = None
    task_id: int | None = None
    start_at: datetime
    end_at: datetime
    source: Literal["manual", "ai"] = "manual"
    notes: str | None = None

    @field_validator("end_at")
    @classmethod
    def end_after_start(cls, value: datetime, info):
        start_at = info.data.get("start_at")
        if start_at and value <= start_at:
            raise ValueError("End time must be after start time.")
        return value


class ScheduleEventPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    subject_id: int | None = None
    task_id: int | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    source: Literal["manual", "ai"] | None = None
    notes: str | None = None


class TimerStartIn(BaseModel):
    mode: Literal["count_up", "count_down"]
    subject_id: int
    task_id: int | None = None
    schedule_event_id: int | None = None
    duration_minutes: int | None = Field(default=None, ge=1)


class TimerStopIn(BaseModel):
    adjusted_focus_minutes: int | None = Field(default=None, ge=1, le=1440)


class PomodoroStartIn(BaseModel):
    subject_id: int
    task_id: int | None = None
    schedule_event_id: int | None = None
    focus_minutes: int = Field(default=25, ge=1)
    short_break_minutes: int = Field(default=5, ge=1)
    long_break_minutes: int = Field(default=15, ge=1)
    total_rounds: int = Field(default=4, ge=1, le=12)


class LlmSettingsIn(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    reasoning_effort: str | None = None


class PomodoroSettingsIn(BaseModel):
    focus_minutes: int = Field(default=25, ge=1)
    short_break_minutes: int = Field(default=5, ge=1)
    long_break_minutes: int = Field(default=15, ge=1)
    total_rounds: int = Field(default=4, ge=1, le=12)


class ClearDataIn(BaseModel):
    confirm: bool = False


class AiRequestIn(BaseModel):
    start: date | None = None
    end: date | None = None
    instruction: str | None = None
    conversation: list[dict[str, str]] | None = None


class AiChatSendIn(BaseModel):
    conversation_id: int | None = None
    message: str = Field(min_length=1, max_length=20000)


class AiDraftOut(BaseModel):
    id: int
    kind: str
    status: str
    payload: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}
