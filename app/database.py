from __future__ import annotations

import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

LOGGER = logging.getLogger(__name__)


def _normalize_database_url(value: str) -> str:
    candidate = value.strip()
    if candidate.startswith("postgres://"):
        return f"postgresql+psycopg://{candidate[len('postgres://'):]}"
    if candidate.startswith("postgresql://") and not candidate.startswith("postgresql+"):
        return f"postgresql+psycopg://{candidate[len('postgresql://'):]}"
    return candidate


def _resolve_database_url() -> tuple[str, str]:
    study_db_url = os.getenv("STUDY_DB_URL")
    if study_db_url:
        return _normalize_database_url(study_db_url), "STUDY_DB_URL"

    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return _normalize_database_url(database_url), "DATABASE_URL"

    return f"sqlite:///{DATA_DIR / 'study.db'}", "sqlite-fallback"


DATABASE_URL, DATABASE_URL_SOURCE = _resolve_database_url()
DATABASE_BACKEND = "sqlite" if DATABASE_URL.startswith("sqlite") else "postgresql"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


USER_COLUMN_MIGRATIONS = {
    "subjects": "user_id INTEGER",
    "tasks": "user_id INTEGER",
    "schedule_events": "user_id INTEGER",
    "study_sessions": "user_id INTEGER",
    "timer_states": "user_id INTEGER",
    "ai_drafts": "user_id INTEGER",
    "ai_conversations": "user_id INTEGER",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_column(table_name: str, column_definition: str) -> None:
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    column_name = column_definition.split()[0]
    if column_name in columns:
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_definition}"))


def _run_compatibility_migrations() -> None:
    for table_name, column_definition in USER_COLUMN_MIGRATIONS.items():
        _ensure_column(table_name, column_definition)


def init_db() -> None:
    from app import models  # noqa: F401

    if os.getenv("APP_ENV", "development") == "production" and DATABASE_BACKEND == "sqlite":
        LOGGER.warning(
            "POTATO-TODO is running in production with SQLite fallback storage. "
            "Set STUDY_DB_URL or DATABASE_URL to your persistent PostgreSQL database "
            "or user accounts and study data may not survive service recreation."
        )

    Base.metadata.create_all(bind=engine)
    _run_compatibility_migrations()
