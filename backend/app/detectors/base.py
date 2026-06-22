"""Detector interface.

A small abstraction so alternative detectors (other YOLO variants, ONNX,
TensorRT on the Pi, distance/lane models, etc.) can be swapped in without
touching the pipeline. Future ADAS features plug in here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.frame import Frame
from app.schemas.detection import DetectedObject


class Detector(ABC):
    """Abstract object detector + tracker."""

    @abstractmethod
    def load(self) -> None:
        """Load model weights into memory. Called once at startup."""

    @abstractmethod
    def detect(self, frame: Frame, camera_id: str) -> list[DetectedObject]:
        """Run detection + tracking on a single frame.

        Implementations must be stateful per ``camera_id`` so tracking ids stay
        consistent across calls for the same camera.
        """

    @property
    @abstractmethod
    def is_ready(self) -> bool:
        """True once the model is loaded and usable."""
