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

from app.core.config import CameraConfig, Settings
from app.core.logging import get_logger
from app.detectors.lane import LaneSegmenter
from app.detectors.pothole import PotholeDetector
from app.detectors.yolo import YoloDetector
from app.schemas.detection import DetectionMessage, LaneSegment, PotholeObject
from app.schemas.metrics import CameraMetrics, StreamInfo
from app.services.metrics import MetricsTracker
from app.stream.base import FrameSource
from app.stream.reader import StreamReader
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
    ) -> None:
        self.camera = camera
        self._settings = settings
        self._detections_ws = detections_ws
        self._metrics_ws = metrics_ws

        # Select the frame source by ingest mode (per-camera override wins).
        mode = (camera.ingest_mode or settings.ingest_mode).lower()
        self.ingest_mode = mode
        self.source: FrameSource
        if mode == "webrtc":
            # Development: frames arrive from a browser via the WHIP endpoint.
            self.source = WebRTCFrameSource(
                camera_id=camera.camera_id,
                stale_after=settings.stream_stale_after,
            )
        else:
            # Production: pull RTSP from MediaMTX.
            self.source = StreamReader(
                camera_id=camera.camera_id,
                stream_url=camera.stream_url,
                reconnect_delay=settings.stream_reconnect_delay,
                stale_after=settings.stream_stale_after,
            )
        self.detector = YoloDetector(
            model_path=settings.model,
            confidence=settings.confidence_threshold,
            iou=settings.iou_threshold,
            tracker=settings.tracker,
            device=settings.device,
        )
        # Potholes run every frame; lanes run on a slower cadence (see
        # _detection_loop). Each is optional and gated by a config flag so
        # deployments can drop either one.
        self.pothole_detector = (
            PotholeDetector(
                model_path=settings.pothole_model,
                confidence=settings.pothole_confidence,
                iou=settings.iou_threshold,
                imgsz=settings.pothole_imgsz,
                roi_top=settings.pothole_roi_top,
                device=settings.device,
            )
            if settings.enable_pothole
            else None
        )
        self.lane_segmenter = (
            LaneSegmenter(
                model_path=settings.lane_model,
                confidence=settings.lane_confidence,
                imgsz=settings.lane_imgsz,
                device=settings.device,
                point_stride=settings.lane_point_stride,
            )
            if settings.enable_lane
            else None
        )
        self.metrics = MetricsTracker()

        self._latest_detection: DetectionMessage | None = None
        # Potholes are detected every frame; lanes are cached and re-sent every
        # tick between their slower refreshes.
        self._latest_potholes: list[PotholeObject] = []
        self._latest_lanes: list[LaneSegment] = []
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
        if self.pothole_detector is not None:
            await loop.run_in_executor(None, self.pothole_detector.load)
        if self.lane_segmenter is not None:
            await loop.run_in_executor(None, self.lane_segmenter.load)
        self.source.start()
        self._running = True
        self._tasks = [
            asyncio.create_task(self._detection_loop(), name=f"detect-{self.camera.camera_id}"),
            asyncio.create_task(self._metrics_loop(), name=f"metrics-{self.camera.camera_id}"),
        ]
        logger.info("Pipeline started", extra={"camera_id": self.camera.camera_id})

    async def stop(self) -> None:
        self._running = False
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
        while self._running:
            tick = time.perf_counter()
            frame = self.source.get_latest()
            if frame is not None:
                started = time.perf_counter()
                # Run blocking inference in a worker thread so reading never stalls.
                objects = await loop.run_in_executor(
                    None, self.detector.detect, frame, self.camera.camera_id
                )

                # Potholes run *every* frame, on the same frame as object
                # detection, so hazards stay glued to the live scene instead of
                # lagging behind on a slow refresh cadence.
                if self.pothole_detector is not None:
                    self._latest_potholes = await loop.run_in_executor(
                        None, self.pothole_detector.detect, frame, self.camera.camera_id
                    )

                latency_ms = (time.perf_counter() - started) * 1000.0

                # Lanes are static and cheap to re-use, so they keep their own
                # slower cadence; the cached result is re-attached every message.
                await self._maybe_run_lanes(loop, frame, tick)

                message = DetectionMessage(
                    cameraId=self.camera.camera_id,
                    timestamp=int(frame.capture_ts * 1000),
                    frameWidth=frame.width,
                    frameHeight=frame.height,
                    objects=objects,
                    potholes=self._latest_potholes,
                    lanes=self._latest_lanes,
                )
                self._latest_detection = message
                self.metrics.record_detection(latency_ms, len(objects))
                await self._detections_ws.broadcast(
                    self.camera.camera_id, message.model_dump(by_alias=True)
                )

            # Pace to the configured detection FPS without drift.
            elapsed = time.perf_counter() - tick
            await asyncio.sleep(max(0.0, interval - elapsed))

    async def _maybe_run_lanes(
        self, loop: asyncio.AbstractEventLoop, frame, now: float
    ) -> None:
        """Refresh the lane cache when its refresh interval has elapsed.

        Cadence is wall-clock based (``lane_refresh_seconds``) so it is
        independent of DETECTION_FPS and the camera frame rate. It runs in the
        worker-thread executor (blocking torch inference) and only when enabled
        and due, so the per-tick cost stays low and ingestion is never blocked.
        ``now`` is a ``perf_counter`` timestamp shared with the loop's pacing
        clock. (Potholes run every frame in the detection loop, not here.)
        """
        if (
            self.lane_segmenter is not None
            and now - self._last_lane_ts >= self._settings.lane_refresh_seconds
        ):
            self._last_lane_ts = now
            self._latest_lanes = await loop.run_in_executor(
                None, self.lane_segmenter.detect, frame, self.camera.camera_id
            )

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
            streamUrl=self.camera.stream_url,
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
