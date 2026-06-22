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

from abc import ABC, abstractmethod

from app.models.frame import Frame


class FrameSource(ABC):
    """A source of the most-recent camera frame."""

    @abstractmethod
    def start(self) -> None:
        """Begin producing frames (idempotent)."""

    @abstractmethod
    def stop(self) -> None:
        """Stop producing frames and release resources."""

    @abstractmethod
    def get_latest(self) -> Frame | None:
        """Return the most recent frame, or ``None`` if none yet. Non-blocking."""

    @property
    @abstractmethod
    def fps(self) -> float:
        """Rolling estimate of frames produced per second."""

    @property
    @abstractmethod
    def is_online(self) -> bool:
        """True when connected and producing fresh frames."""

    @property
    @abstractmethod
    def status(self) -> str:
        """``"online"`` | ``"connecting"`` | ``"offline"``."""
