from __future__ import annotations


def list_payload(items) -> dict:
    return {"items": items}


def item_payload(item) -> dict:
    return {"item": item}
