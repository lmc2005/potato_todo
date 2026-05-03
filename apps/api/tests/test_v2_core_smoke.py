from __future__ import annotations

import os

os.environ.setdefault("STUDY_DB_URL", "sqlite:///./data/test_study_v2_smoke.db")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

from fastapi.testclient import TestClient

from app.database import Base, engine
from apps.api.potato_api.app import create_app
from apps.api.potato_api.modules.assistant import service as assistant_service


def make_client() -> TestClient:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app = create_app()
    return TestClient(app)


def register_and_token(client: TestClient, email: str) -> str:
    response = client.post(
        "/api/v2/auth/register",
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_v2_workspace_timer_settings_backup_and_rooms_smoke():
    with make_client() as client:
        token = register_and_token(client, "smoke@example.com")
        headers = auth_headers(token)

        subject = client.post(
            "/api/v2/subjects",
            json={"name": "Mathematics", "color": "#796dff", "daily_goal_minutes": 45},
            headers=headers,
        )
        assert subject.status_code == 200
        subject_id = subject.json()["item"]["id"]

        task = client.post(
            "/api/v2/tasks",
            json={"title": "Review chapter 4", "subject_id": subject_id, "priority": "high"},
            headers=headers,
        )
        assert task.status_code == 200
        task_id = task.json()["item"]["id"]

        event = client.post(
            "/api/v2/calendar/events",
            json={
                "title": "Chapter 4 block",
                "subject_id": subject_id,
                "task_id": task_id,
                "start_at": "2026-05-03T19:00:00",
                "end_at": "2026-05-03T20:00:00",
            },
            headers=headers,
        )
        assert event.status_code == 200

        timer = client.post(
            "/api/v2/timer/start",
            json={"mode": "count_up", "subject_id": subject_id, "task_id": task_id},
            headers=headers,
        )
        assert timer.status_code == 200
        assert timer.json()["result"]["active"] is True

        paused = client.post("/api/v2/timer/pause", headers=headers)
        assert paused.status_code == 200
        assert paused.json()["result"]["is_paused"] is True

        resumed = client.post("/api/v2/timer/resume", headers=headers)
        assert resumed.status_code == 200
        assert resumed.json()["result"]["is_paused"] is False

        stopped = client.post("/api/v2/timer/stop", json={}, headers=headers)
        assert stopped.status_code == 200
        assert stopped.json()["result"]["active"] is False

        llm_saved = client.post(
            "/api/v2/settings/llm",
            json={"base_url": "https://api.example.com/v1", "api_key": "secret-key"},
            headers=headers,
        )
        assert llm_saved.status_code == 200
        assert llm_saved.json()["settings"]["enabled"] is True

        pomodoro_saved = client.post(
            "/api/v2/settings/pomodoro",
            json={"focus_minutes": 30, "short_break_minutes": 5, "long_break_minutes": 15, "total_rounds": 4},
            headers=headers,
        )
        assert pomodoro_saved.status_code == 200
        assert pomodoro_saved.json()["settings"]["focus_minutes"] == 30

        room = client.post(
            "/api/v2/rooms",
            json={"name": "Late Sprint", "member_limit": 8, "timezone": "Asia/Shanghai"},
            headers=headers,
        )
        assert room.status_code == 200
        room_id = room.json()["item"]["id"]

        detail = client.get(f"/api/v2/rooms/{room_id}", headers=headers)
        assert detail.status_code == 200
        assert detail.json()["item"]["name"] == "Late Sprint"

        snapshot = client.get(f"/api/v2/rooms/{room_id}/snapshot", headers=headers)
        assert snapshot.status_code == 200
        assert snapshot.json()["item"]["member_count"] == 1

        exported = client.get("/api/v2/backup/export", headers=headers)
        assert exported.status_code == 200
        payload = exported.json()
        assert payload["version"] == 2
        assert any(row["name"] == "Mathematics" for row in payload["tables"]["subjects"])


def test_v2_agent_plan_and_chat_smoke(monkeypatch):
    async def fake_call_llm(db, user_id, system_prompt, user_payload, instruction=None, conversation=None):
        return (
            {
                "summary": "Structured plan ready.",
                "tasks": [
                    {
                        "title": "Summarize the weak topics",
                        "subject_id": None,
                        "priority": "medium",
                        "estimated_minutes": 40,
                        "notes": "Generated by smoke test",
                        "reason": "Create a first-pass task",
                    }
                ],
                "schedule_events": [],
                "risks": [],
            },
            "{\"summary\":\"Structured plan ready.\"}",
        )

    async def fake_call_llm_text(db, user_id, system_prompt, instruction, conversation=None, context=None):
        return f"Agent reply: {instruction}"

    monkeypatch.setattr(assistant_service, "call_llm", fake_call_llm)
    monkeypatch.setattr(assistant_service, "call_llm_text", fake_call_llm_text)

    with make_client() as client:
        token = register_and_token(client, "agent-smoke@example.com")
        headers = auth_headers(token)

        llm_saved = client.post(
            "/api/v2/settings/llm",
            json={"base_url": "https://api.example.com/v1", "api_key": "secret-key"},
            headers=headers,
        )
        assert llm_saved.status_code == 200

        planned = client.post(
            "/api/v2/assistant/plan",
            json={"start": "2026-05-01", "end": "2026-05-03", "instruction": "Plan my review week."},
            headers=headers,
        )
        assert planned.status_code == 200
        draft_id = planned.json()["item"]["id"]
        assert planned.json()["item"]["kind"] == "plan"

        drafts = client.get("/api/v2/assistant/drafts", headers=headers)
        assert drafts.status_code == 200
        assert len(drafts.json()["items"]) == 1

        applied = client.post(f"/api/v2/assistant/drafts/{draft_id}/apply", headers=headers)
        assert applied.status_code == 200

        tasks = client.get("/api/v2/tasks", headers=headers)
        assert tasks.status_code == 200
        assert any(item["title"] == "Summarize the weak topics" for item in tasks.json()["items"])

        created = client.post("/api/v2/assistant/chat/send", json={"message": "Help me plan tonight."}, headers=headers)
        assert created.status_code == 200
        assert created.json()["item"]["assistant_message"] == "Agent reply: Help me plan tonight."

        conversation_id = created.json()["item"]["conversation"]["id"]
        sessions = client.get("/api/v2/assistant/chat/sessions", headers=headers)
        assert sessions.status_code == 200
        assert sessions.json()["items"][0]["id"] == conversation_id

        loaded = client.get(f"/api/v2/assistant/chat/sessions/{conversation_id}", headers=headers)
        assert loaded.status_code == 200
        assert [message["role"] for message in loaded.json()["item"]["messages"]] == ["user", "assistant"]
