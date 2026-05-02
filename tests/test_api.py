from __future__ import annotations

import json
from datetime import datetime, time, timedelta

from fastapi.testclient import TestClient

import app.main as main_module
from app.database import SessionLocal
from app.main import app
from app.models import AiDraft, StudySession, Task, TimerState, User, now_local


def user_id_for(email: str = "user@example.com") -> int:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).one()
        return user.id


def register_user(client: TestClient, email: str, password: str = "password123") -> None:
    response = client.post(
        "/register",
        data={
            "email": email,
            "password": password,
            "confirm_password": password,
        },
        follow_redirects=False,
    )
    assert response.status_code == 303


def test_auth_required_for_protected_pages_and_apis(client):
    with TestClient(app) as anonymous:
        api_response = anonymous.get("/api/tasks")
        assert api_response.status_code == 401

        page_response = anonymous.get("/assistant")
        assert page_response.status_code == 200
        assert "Log In" in page_response.text


def test_countdown_completion_updates_stats(client):
    user_id = user_id_for()
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
        timer = db.query(TimerState).filter(TimerState.user_id == user_id).one()
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
    user_id = user_id_for()
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
        timer = db.query(TimerState).filter(TimerState.user_id == user_id).one()
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


def test_subject_list_includes_total_focus_seconds(client):
    user_id = user_id_for()
    subject = client.post("/api/subjects", json={"name": "Music", "color": "#8B5CF6"}).json()
    with SessionLocal() as db:
        db.add(
            StudySession(
                user_id=user_id,
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
    user_id = user_id_for()
    today = now_local().date()
    due_at = datetime.combine(today, time(hour=12))
    rows = [
        Task(user_id=user_id, title="On-time task", status="done", due_at=due_at, completed_at=due_at - timedelta(minutes=30)),
        Task(user_id=user_id, title="Late task", status="done", due_at=due_at, completed_at=due_at + timedelta(minutes=30)),
        Task(user_id=user_id, title="Missed task", status="todo", due_at=due_at),
        Task(user_id=user_id, title="Pending task", status="in_progress", due_at=due_at),
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
    user_id = user_id_for()
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
        draft = AiDraft(
            user_id=user_id,
            kind="plan",
            input_snapshot="{}",
            payload=json.dumps(payload),
            raw_response=json.dumps(payload),
        )
        db.add(draft)
        db.commit()
        draft_id = draft.id

    before = client.get("/api/tasks").json()
    assert all(task["title"] != "Review mechanics notes" for task in before)

    applied = client.post(f"/api/ai/drafts/{draft_id}/apply").json()
    assert applied["created_tasks"] == 1
    after = client.get("/api/tasks").json()
    assert any(task["title"] == "Review mechanics notes" for task in after)


def test_backup_export_and_clear_are_user_scoped(client):
    client.post("/api/subjects", json={"name": "English", "color": "#5E8CFF"})

    with TestClient(app) as other_client:
        register_user(other_client, "other@example.com")
        other_client.post("/api/subjects", json={"name": "Biology", "color": "#34C759"})

        exported = client.get("/api/backup/export")
        assert exported.status_code == 200
        payload = exported.json()
        assert payload["version"] == 2
        assert any(row["name"] == "English" for row in payload["tables"]["subjects"])
        assert all(row["name"] != "Biology" for row in payload["tables"]["subjects"])

        cleared = client.post("/api/data/clear", json={"confirm": True})
        assert cleared.status_code == 200
        assert client.get("/api/subjects").json() == []

        other_subjects = other_client.get("/api/subjects").json()
        assert any(subject["name"] == "Biology" for subject in other_subjects)


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


def test_assistant_page_loads_after_auth(client):
    response = client.get("/assistant")
    assert response.status_code == 200
    assert "GPT Assistant" in response.text


def test_ai_plan_without_time_request_returns_tasks_only(client, monkeypatch):
    subject = client.post("/api/subjects", json={"name": "Math", "color": "#5E8CFF"}).json()

    async def fake_call_llm(db, user_id, system_prompt, user_payload, instruction=None, conversation=None):
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


def test_ai_chat_sessions_persist_and_reload(client, monkeypatch):
    recorded_turns = []

    async def fake_call_llm_text(db, user_id, system_prompt, instruction, conversation=None, context=None):
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


def test_study_room_snapshot_and_isolation(client):
    owner_id = user_id_for()
    room = client.post("/api/rooms", json={"name": "Sprint Room", "member_limit": 20, "timezone": "Asia/Shanghai"}).json()
    room_id = room["id"]
    join_code = room["join_code"]

    with TestClient(app) as other_client:
        register_user(other_client, "peer@example.com")
        peer_id = user_id_for("peer@example.com")
        join_response = other_client.post("/api/rooms/join", json={"join_code": join_code})
        assert join_response.status_code == 200

        owner_subject = client.post("/api/subjects", json={"name": "Owner Math", "color": "#2563EB"}).json()
        peer_subject = other_client.post("/api/subjects", json={"name": "Peer English", "color": "#34C759"}).json()

        owner_task = client.post("/api/tasks", json={"title": "Owner done", "subject_id": owner_subject["id"], "status": "done"}).json()
        other_client.post("/api/tasks", json={"title": "Peer working", "subject_id": peer_subject["id"], "status": "in_progress"}).json()

        with SessionLocal() as db:
            owner_done = db.query(Task).filter(Task.id == owner_task["id"]).one()
            owner_done.completed_at = now_local()
            db.add(
                StudySession(
                    user_id=owner_id,
                    subject_id=owner_subject["id"],
                    task_id=owner_done.id,
                    mode="count_up",
                    started_at=now_local() - timedelta(minutes=50),
                    ended_at=now_local(),
                    focus_seconds=50 * 60,
                    paused_seconds=0,
                    stop_reason="manual_stop",
                )
            )
            db.add(
                StudySession(
                    user_id=peer_id,
                    subject_id=peer_subject["id"],
                    mode="count_up",
                    started_at=now_local() - timedelta(minutes=30),
                    ended_at=now_local(),
                    focus_seconds=30 * 60,
                    paused_seconds=0,
                    stop_reason="manual_stop",
                )
            )
            db.add(
                TimerState(
                    user_id=peer_id,
                    mode="count_up",
                    subject_id=peer_subject["id"],
                    started_at=now_local() - timedelta(minutes=10),
                )
            )
            db.commit()

        snapshot = client.get(f"/api/rooms/{room_id}/snapshot").json()
        assert snapshot["member_count"] == 2
        assert snapshot["active_focus_count"] == 1
        assert snapshot["members"][0]["label"] == "user"
        assert snapshot["members"][0]["focus_seconds_today"] == 50 * 60
        assert snapshot["members"][1]["label"] == "peer"
        assert snapshot["members"][1]["is_focusing"] is True

        outsider = TestClient(app)
        with outsider:
            register_user(outsider, "outsider@example.com")
            denied = outsider.get(f"/api/rooms/{room_id}/snapshot")
            assert denied.status_code == 404

def test_news_placeholder(client):
    response = client.get("/api/news/daily")
    assert response.status_code == 501
    assert response.json()["detail"] == "Not implemented yet."
