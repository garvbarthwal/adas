"""Frame source abstraction.

The detection pipeline consumes frames through this interface and does not care
*where* they come from. Two implementations exist:

* :class:`app.stream.reader.StreamReader` — pulls RTSP from MediaMTX (production,
  Raspberry Pi → FFmpeg → MediaMTX → backend).
* :class:`app.stream.webrtc_source.WebRTCFrameSource` — receives frames published
  directly from a browser via WebRTC (development "Browser Camera Mode", no
  FFmpeg / MediaMTX needed).

Both keep **only the latest frame** so the low-latency, no-backlog contract holds
regardless of source.
"""

from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod
from collections import deque

from app.models.frame import Frame


class FrameSource(ABC):
    """A source of the most-recent camera frame.
    
    Provides concrete shared state for subclasses to store and retrieve frames,
    maintain rolling FPS estimates, and check freshness.
    """

    def __init__(self, stale_after: float = 5.0) -> None:
        self._stale_after = stale_after
        self._sequence: int = 0
        self._latest: Frame | None = None
        self._lock = threading.Lock()
        self._fps: float = 0.0
        self._frame_times: deque[float] = deque()

    @abstractmethod
    def start(self) -> None:
        """Begin producing frames (idempotent)."""

    @abstractmethod
    def stop(self) -> None:
        """Stop producing frames and release resources."""

    def get_latest(self) -> Frame | None:
        """Return the most recent frame, or ``None`` if none yet. Non-blocking."""
        with self._lock:
            return self._latest

    @property
    def fps(self) -> float:
        """Rolling estimate of frames produced per second."""
        return round(self._fps, 1)

    @property
    def is_online(self) -> bool:
        """True when connected and producing fresh frames."""
        with self._lock:
            latest = self._latest
        if latest is None:
            return False
        return (time.time() - latest.capture_ts) <= self._stale_after

    @property
    def status(self) -> str:
        """``"online"`` | ``"connecting"`` | ``"offline"``."""
        if self.is_online:
            return "online"
        return "connecting"

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
        cutoff = now - 1.0
        while self._frame_times and self._frame_times[0] < cutoff:
            self._frame_times.popleft()
        self._fps = float(len(self._frame_times))
