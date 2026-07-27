"""Single-camera detection pipeline.

Wires the stages together for one camera:

    RTSP ─► StreamReader(thread) ─► latest frame ─► YOLO+ByteTrack(executor)
         ─► DetectionMessage ─► /ws/detections     and     /ws/metrics

Two independent async loops run per camera:

* **detection loop** — sized to ``DETECTION_FPS``; always grabs the *latest*
  frame (stale frames discarded), runs inference off the event loop in a thread
  executor so ingestion is never blocked, then publishes detections.
* **metrics loop** — ~1 Hz; publishes stream/detection health to ``/ws/metrics``.

Per-camera instances mean tracker state and metrics never bleed across cameras,
which is what makes adding ``carcam2``/``carcam3`` a config change, not a rewrite.
"""

from __future__ import annotations

import asyncio
import time
import concurrent.futures

from app.core.config import CameraConfig, Settings
from app.core.logging import get_logger
from app.detectors.lane import LaneSegmenter
from app.detectors.pothole import PotholeDetector
from app.detectors.yolo import YoloDetector
from app.schemas.detection import DetectionMessage, LaneSegment, PotholeObject
from app.schemas.metrics import CameraMetrics, StreamInfo
from app.services.metrics import MetricsTracker
from app.stream.base import FrameSource
from app.stream.webrtc_source import WebRTCFrameSource
from app.websocket.manager import ConnectionManager

logger = get_logger(__name__)


