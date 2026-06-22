"""WebRTC frame source — backend ingest for "Browser Camera Mode" (development).

A browser captures its webcam with ``getUserMedia`` and publishes it to the
backend over WebRTC (WHIP). The negotiated inbound video track is handed to this
source, which decodes each frame to a BGR ndarray and keeps only the latest one
— exactly like the RTSP reader, so the detection pipeline is unchanged.

This removes the need for FFmpeg / a local MediaMTX during development. In
production the RTSP path (:class:`StreamReader`) is used instead; this source is
selected only when ``INGEST_MODE=webrtc``.

``aiortc`` (and PyAV) are imported lazily by the ingest API, not here, so a
production RTSP deployment never needs those dependencies installed.
"""

from __future__ import annotations

import asyncio
import time

from app.core.logging import get_logger
from app.models.frame import Frame
from app.stream.base import FrameSource

logger = get_logger(__name__)


class WebRTCFrameSource(FrameSource):
    """Latest-frame-only source fed by an inbound WebRTC video track."""

    def __init__(self, camera_id: str, stale_after: float = 5.0) -> None:
        self.camera_id = camera_id
        self._stale_after = stale_after

        self._latest: Frame | None = None
        self._sequence = 0
        self._consume_task: asyncio.Task | None = None
        self._connected = False

        self._fps = 0.0
        self._frame_times: list[float] = []

    # ------------------------------------------------------------------ #
    # FrameSource lifecycle
    # ------------------------------------------------------------------ #
    def start(self) -> None:
        # Nothing to do until a browser publishes a track; we simply wait.
        logger.info("WebRTC source ready (awaiting publisher)",
                    extra={"camera_id": self.camera_id})

    def stop(self) -> None:
        self.detach()

    # ------------------------------------------------------------------ #
    # Track attachment (called by the WHIP ingest endpoint)
    # ------------------------------------------------------------------ #
    def attach_track(self, track) -> None:
        """Begin consuming frames from an inbound aiortc video track.

        Any previously attached track is replaced — a fresh "Start Camera"
        click simply takes over.
        """
        self.detach()
        self._connected = True
        self._consume_task = asyncio.create_task(
            self._consume(track), name=f"webrtc-consume-{self.camera_id}"
        )
        logger.info("WebRTC track attached", extra={"camera_id": self.camera_id})

    def detach(self) -> None:
        """Stop consuming the current track (publisher disconnected/stopped)."""
        if self._consume_task and not self._consume_task.done():
            self._consume_task.cancel()
        self._consume_task = None
        self._connected = False

    async def _consume(self, track) -> None:
        """Read frames from the track until it ends, keeping only the latest."""
        try:
            while True:
                frame = await track.recv()
                # Convert PyAV VideoFrame → BGR ndarray (what OpenCV/YOLO expect).
                image = frame.to_ndarray(format="bgr24")
                self._store(image)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - track ended or decode failed
            logger.info("WebRTC track ended", extra={"camera_id": self.camera_id})
        finally:
            self._connected = False

    # ------------------------------------------------------------------ #
    # Consumer API
    # ------------------------------------------------------------------ #
    def get_latest(self) -> Frame | None:
        return self._latest

    @property
    def fps(self) -> float:
        return round(self._fps, 1)

    @property
    def is_online(self) -> bool:
        if not self._connected or self._latest is None:
            return False
        return (time.time() - self._latest.capture_ts) <= self._stale_after

    @property
    def status(self) -> str:
        if self.is_online:
            return "online"
        return "connecting"  # waiting for / reconnecting a browser publisher

    # ------------------------------------------------------------------ #
    # Internal
    # ------------------------------------------------------------------ #
    def _store(self, image) -> None:
        self._sequence += 1
        # Replacing the reference is atomic; the executor may hold an older
        # Frame object safely while we publish a newer one.
        self._latest = Frame(image=image, sequence=self._sequence)
        self._update_fps()

    def _update_fps(self) -> None:
        now = time.time()
        self._frame_times.append(now)
        cutoff = now - 1.0
        self._frame_times = [t for t in self._frame_times if t >= cutoff]
        self._fps = float(len(self._frame_times))
