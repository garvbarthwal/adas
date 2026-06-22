"""REST API routes.

    GET /health            liveness/readiness probe (Docker/EC2/LB)
    GET /metrics           per-camera runtime metrics
    GET /streams           configured streams + status
    GET /latest-detections most recent detections per camera
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_manager
from app.schemas.detection import DetectionMessage
from app.schemas.metrics import CameraMetrics, HealthResponse, StreamInfo
from app.services.manager import PipelineManager

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health(manager: PipelineManager = Depends(get_manager)) -> HealthResponse:
    """Aggregate health across all camera pipelines."""
    return manager.health()


@router.get("/metrics", response_model=list[CameraMetrics], tags=["system"])
def metrics(
    cameraId: str | None = Query(default=None, description="Filter to one camera."),
    manager: PipelineManager = Depends(get_manager),
) -> list[CameraMetrics]:
    """Current metrics for every camera (or a single one via ``cameraId``)."""
    pipelines = manager.all()
    if cameraId:
        pipeline = manager.get(cameraId)
        if pipeline is None:
            raise HTTPException(status_code=404, detail="Unknown cameraId")
        pipelines = [pipeline]
    return [p.current_metrics() for p in pipelines]


@router.get("/streams", response_model=list[StreamInfo], tags=["streams"])
def streams(manager: PipelineManager = Depends(get_manager)) -> list[StreamInfo]:
    """List configured streams and their live status."""
    return manager.streams()


@router.get(
    "/latest-detections",
    response_model=list[DetectionMessage],
    tags=["detections"],
)
def latest_detections(
    cameraId: str | None = Query(default=None, description="Filter to one camera."),
    manager: PipelineManager = Depends(get_manager),
) -> list[DetectionMessage]:
    """Most recent detection message per camera (empty if none yet)."""
    pipelines = manager.all()
    if cameraId:
        pipeline = manager.get(cameraId)
        if pipeline is None:
            raise HTTPException(status_code=404, detail="Unknown cameraId")
        pipelines = [pipeline]
    return [p.latest_detection for p in pipelines if p.latest_detection is not None]