class CameraPipeline:
    """Owns the full ingest → detect → publish flow for one camera."""

    def __init__(
        self,
        camera: CameraConfig,
        settings: Settings,
        detections_ws: ConnectionManager,
        metrics_ws: ConnectionManager,
        pothole_detector: PotholeDetector | None = None,
        lane_segmenter: LaneSegmenter | None = None,
        radar_service = None,
    ) -> None:
        self.camera = camera
        self._settings = settings
        self._detections_ws = detections_ws
        self._metrics_ws = metrics_ws
        self._radar_service = radar_service

        self.source = WebRTCFrameSource(
            camera_id=camera.camera_id,
            stale_after=settings.stream_stale_after,
        )
        self.detector = YoloDetector(
            model_path=settings.model,
            confidence=settings.confidence_threshold,
            iou=settings.iou_threshold,
            tracker=settings.tracker,
            device=settings.device,
        )
        self.pothole_detector = pothole_detector
        self.lane_segmenter = lane_segmenter
        self.metrics = MetricsTracker()
        
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=3, thread_name_prefix=f"detect-{camera.camera_id}"
        )
        self._pothole_disabled = False
        self._lane_disabled = False
        self._pothole_failures = 0
        self._lane_failures = 0

        self._latest_detection: DetectionMessage | None = None
        self._blackboard_objects: list[DetectedObject] = []
        self._blackboard_potholes: list[PotholeObject] = []
        self._blackboard_lanes: list[LaneSegment] = []
        self._blackboard_ts = 0.0
        self._blackboard_velocities: dict[int, tuple[float, float]] = {}
        self._blackboard_frame_w = 0
        self._blackboard_frame_h = 0
        # perf_counter timestamp of the last lane run (0 => never run).
        self._last_lane_ts = 0.0
        self._tasks: list[asyncio.Task] = []
        self._running = False

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        """Load the model, start the reader thread and the async loops."""
        loop = asyncio.get_running_loop()
        # Model load is blocking (torch); keep the event loop responsive.
        await loop.run_in_executor(None, self.detector.load)
        self.source.start()
        self._running = True
        self._tasks = [
            asyncio.create_task(self._detection_loop(), name=f"detect-{self.camera.camera_id}"),
            asyncio.create_task(self._metrics_loop(), name=f"metrics-{self.camera.camera_id}"),
            asyncio.create_task(self._telemetry_loop(), name=f"telemetry-{self.camera.camera_id}"),
        ]
        logger.info("Pipeline started", extra={"camera_id": self.camera.camera_id})

    async def stop(self) -> None:
        self._running = False
        self._executor.shutdown(wait=False)
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self.source.stop()
        logger.info("Pipeline stopped", extra={"camera_id": self.camera.camera_id})

    # ------------------------------------------------------------------ #
    # Detection loop
    # ------------------------------------------------------------------ #
    async def _detection_loop(self) -> None:
        loop = asyncio.get_running_loop()
        interval = self._settings.detection_interval
        
        async def _safe_pothole(frame):
            if self._pothole_disabled:
                return self._blackboard_potholes
            try:
                res = await loop.run_in_executor(self._executor, self.pothole_detector.detect, frame, self.camera.camera_id)
                self._pothole_failures = 0
                return res
            except Exception as e:
                logger.error(f"Pothole detector failed: {e}")
                self._pothole_failures += 1
                if self._pothole_failures > 5:
                    self._pothole_disabled = True
                return self._blackboard_potholes

        async def _safe_lane(frame):
            if self._lane_disabled:
                return self._blackboard_lanes
            try:
                res = await loop.run_in_executor(self._executor, self.lane_segmenter.detect, frame, self.camera.camera_id)
                self._lane_failures = 0
                return res
            except Exception as e:
                logger.error(f"Lane segmenter failed: {e}")
                self._lane_failures += 1
                if self._lane_failures > 5:
                    self._lane_disabled = True
                return self._blackboard_lanes

        while self._running:
            tick = time.perf_counter()
            frame = self.source.get_latest()
            if frame is not None:
                max_age_ms = self._settings.detection_interval * 2000.0
                if frame.age_ms > max_age_ms:
                    await asyncio.sleep(0.01)
                    continue

                started = time.perf_counter()
                
                futures = [
                    loop.run_in_executor(self._executor, self.detector.detect, frame, self.camera.camera_id)
                ]
                
                run_pothole = self.pothole_detector is not None
                if run_pothole:
                    futures.append(_safe_pothole(frame))
                
                run_lane = self.lane_segmenter is not None and (tick - self._last_lane_ts >= self._settings.lane_refresh_seconds)
                if run_lane:
                    futures.append(_safe_lane(frame))
                    
                results = await asyncio.gather(*futures)
                
                objects = results[0]
                idx = 1
                if run_pothole:
                    self._blackboard_potholes = results[idx]
                    idx += 1
                if run_lane:
                    self._blackboard_lanes = results[idx]
                    self._last_lane_ts = tick
                    
                latency_ms = (time.perf_counter() - started) * 1000.0

                # -- Velocity Calculation (Linear Extrapolation) --
                current_ts = time.perf_counter()
                dt = current_ts - self._blackboard_ts if self._blackboard_ts > 0 else 0.01
                new_velocities = {}
                old_positions = {obj.id: obj for obj in self._blackboard_objects if obj.id >= 0}
                
                for obj in objects:
                    if obj.id >= 0:
                        if obj.id in old_positions:
                            old_obj = old_positions[obj.id]
                            # Pixels per second
                            vx = ((obj.x1 + obj.x2) / 2 - (old_obj.x1 + old_obj.x2) / 2) / dt
                            vy = ((obj.y1 + obj.y2) / 2 - (old_obj.y1 + old_obj.y2) / 2) / dt
                            new_velocities[obj.id] = (vx, vy)
                        else:
                            new_velocities[obj.id] = (0.0, 0.0)

                self._blackboard_objects = objects
                self._blackboard_velocities = new_velocities
                self._blackboard_frame_w = frame.width
                self._blackboard_frame_h = frame.height
                self._blackboard_ts = current_ts

                self.metrics.record_detection(latency_ms, len(objects))

            # Pace to the configured detection FPS without drift.
            elapsed = time.perf_counter() - tick
            await asyncio.sleep(max(0.0, interval - elapsed))

    # ------------------------------------------------------------------ #
    # Telemetry loop
    # ------------------------------------------------------------------ #
    async def _telemetry_loop(self) -> None:
        """Runs at 60Hz. Extrapolates bounding boxes, fetches latest radar distance, checks alerts."""
        interval = 1.0 / 60.0
        while self._running:
            tick = time.perf_counter()
            if self._blackboard_ts > 0:
                dt = tick - self._blackboard_ts
                
                # 1. Extrapolate objects
                extrapolated_objects = []
                for obj in self._blackboard_objects:
                    vx, vy = self._blackboard_velocities.get(obj.id, (0.0, 0.0))
                    # Prevent over-extrapolation if YOLO hangs (cap dt at 0.5s)
                    safe_dt = min(dt, 0.5)
                    dx = int(vx * safe_dt)
                    dy = int(vy * safe_dt)
                    
                    # Copy and shift
                    new_obj = obj.model_copy()
                    new_obj.x1 += dx
                    new_obj.x2 += dx
                    new_obj.y1 += dy
                    new_obj.y2 += dy
                    extrapolated_objects.append(new_obj)
                
                # 2. Radar Fusion & Alerts
                radar_distance = None
                alerts = []
                if self._radar_service:
                    radar_distance = self._radar_service.get_latest_distance()
                    
                if radar_distance is not None:
                    # Forward Collision Warning
                    frame = self._radar_service.get_latest_frame()
                    if radar_distance < 2.5 and frame:
                        max_energy = max(frame.moving_energy, frame.static_energy)
                        if max_energy > 40:
                            alerts.append("FORWARD COLLISION WARNING")
                        
                    if extrapolated_objects:
                        largest_obj = max(extrapolated_objects, key=lambda o: (o.x2 - o.x1) * (o.y2 - o.y1))
                        largest_obj.radar_distance = radar_distance
                
                # 3. Broadcast
                message = DetectionMessage(
                    cameraId=self.camera.camera_id,
                    timestamp=int(time.time() * 1000),
                    frameWidth=self._blackboard_frame_w,
                    frameHeight=self._blackboard_frame_h,
                    objects=extrapolated_objects,
                    potholes=self._blackboard_potholes,
                    lanes=self._blackboard_lanes,
                    alerts=alerts,
                )
                self._latest_detection = message
                await self._detections_ws.broadcast(
                    self.camera.camera_id, message.model_dump(by_alias=True)
                )

            elapsed = time.perf_counter() - tick
            await asyncio.sleep(max(0.0, interval - elapsed))

    # ------------------------------------------------------------------ #
    # Metrics loop
    # ------------------------------------------------------------------ #
    async def _metrics_loop(self) -> None:
        while self._running:
            await self._metrics_ws.broadcast(
                self.camera.camera_id, self.current_metrics().model_dump()
            )
            await asyncio.sleep(1.0)

    # ------------------------------------------------------------------ #
    # Snapshots for REST
    # ------------------------------------------------------------------ #
    def current_metrics(self) -> CameraMetrics:
        return CameraMetrics(
            cameraId=self.camera.camera_id,
            streamStatus=self.source.status,  # type: ignore[arg-type]
            streamFps=self.source.fps,
            detectionFps=self.metrics.detection_fps,
            latencyMs=self.metrics.latency_ms,
            trackedObjects=self.metrics.tracked_objects,
            uptimeSeconds=self.metrics.uptime_seconds,
        )

    def stream_info(self) -> StreamInfo:
        return StreamInfo(
            cameraId=self.camera.camera_id,
            name=self.camera.resolved_name(),
            status=self.source.status,  # type: ignore[arg-type]
            streamFps=self.source.fps,
            detectionFps=self.metrics.detection_fps,
        )

    @property
    def latest_detection(self) -> DetectionMessage | None:
        return self._latest_detection

    @property
    def is_ready(self) -> bool:
        return self.detector.is_ready
