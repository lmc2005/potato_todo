from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas import SubjectIn, SubjectPatch

from ...core.deps import get_current_user
from ...legacy_bridge import User, get_db
from .domain import item_payload, list_payload
from .service import create_subject_item, delete_subject_item, list_subject_items, update_subject_item


router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("")
def list_subjects(include_archived: bool = False, db=Depends(get_db), user: User = Depends(get_current_user)):
    return list_payload(list_subject_items(db, user.id, include_archived))


@router.post("")
def create_subject(payload: SubjectIn, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(create_subject_item(db, user.id, payload))


@router.patch("/{subject_id}")
def update_subject(subject_id: int, payload: SubjectPatch, db=Depends(get_db), user: User = Depends(get_current_user)):
    return item_payload(update_subject_item(db, user.id, subject_id, payload))


@router.delete("/{subject_id}")
def delete_subject(subject_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    return delete_subject_item(db, user.id, subject_id)
