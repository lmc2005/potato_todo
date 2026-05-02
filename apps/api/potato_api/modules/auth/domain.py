from __future__ import annotations


def auth_user_payload(user_id: int, email: str) -> dict[str, str | int]:
    return {"id": user_id, "email": email}
