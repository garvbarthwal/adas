"""Wire-contract schemas shared between transport layers."""

from app.schemas.detection import DetectedObject, DetectionMessage
from app.schemas.metrics import (
    CameraMetrics,
    HealthResponse,
    StreamInfo,
)

__all__ = [
    "DetectedObject",
    "DetectionMessage",
    "CameraMetrics",
    "HealthResponse",
    "StreamInfo",
]
