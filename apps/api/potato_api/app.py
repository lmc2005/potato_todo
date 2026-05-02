from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.db import init_db
from .core.room_hub import RoomEventHub
from .modules.analytics.router import router as analytics_router
from .modules.assistant.router import router as assistant_router
from .modules.auth.router import router as auth_router
from .modules.backup.router import router as backup_router
from .modules.calendar.router import router as calendar_router
from .modules.rooms.router import router as rooms_router
from .modules.settings.router import router as settings_router
from .modules.subjects.router import router as subjects_router
from .modules.tasks.router import router as tasks_router
from .modules.timer.router import router as timer_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.room_hub = RoomEventHub(asyncio.get_running_loop())
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    api_v2 = APIRouter(prefix="/api/v2")
    api_v2.include_router(auth_router)
    api_v2.include_router(subjects_router)
    api_v2.include_router(tasks_router)
    api_v2.include_router(calendar_router)
    api_v2.include_router(timer_router)
    api_v2.include_router(analytics_router)
    api_v2.include_router(assistant_router)
    api_v2.include_router(rooms_router)
    api_v2.include_router(settings_router)
    api_v2.include_router(backup_router)

    @api_v2.get("/health")
    def health():
        return {"ok": True, "service": "api-v2", "environment": settings.app_env}

    app.include_router(api_v2)
    return app


app = create_app()
