from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.schemas import ClearDataIn

from ...core.deps import get_current_user
from ...legacy_bridge import User, get_db
from .service import clear_backup_data, export_backup, import_backup


router = APIRouter(prefix="/backup", tags=["backup"])


@router.get("/export")
def export(db=Depends(get_db), user: User = Depends(get_current_user)):
    return export_backup(db, user.id)


@router.post("/import")
async def import_file(file: UploadFile = File(...), db=Depends(get_db), user: User = Depends(get_current_user)):
    return await import_backup(db, user.id, file)


@router.post("/clear")
def clear_data(payload: ClearDataIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return clear_backup_data(db, user.id, payload)
