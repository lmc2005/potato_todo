from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ...legacy_bridge import compute_stats, now_local


def load_stats(db: Session, user_id: int, start: date | None, end: date | None) -> dict:
    today = now_local().date()
    start = start or today
    end = end or today
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")
    return compute_stats(db, user_id, start, end)
