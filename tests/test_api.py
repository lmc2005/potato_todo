from __future__ import annotations

import json
from datetime import timedelta

from app.database import SessionLocal
from app.models import AiDraft, TimerState, now_local


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


def test_clear_data_requires_confirmation_and_clears_records(client):
    client.post("/api/subjects", json={"name": "History", "color": "#E11D48"})
    rejected = client.post("/api/data/clear", json={"confirm": False})
    assert rejected.status_code == 400
    assert client.get("/api/subjects").json()

    cleared = client.post("/api/data/clear", json={"confirm": True})
    assert cleared.status_code == 200
    assert cleared.json()["cleared"] is True
    assert client.get("/api/subjects").json() == []


def test_news_placeholder(client):
    response = client.get("/api/news/daily")
    assert response.status_code == 501
    assert response.json()["detail"] == "Not implemented yet."
