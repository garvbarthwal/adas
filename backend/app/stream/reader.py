"""RTSP stream reader.

A dedicated daemon thread continuously reads frames from an RTSP source and
keeps **only the most recent frame**. This is the heart of the low-latency
design: no queues, no backlog. A slow consumer (the YOLO worker) simply skips
intermediate frames instead of falling behind.

    RTSP ──► [reader thread] ──► latest_frame (single slot, lock-protected)

The reader never blocks the consumer and the consumer never blocks the reader.
On any read failure the thread tears down the capture and reconnects with a
fixed backoff, so transient network / MediaMTX restarts self-heal.
"""

from __future__ import annotations

import threading
import time

import cv2

from app.core.logging import get_logger
from app.models.frame import Frame
from app.stream.base import FrameSource

logger = get_logger(__name__)


class StreamReader(FrameSource):
    """Threaded, self-reconnecting, latest-frame-only RTSP reader."""

    def __init__(
        self,
        camera_id: str,
        stream_url: str,
        reconnect_delay: float = 2.0,
        stale_after: float = 5.0,
    ) -> None:
        self.camera_id = camera_id
        self.stream_url = stream_url
        self._reconnect_delay = reconnect_delay
        self._stale_after = stale_after

        self._lock = threading.Lock()
        self._latest: Frame | None = None
        self._sequence = 0

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._connected = False

        # Rolling FPS estimate for the read loop.
        self._fps = 0.0
        self._last_read_ts = 0.0
        self._frame_times: list[float] = []

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    def start(self) -> None:
        """Start the background read thread (idempotent)."""
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name=f"stream-{self.camera_id}", daemon=True
        )
        self._thread.start()
        logger.info("Stream reader started", extra={"camera_id": self.camera_id})

    def stop(self) -> None:
        """Signal the read thread to stop and wait for it to exit."""
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5.0)
        logger.info("Stream reader stopped", extra={"camera_id": self.camera_id})

    # ------------------------------------------------------------------ #
    # Consumer API
    # ------------------------------------------------------------------ #
    def get_latest(self) -> Frame | None:
        """Return the most recent frame (or ``None`` if none yet).

        Thread-safe and non-blocking. The consumer reads at its own pace; older
        frames are silently dropped.
        """
        with self._lock:
            return self._latest

    @property
    def fps(self) -> float:
        """Rolling estimate of frames read per second."""
        return round(self._fps, 1)

    @property
    def is_online(self) -> bool:
        """True if connected and a fresh frame arrived recently."""
        if not self._connected:
            return False
        with self._lock:
            latest = self._latest
        if latest is None:
            return False
        return (time.time() - latest.capture_ts) <= self._stale_after

    @property
    def status(self) -> str:
        if self.is_online:
            return "online"
        return "connecting" if not self._stop.is_set() else "offline"

    # ------------------------------------------------------------------ #
    # Internal
    # ------------------------------------------------------------------ #
    def _open_capture(self) -> cv2.VideoCapture | None:
        """Open the RTSP capture, preferring low-latency transport settings."""
        # Prefer TCP transport for reliability over lossy links.
        cap = cv2.VideoCapture(self.stream_url, cv2.CAP_FFMPEG)
        # Keep OpenCV's internal buffer tiny so we always read fresh frames.
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except cv2.error:  # pragma: no cover - backend dependent
            pass
        if not cap.isOpened():
            cap.release()
            return None
        return cap

    def _run(self) -> None:
        """Read loop with automatic reconnection."""
        while not self._stop.is_set():
            self._connected = False
            cap = self._open_capture()
            if cap is None:
                logger.warning(
                    "Stream connect failed, retrying",
                    extra={"camera_id": self.camera_id, "url": self.stream_url},
                )
                self._wait_backoff()
                continue

            logger.info("Stream connected", extra={"camera_id": self.camera_id})
            self._connected = True

            while not self._stop.is_set():
                ok, image = cap.read()
                if not ok or image is None:
                    logger.warning(
                        "Stream read failed, reconnecting",
                        extra={"camera_id": self.camera_id},
                    )
                    break
                self._store(image)

            cap.release()
            self._connected = False
            if not self._stop.is_set():
                self._wait_backoff()

    def _store(self, image) -> None:
        """Atomically replace the latest frame and update FPS stats."""
        self._sequence += 1
        frame = Frame(image=image, sequence=self._sequence)
        with self._lock:
            self._latest = frame
        self._update_fps()

    def _update_fps(self) -> None:
        now = time.time()
        self._frame_times.append(now)
        # Keep ~1s sliding window.
        cutoff = now - 1.0
        self._frame_times = [t for t in self._frame_times if t >= cutoff]
        self._fps = float(len(self._frame_times))

    def _wait_backoff(self) -> None:
        self._stop.wait(self._reconnect_delay)
