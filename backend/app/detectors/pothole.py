"""Pothole detector (Ultralytics, single-class).

Runs the dedicated ``potholes.pt`` model on the *road region* of the frame —
the lower portion where the road surface is — at a reduced ``imgsz`` to keep it
cheap. Potholes are static, so this detector does no tracking; it just returns
boxes in full source-frame pixels (the ROI offset is added back here so callers
never deal with ROI-local coordinates).

Run on a slower cadence than object detection (see
:class:`app.services.pipeline.CameraPipeline`): potholes don't move, so refreshing
them a couple of times per second is plenty.
"""

from __future__ import annotations

import threading

from app.core.logging import get_logger
from app.models.frame import Frame
from app.schemas.detection import PotholeObject

logger = get_logger(__name__)


class PotholeDetector:
    """Ultralytics detector for road potholes, run on a lower-frame ROI."""

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.35,
        iou: float = 0.45,
        imgsz: int = 320,
        roi_top: float = 0.6,
        device: str = "cpu",
    ) -> None:
        self._model_path = model_path
        self._confidence = confidence
        self._iou = iou
        self._imgsz = imgsz
        # Fraction of the frame height where the road ROI starts (0.6 => lower 40%).
        self._roi_top = roi_top
        self._device = device

        self._model = None  # type: ignore[assignment]
        self._ready = False
        # Inference is not thread-safe; serialize calls per detector instance.
        self._lock = threading.Lock()

    def load(self) -> None:
        from ultralytics import YOLO

        logger.info("Loading pothole model", extra={"model": self._model_path})
        self._model = YOLO(self._model_path)
        self._ready = True
        logger.info("Pothole model loaded")

    @property
    def is_ready(self) -> bool:
        return self._ready

    def detect(self, frame: Frame, camera_id: str) -> list[PotholeObject]:
        if not self._ready or self._model is None:
            return []

        roi_start = int(frame.height * self._roi_top)
        road_roi = frame.image[roi_start:, :]
        if road_roi.size == 0:
            return []

        with self._lock:
            results = self._model.predict(
                source=road_roi,
                imgsz=self._imgsz,
                conf=self._confidence,
                iou=self._iou,
                device=self._device,
                verbose=False,
            )

        if not results:
            return []
        return self._parse(results[0], roi_start)

    def _parse(self, result, roi_start: int) -> list[PotholeObject]:
        """Convert an Ultralytics result into wire-contract potholes.

        Coordinates come back in ROI-local pixels; ``roi_start`` is added to y so
        the returned boxes are in full source-frame space.
        """
        boxes = getattr(result, "boxes", None)
        if boxes is None or boxes.xyxy is None or len(boxes) == 0:
            return []

        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy() if boxes.conf is not None else []

        potholes: list[PotholeObject] = []
        for i in range(len(xyxy)):
            x1, y1, x2, y2 = xyxy[i]
            potholes.append(
                PotholeObject(
                    confidence=round(float(confs[i]) if len(confs) else 0.0, 3),
                    x1=int(x1),
                    y1=int(y1) + roi_start,
                    x2=int(x2),
                    y2=int(y2) + roi_start,
                )
            )
        return potholes
