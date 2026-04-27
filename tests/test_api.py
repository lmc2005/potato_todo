from __future__ import annotations

import json
from datetime import datetime, time, timedelta

import app.main as main_module
from app.database import SessionLocal
from app.models import AiDraft, StudySession, Task, TimerState, now_local


def test_countdown_completion_updates_stats(client):
    subject = client.post(
        "/api/subjects",
        json={"name": "Mathematics", "color": "#2563EB", "daily_goal_minutes": 30, "weekly_goal_minutes": 180, "monthly_goal_minutes": 720},
    ).json()
    task = client.post("/api/tasks", json={"title": "Problem set", "subject_id": subject["id"], "priority": "high"}).json()
    response = client.post(
        "/api/timer/start",
        json={"mode": "count_down", "subject_id": subject["id"], "task_id": task["id"], "duration_minutes": 1},
    )
    assert response.status_code == 200

    with SessionLocal() as db:
        timer = db.query(TimerState).first()
        timer.started_at = now_local() - timedelta(seconds=60)
        timer.countdown_end_at = now_local() - timedelta(seconds=1)
        db.commit()

    completed = client.get("/api/timer/current").json()
    assert completed["active"] is False
    assert completed["completed"] == "completed"
    assert completed["focus_seconds"] >= 59

    today = now_local().date().isoformat()
    stats = client.get(f"/api/stats?start={today}&end={today}").json()
    assert stats["session_count"] == 1
    assert stats["total_seconds"] >= 59
    assert stats["subject_breakdown"][0]["name"] == "Mathematics"


def test_pomodoro_records_only_focus_time(client):
    subject = client.post("/api/subjects", json={"name": "Literature", "color": "#34C759"}).json()
    response = client.post(
        "/api/pomodoro/start",
        json={
            "subject_id": subject["id"],
            "focus_minutes": 1,
            "short_break_minutes": 1,
            "long_break_minutes": 1,
            "total_rounds": 2,
        },
    )
    assert response.status_code == 200

    with SessionLocal() as db:
        timer = db.query(TimerState).first()
        timer.started_at = now_local() - timedelta(seconds=60)
        timer.countdown_end_at = now_local() - timedelta(seconds=1)
        db.commit()

    current = client.get("/api/timer/current").json()
    assert current["active"] is True
    assert current["completed"] == "focus_complete"
    assert current["pomodoro_phase"] == "break"

    today = now_local().date().isoformat()
    stats = client.get(f"/api/stats?start={today}&end={today}").json()
    assert stats["session_count"] == 1
    assert stats["total_seconds"] >= 59


def test_count_up_stop_can_adjust_long_session(client):
    subject = client.post("/api/subjects", json={"name": "Chemistry", "color": "#D97706"}).json()
    response = client.post("/api/timer/start", json={"mode": "count_up", "subject_id": subject["id"]})
    assert response.status_code == 200

    with SessionLocal() as db:
        timer = db.query(TimerState).first()
        timer.started_at = now_local() - timedelta(minutes=100)
        db.commit()

    stopped = client.post("/api/timer/stop", json={"adjusted_focus_minutes": 75}).json()
    assert stopped["completed"] == "manual_stop_adjusted"
    assert stopped["focus_seconds"] == 75 * 60

    today = now_local().date().isoformat()
    stats = client.get(f"/api/stats?start={today}&end={today}").json()
    assert stats["total_seconds"] == 75 * 60


def test_overdue_task_is_marked_undone_and_can_be_completed_with_time(client):
    due_at = (now_local() - timedelta(hours=2)).replace(microsecond=0)
    created = client.post("/api/tasks", json={"title": "Late reading", "due_at": due_at.isoformat()}).json()

    listed = client.get("/api/tasks").json()
    overdue = next(task for task in listed if task["id"] == created["id"])
    assert overdue["status"] == "undone"

    completed_at = (due_at + timedelta(hours=3)).replace(microsecond=0)
    patched = client.patch(
        f"/api/tasks/{created['id']}",
        json={"status": "done", "completed_at": completed_at.isoformat()},
    ).json()
    assert patched["status"] == "done"
    assert patched["completed_at"] == completed_at.isoformat()


def test_subject_can_be_updated(client):
    subject = client.post("/api/subjects", json={"name": "Biology", "color": "#34C759"}).json()
    updated = client.patch(
        f"/api/subjects/{subject['id']}",
        json={
            "name": "Advanced Biology",
            "color": "#7C3AED",
            "daily_goal_minutes": 75,
            "weekly_goal_minutes": 420,
            "monthly_goal_minutes": 1680,
        },
    )
    assert updated.status_code == 200
    payload = updated.json()
    assert payload["name"] == "Advanced Biology"
    assert payload["color"] == "#7C3AED"
    assert payload["daily_goal_minutes"] == 75


