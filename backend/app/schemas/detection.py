"""Pydantic schemas for the ``/ws/detections`` channel and REST detection APIs.

These define the *wire contract* between backend and frontend. Coordinates are
in the resolution of the frame the model ran on (e.g. 640x480); the frontend is
responsible for scaling them to the displayed video size.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class DetectedObject(BaseModel):
    """A single detected + tracked object within a frame."""

    id: int = Field(description="Stable ByteTrack tracking id. -1 if untracked.")
    cls: str = Field(alias="class", description="Class label, e.g. 'person'.")
    confidence: float = Field(ge=0.0, le=1.0, description="Detection confidence.")
    x1: int = Field(description="Top-left x in source-frame pixels.")
    y1: int = Field(description="Top-left y in source-frame pixels.")
    x2: int = Field(description="Bottom-right x in source-frame pixels.")
    y2: int = Field(description="Bottom-right y in source-frame pixels.")

    model_config = {"populate_by_name": True}


class DetectionMessage(BaseModel):
    """Payload pushed over ``/ws/detections`` and returned by REST.

    Always carries ``cameraId`` so the frontend can route detections to the
    correct camera view in a multi-camera deployment.
    """

    cameraId: str = Field(description="Camera that produced these detections.")
    timestamp: int = Field(description="Capture time, epoch milliseconds.")
    frameWidth: int = Field(description="Width of the frame detection ran on.")
    frameHeight: int = Field(description="Height of the frame detection ran on.")
    objects: list[DetectedObject] = Field(default_factory=list)
