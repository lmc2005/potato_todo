from __future__ import annotations

import os

os.environ.setdefault("STUDY_DB_URL", "sqlite:///./data/test_study_v2_rooms.db")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

from fastapi import Depends
from fastapi.testclient import TestClient

from app.database import Base, engine
from apps.api.potato_api.app import create_app
from apps.api.potato_api.core.deps import get_current_user_for_stream


def make_client() -> TestClient:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app = create_app()

    @app.get("/api/v2/_test/stream-auth")
    def stream_auth_probe(user=Depends(get_current_user_for_stream)):
        return {"user_id": user.id, "email": user.email}

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


def test_room_stream_accepts_access_token_query_param():
    with make_client() as client:
        access_token = register_and_token(client, "rooms-v2@example.com")
        response = client.get(f"/api/v2/_test/stream-auth?access_token={access_token}")
        assert response.status_code == 200
        assert response.json()["email"] == "rooms-v2@example.com"