def test_subject_delete_detaches_tasks_and_events(client):
    subject = client.post("/api/subjects", json={"name": "Geography", "color": "#0891B2"}).json()
    task = client.post("/api/tasks", json={"title": "Map review", "subject_id": subject["id"]}).json()
    start_at = now_local().replace(hour=18, minute=0, second=0)
    end_at = start_at + timedelta(hours=1)
    event = client.post(
        "/api/schedule-events",
        json={
            "title": "Geography block",
            "subject_id": subject["id"],
            "task_id": task["id"],
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
    ).json()

    deleted = client.delete(f"/api/subjects/{subject['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert deleted.json()["detached_tasks"] == 1
    assert deleted.json()["detached_events"] == 1

    assert client.get("/api/subjects").json() == []
    task_after = next(item for item in client.get("/api/tasks").json() if item["id"] == task["id"])
    assert task_after["subject_id"] is None
    event_after = next(item for item in client.get("/api/schedule-events").json() if item["id"] == event["id"])
    assert event_after["subject_id"] is None


def test_subject_delete_rejects_when_sessions_exist(client):
    subject = client.post("/api/subjects", json={"name": "Economics", "color": "#F59E0B"}).json()
    with SessionLocal() as db:
        db.add(
            StudySession(
                subject_id=subject["id"],
                mode="count_up",
                started_at=now_local() - timedelta(minutes=45),
                ended_at=now_local(),
                focus_seconds=45 * 60,
                paused_seconds=0,
                stop_reason="manual_stop",
            )
        )
        db.commit()

    response = client.delete(f"/api/subjects/{subject['id']}")
    assert response.status_code == 400
    assert "cannot be deleted" in response.json()["detail"]


def test_subject_delete_rejects_when_timer_is_active(client):
    subject = client.post("/api/subjects", json={"name": "Art", "color": "#EC4899"}).json()
    started = client.post("/api/timer/start", json={"mode": "count_up", "subject_id": subject["id"]})
    assert started.status_code == 200

    response = client.delete(f"/api/subjects/{subject['id']}")
    assert response.status_code == 400
    assert "Stop the active timer" in response.json()["detail"]


def test_subject_list_includes_total_focus_seconds(client):
    subject = client.post("/api/subjects", json={"name": "Music", "color": "#8B5CF6"}).json()
    with SessionLocal() as db:
        db.add(
            StudySession(
                subject_id=subject["id"],
                mode="count_up",
                started_at=now_local() - timedelta(minutes=30),
                ended_at=now_local(),
                focus_seconds=30 * 60,
                paused_seconds=0,
                stop_reason="manual_stop",
            )
        )
        db.commit()

    listed = client.get("/api/subjects").json()
    row = next(item for item in listed if item["id"] == subject["id"])
    assert row["total_focus_seconds"] == 30 * 60


def test_stats_include_task_completion_and_on_time_rates(client):
    today = now_local().date()
    due_at = datetime.combine(today, time(hour=12))
    rows = [
        Task(title="On-time task", status="done", due_at=due_at, completed_at=due_at - timedelta(minutes=30)),
        Task(title="Late task", status="done", due_at=due_at, completed_at=due_at + timedelta(minutes=30)),
        Task(title="Missed task", status="todo", due_at=due_at),
        Task(title="Pending task", status="in_progress", due_at=due_at),
    ]
    with SessionLocal() as db:
        db.add_all(rows)
        db.commit()

    stats = client.get(f"/api/stats?start={today.isoformat()}&end={today.isoformat()}").json()
    trend = stats["task_completion_trend"][0]
    assert trend["total"] == 4
    assert trend["completed"] == 2
    assert trend["on_time"] == 1
    assert trend["completion_rate"] == 0.5
    assert trend["on_time_rate"] == 0.25


def test_ai_plan_draft_applies_only_after_confirmation(client):
    subject = client.post("/api/subjects", json={"name": "Physics", "color": "#0F766E"}).json()
    payload = {
        "summary": "Plan one focused review block.",
        "tasks": [
            {
                "title": "Review mechanics notes",
                "subject_id": subject["id"],
                "priority": "medium",
                "estimated_minutes": 45,
                "notes": "Generated draft",
                "reason": "Weak recent coverage",
            }
        ],
        "schedule_events": [],
        "risks": [],
    }
    with SessionLocal() as db:
        draft = AiDraft(kind="plan", input_snapshot="{}", payload=json.dumps(payload), raw_response=json.dumps(payload))
        db.add(draft)
        db.commit()
        draft_id = draft.id

    before = client.get("/api/tasks").json()
    assert all(task["title"] != "Review mechanics notes" for task in before)

    applied = client.post(f"/api/ai/drafts/{draft_id}/apply").json()
    assert applied["created_tasks"] == 1
    after = client.get("/api/tasks").json()
    assert any(task["title"] == "Review mechanics notes" for task in after)


def test_backup_export_contains_core_tables(client):
    client.post("/api/subjects", json={"name": "English", "color": "#5E8CFF"})
    response = client.get("/api/backup/export")
    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == 1
    assert "subjects" in payload["tables"]
    assert "tasks" in payload["tables"]
    assert any(row["name"] == "English" for row in payload["tables"]["subjects"])


def test_llm_settings_store_reasoning_effort(client):
    saved = client.post(
        "/api/settings/llm",
        json={
            "base_url": "https://api.openai.com/v1",
            "api_key": "secret-key",
            "model": "gpt-5.5",
            "reasoning_effort": "xhigh",
        },
    )
    assert saved.status_code == 200
    payload = saved.json()
    assert payload["base_url"] == "https://api.openai.com/v1"
    assert payload["api_key"] == "********"
    assert payload["model"] == "gpt-5.5"
    assert payload["reasoning_effort"] == "xhigh"

    fetched = client.get("/api/settings/llm")
    assert fetched.status_code == 200
    assert fetched.json()["reasoning_effort"] == "xhigh"


def test_assistant_page_loads(client):
    response = client.get("/assistant")
    assert response.status_code == 200
    assert "GPT Assistant" in response.text


def test_ai_plan_without_time_request_returns_tasks_only(client, monkeypatch):
    subject = client.post("/api/subjects", json={"name": "Math", "color": "#5E8CFF"}).json()

    async def fake_call_llm(db, system_prompt, user_payload, instruction=None, conversation=None):
        return (
            {
                "summary": "Draft ready.",
                "tasks": [],
                "schedule_events": [
                    {
                        "title": "Review chapter 3",
                        "subject_id": subject["id"],
                        "start_at": "2026-04-27T19:00:00",
                        "end_at": "2026-04-27T20:00:00",
                        "reason": "Convert this into a task when no time window is requested.",
                    }
                ],
                "risks": [],
            },
            "{\"summary\":\"Draft ready.\"}",
        )

    monkeypatch.setattr(main_module, "call_llm", fake_call_llm)

    response = client.post(
        "/api/ai/plan",
        json={
            "start": "2026-04-27",
            "end": "2026-04-27",
            "instruction": "Plan my next math revision tasks.",
            "conversation": [],
        },
    )
    assert response.status_code == 200
    payload = response.json()["payload"]
    assert payload["schedule_events"] == []
    assert any(item["title"] == "Review chapter 3" for item in payload["tasks"])


def test_daily_quote_falls_back_without_llm_config(client):
    response = client.get("/api/ai/daily-quote")
    assert response.status_code == 200
    payload = response.json()
    assert payload["quote"]
    assert payload["author"]
    assert payload["source"]


def test_clear_data_requires_confirmation_and_clears_records(client):
    client.post("/api/subjects", json={"name": "History", "color": "#E11D48"})
    rejected = client.post("/api/data/clear", json={"confirm": False})
    assert rejected.status_code == 400
    assert client.get("/api/subjects").json()

    cleared = client.post("/api/data/clear", json={"confirm": True})
    assert cleared.status_code == 200
    assert cleared.json()["cleared"] is True
    assert client.get("/api/subjects").json() == []


def test_ai_chat_sessions_persist_and_reload(client, monkeypatch):
    recorded_turns = []

    async def fake_call_llm_text(db, system_prompt, instruction, conversation=None, context=None):
        recorded_turns.append(conversation or [])
        return f"Assistant reply: {instruction}"

    monkeypatch.setattr(main_module, "call_llm_text", fake_call_llm_text)

    created = client.post("/api/ai/chat/send", json={"message": "Help me plan tonight."})
    assert created.status_code == 200
    payload = created.json()
    conversation = payload["conversation"]
    assert payload["assistant_message"] == "Assistant reply: Help me plan tonight."
    assert conversation["title"] == "Help me plan tonight."
    assert len(conversation["messages"]) == 2

    conversation_id = conversation["id"]
    sessions = client.get("/api/ai/chat/sessions")
    assert sessions.status_code == 200
    assert sessions.json()[0]["id"] == conversation_id

    loaded = client.get(f"/api/ai/chat/sessions/{conversation_id}")
    assert loaded.status_code == 200
    assert [item["role"] for item in loaded.json()["messages"]] == ["user", "assistant"]

    continued = client.post(
        "/api/ai/chat/send",
        json={"conversation_id": conversation_id, "message": "Now turn that into three tasks."},
    )
    assert continued.status_code == 200
    continued_payload = continued.json()["conversation"]
    assert len(continued_payload["messages"]) == 4
    assert recorded_turns[-1][-2:] == [
        {"role": "user", "content": "Help me plan tonight."},
        {"role": "assistant", "content": "Assistant reply: Help me plan tonight."},
    ]


def test_ai_chat_session_delete(client, monkeypatch):
    async def fake_call_llm_text(db, system_prompt, instruction, conversation=None, context=None):
        return "Saved reply"

    monkeypatch.setattr(main_module, "call_llm_text", fake_call_llm_text)
    created = client.post("/api/ai/chat/send", json={"message": "Remember this chat."}).json()
    conversation_id = created["conversation"]["id"]

    deleted = client.delete(f"/api/ai/chat/sessions/{conversation_id}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    missing = client.get(f"/api/ai/chat/sessions/{conversation_id}")
    assert missing.status_code == 404


def test_news_placeholder(client):
    response = client.get("/api/news/daily")
    assert response.status_code == 501
    assert response.json()["detail"] == "Not implemented yet."
