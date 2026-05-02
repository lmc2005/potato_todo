from __future__ import annotations

import json

from fastapi import HTTPException, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.schemas import ClearDataIn

from ...legacy_bridge import clear_all_data, export_payload, import_payload, now_local


def export_backup(db: Session, user_id: int) -> Response:
    payload = export_payload(db, user_id)
    body = json.dumps(jsonable_encoder(payload), ensure_ascii=False, indent=2)
    filename = f"study-planner-backup-user-{user_id}-{now_local().strftime('%Y%m%d-%H%M%S')}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def import_backup(db: Session, user_id: int, file: UploadFile) -> dict:
    try:
        raw = await file.read()
        payload = json.loads(raw.decode("utf-8"))
        pre_import = import_payload(db, user_id, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Import failed: {exc}") from exc
    return {"imported": True, "pre_import_backup": str(pre_import)}


def clear_backup_data(db: Session, user_id: int, payload: ClearDataIn) -> dict:
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Confirmation is required before clearing all data.")
    pre_clear = clear_all_data(db, user_id)
    return {"cleared": True, "pre_clear_backup": str(pre_clear)}
