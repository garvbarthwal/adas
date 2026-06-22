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
from app.detectors.base import Detector
from app.models.frame import Frame
from app.schemas.detection import DetectedObject

logger = get_logger(__name__)


class YoloDetector(Detector):
    """Ultralytics YOLOv8 + ByteTrack detector."""

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.35,
        iou: float = 0.45,
        tracker: str = "bytetrack.yaml",
        device: str = "cpu",
    ) -> None:
        self._model_path = model_path
        self._confidence = confidence
        self._iou = iou
        self._tracker = tracker
        self._device = device

        self._model = None  # type: ignore[assignment]
        self._names: dict[int, str] = {}
        self._ready = False
        # Inference is not thread-safe; serialize calls per detector instance.
        self._lock = threading.Lock()

    def load(self) -> None:
        # Imported lazily so the module imports cheaply (and unit tests / health
        # tooling don't pull in torch unless detection is actually used).
        from ultralytics import YOLO

        logger.info("Loading YOLO model", extra={"model": self._model_path})
        self._model = YOLO(self._model_path)
        self._names = dict(self._model.names)
        self._ready = True
        logger.info("YOLO model loaded", extra={"classes": len(self._names)})

    @property
    def is_ready(self) -> bool:
        return self._ready

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
        boxes = getattr(result, "boxes", None)
        if boxes is None or boxes.xyxy is None or len(boxes) == 0:
            return []

        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy() if boxes.conf is not None else []
        clss = boxes.cls.cpu().numpy() if boxes.cls is not None else []
        ids = (
            boxes.id.cpu().numpy()
            if getattr(boxes, "id", None) is not None
            else [None] * len(xyxy)
        )

        objects: list[DetectedObject] = []
        for i in range(len(xyxy)):
            x1, y1, x2, y2 = xyxy[i]
            cls_idx = int(clss[i]) if len(clss) else -1
            objects.append(
                DetectedObject(
                    id=int(ids[i]) if ids[i] is not None else -1,
                    **{"class": self._names.get(cls_idx, str(cls_idx))},
                    confidence=round(float(confs[i]) if len(confs) else 0.0, 3),
                    x1=int(x1),
                    y1=int(y1),
                    x2=int(x2),
                    y2=int(y2),
                )
            )
        return objects
