"""Detector interface.

A small abstraction so alternative detectors (other YOLO variants, ONNX,
TensorRT on the Pi, distance/lane models, etc.) can be swapped in without
touching the pipeline. Future ADAS features plug in here.
"""

from __future__ import annotations

import threading
from abc import ABC, abstractmethod

from app.core.logging import get_logger
from app.models.frame import Frame
from app.schemas.detection import DetectedObject

logger = get_logger(__name__)


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


class UltralyticsDetector:
    """Base for all Ultralytics-backed detectors.

    Owns the common model lifecycle: lazy import, loading, ready flag, and
    a threading lock for serialized inference. Subclasses implement
    :meth:`detect` using ``self._model`` and ``self._names``.
    """

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.35,
        iou: float = 0.45,
        device: str = "cpu",
    ) -> None:
        self._model_path = model_path
        self._confidence = confidence
        self._iou = iou
        self._device = device

        self._model = None  # type: ignore[assignment]
        self._names: dict[int, str] = {}
        self._ready = False
        self._lock = threading.Lock()

    def load(self) -> None:
        from ultralytics import YOLO

        logger.info("Loading model", extra={"model": self._model_path})
        self._model = YOLO(self._model_path)
        self._names = dict(getattr(self._model, "names", {}))
        self._ready = True
        logger.info("Model loaded", extra={"model": self._model_path, "classes": len(self._names)})

    @property
    def is_ready(self) -> bool:
        return self._ready
