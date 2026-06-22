"""Internal domain models passed between pipeline stages (not wire schemas)."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np


@dataclass(slots=True)
class Frame:
    """A single captured frame plus capture metadata.

    Only ever held as the *latest* frame in the stream reader — never queued —
    so memory stays bounded regardless of camera/detection FPS mismatch.
    """

    image: np.ndarray
    capture_ts: float = field(default_factory=time.time)
    sequence: int = 0

    @property
    def width(self) -> int:
        return int(self.image.shape[1])

    @property
    def height(self) -> int:
        return int(self.image.shape[0])

    @property
    def age_ms(self) -> float:
        """Milliseconds since this frame was captured."""
        return (time.time() - self.capture_ts) * 1000.0
