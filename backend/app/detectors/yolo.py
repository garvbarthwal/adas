"""YOLOv8 detector with ByteTrack tracking (Ultralytics).

Wraps a single Ultralytics model. ByteTrack provides stable tracking ids which
are the foundation for future speed estimation, counting and ADAS alerts.

Ultralytics' tracker keeps per-call state internally, so tracking is consistent
only when frames for a given camera are fed through the *same* model instance in
order. For multiple cameras we keep one detector instance per camera (see
:class:`app.services.pipeline.CameraPipeline`) so their tracker states never mix.
"""

from __future__ import annotations

import threading

from app.core.logging import get_logger
from app.detectors.base import Detector, UltralyticsDetector
from app.detectors.utils import extract_boxes
from app.models.frame import Frame
from app.schemas.detection import DetectedObject

logger = get_logger(__name__)


class YoloDetector(UltralyticsDetector, Detector):
    """Ultralytics YOLOv8 + ByteTrack detector."""

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.35,
        iou: float = 0.45,
        tracker: str = "bytetrack.yaml",
        device: str = "cpu",
    ) -> None:
        super().__init__(
            model_path=model_path,
            confidence=confidence,
            iou=iou,
            device=device,
        )
        self._tracker = tracker

    def detect(self, frame: Frame, camera_id: str) -> list[DetectedObject]:
        if not self._ready or self._model is None:
            return []

        with self._lock:
            # ``track`` with ``persist=True`` maintains ByteTrack state across
            # calls, yielding stable ids. ``verbose=False`` keeps logs clean.
            results = self._model.track(
                source=frame.image,
                persist=True,
                conf=self._confidence,
                iou=self._iou,
                tracker=self._tracker,
                device=self._device,
                verbose=False,
            )

        if not results:
            return []
        return self._parse(results[0])

    def _parse(self, result) -> list[DetectedObject]:
        """Convert an Ultralytics result into wire-contract objects."""
        extracted = extract_boxes(result, with_ids=True)
        if extracted is None:
            return []

        objects: list[DetectedObject] = []
        for i in range(len(extracted.xyxy)):
            x1, y1, x2, y2 = extracted.xyxy[i]
            cls_idx = int(extracted.clss[i]) if len(extracted.clss) else -1
            track_id = int(extracted.ids[i]) if extracted.ids is not None and extracted.ids[i] is not None else -1
            objects.append(
                DetectedObject(
                    id=track_id,
                    **{"class": self._names.get(cls_idx, str(cls_idx))},
                    confidence=round(float(extracted.confs[i]) if len(extracted.confs) else 0.0, 3),
                    x1=int(x1),
                    y1=int(y1),
                    x2=int(x2),
                    y2=int(y2),
                )
            )
        return objects
