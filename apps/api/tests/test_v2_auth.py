from __future__ import annotations

import os

os.environ.setdefault("STUDY_DB_URL", "sqlite:///./data/test_study_v2.db")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

from fastapi.testclient import TestClient

from app.database import Base, engine
from apps.api.potato_api.app import create_app


def make_client() -> TestClient:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app = create_app()
    return TestClient(app)


def test_v2_auth_register_login_refresh_and_me():
    with make_client() as client:
        register = client.post(
            "/api/v2/auth/register",
            json={
                "email": "v2@example.com",
                "password": "password123",
                "confirm_password": "password123",
            },
        )
        assert register.status_code == 200
        payload = register.json()
        assert payload["token_type"] == "bearer"
        access_token = payload["access_token"]

        me = client.get("/api/v2/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me.status_code == 200
        assert me.json()["user"]["email"] == "v2@example.com"

        refresh = client.post("/api/v2/auth/refresh")
        assert refresh.status_code == 200
        refreshed = refresh.json()
        assert refreshed["user"]["email"] == "v2@example.com"

        logout = client.post("/api/v2/auth/logout")
        assert logout.status_code == 200
        assert logout.json()["ok"] is True

        login = client.post(
            "/api/v2/auth/login",
            json={
                "email": "v2@example.com",
                "password": "password123",
            },
        )
        assert login.status_code == 200
        relogged = login.json()
        assert relogged["user"]["email"] == "v2@example.com"
