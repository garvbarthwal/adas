"""Wire-contract schemas — the public API surface between backend and frontend."""

from app.schemas.detection import (
    DetectedObject,
    DetectionMessage,
    LaneSegment,
    PotholeObject,
)
from app.schemas.metrics import CameraMetrics, HealthResponse, StreamInfo

__all__ = [
    "DetectedObject",
    "DetectionMessage",
    "LaneSegment",
    "PotholeObject",
    "CameraMetrics",
    "HealthResponse",
    "StreamInfo",
]
