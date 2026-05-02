from __future__ import annotations


def item_payload(item) -> dict:
    return {"item": item}


def list_payload(items) -> dict:
    return {"items": items}
