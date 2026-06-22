"""Pipeline manager — the multi-camera orchestrator.

Owns one :class:`CameraPipeline` per configured camera and exposes lookups used
by the REST and WebSocket layers. This is the single place that knows about the
*set* of cameras, so scaling from one to many is purely configuration-driven.
"""

from __future__ import annotations

import asyncio

from app.core.config import Settings
from app.core.logging import get_logger
from app.schemas.metrics import HealthResponse, StreamInfo
from app.services.pipeline import CameraPipeline
from app.websocket.manager import ConnectionManager

logger = get_logger(__name__)


class PipelineManager:
    """Lifecycle + lookup hub for all camera pipelines."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        # One connection manager per channel — channels are fully independent.
        self.detections_ws = ConnectionManager("detections")
        self.metrics_ws = ConnectionManager("metrics")
        self._pipelines: dict[str, CameraPipeline] = {}

    async def start(self) -> None:
        for camera in self._settings.camera_configs():
            pipeline = CameraPipeline(
                camera=camera,
                settings=self._settings,
                detections_ws=self.detections_ws,
                metrics_ws=self.metrics_ws,
            )
            self._pipelines[camera.camera_id] = pipeline
        # Start all pipelines concurrently (parallel model loads / connects).
        await asyncio.gather(*(p.start() for p in self._pipelines.values()))
        logger.info("All pipelines started", extra={"cameras": list(self._pipelines)})

    async def stop(self) -> None:
        await asyncio.gather(
            *(p.stop() for p in self._pipelines.values()), return_exceptions=True
        )
        self._pipelines.clear()

    # ------------------------------------------------------------------ #
    # Lookups
    # ------------------------------------------------------------------ #
    def get(self, camera_id: str) -> CameraPipeline | None:
        return self._pipelines.get(camera_id)

    def all(self) -> list[CameraPipeline]:
        return list(self._pipelines.values())

    def streams(self) -> list[StreamInfo]:
        return [p.stream_info() for p in self._pipelines.values()]

    def health(self) -> HealthResponse:
        pipelines = self.all()
        any_stream_online = any(p.source.is_online for p in pipelines)
        all_yolo_ready = all(p.is_ready for p in pipelines) and pipelines
        agg_fps = round(sum(p.metrics.detection_fps for p in pipelines), 1)
        uptime = max((p.metrics.uptime_seconds for p in pipelines), default=0.0)

        if all_yolo_ready and any_stream_online:
            status: str = "online"
        elif all_yolo_ready:
            status = "degraded"  # model up but no stream
        else:
            status = "offline"

        return HealthResponse(
            status=status,  # type: ignore[arg-type]
            stream="online" if any_stream_online else "offline",
            yolo="online" if all_yolo_ready else "offline",
            fps=agg_fps,
            cameras=len(pipelines),
            uptimeSeconds=uptime,
        )
