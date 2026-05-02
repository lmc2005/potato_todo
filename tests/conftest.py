from __future__ import annotations

import os

os.environ.setdefault("STUDY_DB_URL", "sqlite:///./data/test_study.db")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app
from app.models import Setting


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    from app.database import SessionLocal

    with SessionLocal() as db:
        db.add(Setting(key="llm_base_url", value="https://api.example.com/v1"))
        db.add(Setting(key="llm_api_key", value="test-key"))
        db.commit()

    with TestClient(app) as test_client:
        response = test_client.post(
            "/register",
            data={
                "email": "user@example.com",
                "password": "password123",
                "confirm_password": "password123",
            },
            follow_redirects=False,
        )
        assert response.status_code == 303
        yield test_client
