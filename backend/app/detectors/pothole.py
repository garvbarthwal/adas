"""Pothole detector (Ultralytics, single-class).

Runs the dedicated ``potholes.pt`` model on the *road region* of the frame —
the lower portion where the road surface is — at a reduced ``imgsz`` to keep it
cheap. Potholes are static, so this detector does no tracking; it just returns
boxes in full source-frame pixels (the ROI offset is added back here so callers
never deal with ROI-local coordinates).

Run every detection frame (see :class:`app.services.pipeline.CameraPipeline`),
on the same frame as object detection, so hazards stay glued to the live scene.
The reduced ROI + ``imgsz`` keep it cheap enough to do every tick.
"""

from __future__ import annotations

import threading

from app.core.logging import get_logger
from app.detectors.base import UltralyticsDetector
from app.detectors.utils import extract_boxes
from app.models.frame import Frame
from app.schemas.detection import PotholeObject

logger = get_logger(__name__)


class PotholeDetector(UltralyticsDetector):
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
        super().__init__(
            model_path=model_path,
            confidence=confidence,
            iou=iou,
            device=device,
        )
        self._imgsz = imgsz
        # Fraction of the frame height where the road ROI starts (0.6 => lower 40%).
        self._roi_top = roi_top

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
        extracted = extract_boxes(result)
        if extracted is None:
            return []

        potholes: list[PotholeObject] = []
        for i in range(len(extracted.xyxy)):
            x1, y1, x2, y2 = extracted.xyxy[i]
            potholes.append(
                PotholeObject(
                    confidence=round(float(extracted.confs[i]) if len(extracted.confs) else 0.0, 3),
                    x1=int(x1),
                    y1=int(y1) + roi_start,
                    x2=int(x2),
                    y2=int(y2) + roi_start,
                )
            )
        return potholes
