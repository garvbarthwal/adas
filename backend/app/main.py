"""FastAPI application entrypoint.

Boots the multi-camera detection platform: configures logging, starts every
camera pipeline on startup and shuts them down gracefully on exit. Exposes REST
routes plus the two independent WebSocket channels.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.webrtc import router as webrtc_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.services.manager import PipelineManager
from app.websocket.routes import router as ws_router

settings = get_settings()
configure_logging(
    level=settings.log_level,
    json_logs=settings.environment.lower() != "development",
)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start pipelines on boot, tear them down gracefully on shutdown."""
    logger.info("Starting up", extra={"env": settings.environment})
    manager = PipelineManager(settings)
    app.state.manager = manager
    app.state.ingest_pcs = set()  # active browser-camera WebRTC ingest connections
    await manager.start()
    try:
        yield
    finally:
        logger.info("Shutting down")
        # Close any open browser-camera ingest connections, then the pipelines.
        for pc in list(app.state.ingest_pcs):
            await pc.close()
        app.state.ingest_pcs.clear()
        await manager.stop()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Real-time multi-camera object detection platform (YOLOv8 + ByteTrack).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(webrtc_router)
app.include_router(ws_router)


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    """Service banner."""
    return {"service": settings.app_name, "version": "1.0.0", "status": "ok"}
