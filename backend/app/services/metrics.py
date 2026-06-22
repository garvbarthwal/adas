"""Per-camera metrics tracking.

Tracks detection FPS, processing latency, tracked-object count and uptime using
lightweight sliding windows. Stream FPS is owned by the :class:`StreamReader`.
"""

from __future__ import annotations

import time
from collections import deque


class MetricsTracker:
    """Rolling metrics for a single camera pipeline."""

    def __init__(self, window_seconds: float = 1.0) -> None:
        self._window = window_seconds
        self._start = time.time()
        self._detection_times: deque[float] = deque()
        self._latencies: deque[float] = deque(maxlen=30)
        self._tracked_objects = 0

    def record_detection(self, latency_ms: float, tracked_objects: int) -> None:
        """Record a completed detection pass."""
        now = time.time()
        self._detection_times.append(now)
        self._latencies.append(latency_ms)
        self._tracked_objects = tracked_objects
        self._trim(now)

    def _trim(self, now: float) -> None:
        cutoff = now - self._window
        while self._detection_times and self._detection_times[0] < cutoff:
            self._detection_times.popleft()

    @property
    def detection_fps(self) -> float:
        self._trim(time.time())
        return round(len(self._detection_times) / self._window, 1)

    @property
    def latency_ms(self) -> float:
        if not self._latencies:
            return 0.0
        return round(sum(self._latencies) / len(self._latencies), 1)

    @property
    def tracked_objects(self) -> int:
        return self._tracked_objects

    @property
    def uptime_seconds(self) -> float:
        return round(time.time() - self._start, 1)
