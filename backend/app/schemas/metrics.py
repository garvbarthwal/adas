"""Schemas for the ``/ws/metrics`` channel and the REST metrics/health APIs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

StreamStatus = Literal["online", "offline", "connecting"]
ServiceStatus = Literal["online", "offline", "degraded"]


class CameraMetrics(BaseModel):
    """Per-camera runtime metrics, pushed over ``/ws/metrics``."""

    cameraId: str = Field(description="Camera these metrics belong to.")
    streamStatus: StreamStatus = Field(description="RTSP ingestion status.")
    streamFps: float = Field(description="Frames per second read from RTSP.")
    detectionFps: float = Field(description="Detection passes per second.")
    latencyMs: float = Field(description="End-to-end processing latency, ms.")
    trackedObjects: int = Field(description="Active tracked objects in last frame.")
    uptimeSeconds: float = Field(description="Seconds the pipeline has been running.")


class HealthResponse(BaseModel):
    """Aggregate health for the ``GET /health`` probe (Docker/EC2/Vercel)."""

    status: ServiceStatus
    stream: StreamStatus
    yolo: ServiceStatus
    fps: float = Field(description="Aggregate detection FPS across cameras.")
    cameras: int = Field(description="Number of configured cameras.")
    uptimeSeconds: float


class StreamInfo(BaseModel):
    """Summary of a configured stream, returned by ``GET /streams``."""

    cameraId: str
    name: str
    streamUrl: str
    status: StreamStatus
    streamFps: float
    detectionFps: float
