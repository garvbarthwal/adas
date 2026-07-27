"""Lane-line segmenter (Ultralytics segmentation model).

Wraps ``best_lane.pt`` which segments lane markings into two classes
(``Broken_Line_Lane`` / ``Solid_Line_Lane``). The model returns polygon masks
rather than boxes, so this detector emits :class:`LaneSegment` polygons in full
source-frame pixels for the frontend to draw as polylines.

Runs on the *full* frame (lane lines extend toward the horizon, so a lower-only
ROI would clip them) but at a reduced ``imgsz`` to stay cheap, on a slower
cadence than object detection.
"""

from __future__ import annotations

import threading

from app.core.logging import get_logger
from app.detectors.base import UltralyticsDetector
from app.detectors.utils import extract_boxes
from app.models.frame import Frame
from app.schemas.detection import LaneSegment

logger = get_logger(__name__)


class LaneSegmenter(UltralyticsDetector):
    """Ultralytics segmentation model for lane lines."""

    def __init__(
        self,
        model_path: str,
        confidence: float = 0.35,
        imgsz: int = 384,
        device: str = "cpu",
        point_stride: int = 3,
    ) -> None:
        super().__init__(
            model_path=model_path,
            confidence=confidence,
            device=device,
        )
        self._imgsz = imgsz
        # Keep every Nth polygon vertex to shrink the WS payload; the shape is
        # visually identical at display scale.
        self._point_stride = max(1, point_stride)

    def detect(self, frame: Frame, camera_id: str) -> list[LaneSegment]:
        if not self._ready or self._model is None:
            return []

        with self._lock:
            results = self._model.predict(
                source=frame.image,
                imgsz=self._imgsz,
                conf=self._confidence,
                device=self._device,
                verbose=False,
            )

        if not results:
            return []
        return self._parse(results[0])

    def _parse(self, result) -> list[LaneSegment]:
        """Convert segmentation masks into wire-contract lane polygons."""
        masks = getattr(result, "masks", None)
        extracted = extract_boxes(result)
        if masks is None or extracted is None:
            return []

        # masks.xy is a list of (N, 2) float arrays in original-frame pixels.
        polygons = masks.xy

        lanes: list[LaneSegment] = []
        for i, poly in enumerate(polygons):
            if poly is None or len(poly) == 0:
                continue
            pts = [[int(x), int(y)] for x, y in poly[:: self._point_stride]]
            if len(pts) < 2:
                continue
            cls_idx = int(extracted.clss[i]) if len(extracted.clss) > i else -1
            lanes.append(
                LaneSegment(
                    **{"class": self._names.get(cls_idx, str(cls_idx))},
                    confidence=round(float(extracted.confs[i]) if len(extracted.confs) > i else 0.0, 3),
                    points=pts,
                )
            )
        return lanes
