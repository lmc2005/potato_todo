from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from ...core.deps import get_current_user
from ...legacy_bridge import User, get_db
from .domain import stats_payload
from .service import load_stats


router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/stats")
def stats(start: date | None = None, end: date | None = None, db=Depends(get_db), user: User = Depends(get_current_user)):
    return stats_payload(load_stats(db, user.id, start, end))
