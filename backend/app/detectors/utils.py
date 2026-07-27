"""Shared utilities for Ultralytics detector parsing.

Extracts the common tensor-to-numpy conversion boilerplate that all three
detectors (YOLO, pothole, lane) repeat identically.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(slots=True)
class ExtractedBoxes:
    """Numpy arrays extracted from an Ultralytics result."""
    xyxy: np.ndarray
    confs: np.ndarray
    clss: np.ndarray
    ids: np.ndarray | None


def extract_boxes(result, *, with_ids: bool = False) -> ExtractedBoxes | None:
    """Extract box data from an Ultralytics result.

    Returns ``None`` when there are no detections. ``with_ids=True`` extracts
    ByteTrack tracking ids (used by the YOLO detector only).
    """
    boxes = getattr(result, "boxes", None)
    if boxes is None or boxes.xyxy is None or len(boxes) == 0:
        return None

    xyxy = boxes.xyxy.cpu().numpy()
    confs = boxes.conf.cpu().numpy() if boxes.conf is not None else np.array([])
    clss = boxes.cls.cpu().numpy() if boxes.cls is not None else np.array([])
    ids = None
    if with_ids:
        ids = (
            boxes.id.cpu().numpy()
            if getattr(boxes, "id", None) is not None
            else None
        )
    return ExtractedBoxes(xyxy=xyxy, confs=confs, clss=clss, ids=ids)
