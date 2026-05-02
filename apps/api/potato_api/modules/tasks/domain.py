from __future__ import annotations


def list_payload(items: list[dict]) -> dict[str, list[dict]]:
    return {"items": items}


def item_payload(item: dict) -> dict[str, dict]:
    return {"item": item}
