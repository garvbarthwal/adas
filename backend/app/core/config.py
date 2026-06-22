"""Application configuration.

All runtime configuration is sourced from environment variables so that the
backend is twelve-factor compliant and trivially configurable inside Docker /
EC2 without code changes. See ``.env.example`` for the full list.
"""

from __future__ import annotations

import json
from functools import lru_cache

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class CameraConfig(BaseModel):
    """Configuration for a single camera pipeline.

    The system is multi-camera from day one: every pipeline is described by one
    of these. A single camera deployment is just a list of length one.
    """

    camera_id: str = Field(description="Stable, unique camera identifier, e.g. 'carcam1'.")
    stream_url: str = Field(description="RTSP URL exposed by MediaMTX for this camera.")
    name: str = Field(default="", description="Human friendly display name.")
    # Per-camera ingest override; falls back to the global INGEST_MODE.
    #   "rtsp"   — pull RTSP from MediaMTX (production / Raspberry Pi)
    #   "webrtc" — receive frames published directly from a browser (dev)
    ingest_mode: str | None = Field(default=None)

    def resolved_name(self) -> str:
        return self.name or self.camera_id


class Settings(BaseSettings):
    """Strongly-typed application settings loaded from the environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ----- Service metadata -------------------------------------------------
    app_name: str = Field(default="ADAS Detection Backend")
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # ----- HTTP server ------------------------------------------------------
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)

    # CORS origins allowed to talk to this API (comma separated in env).
    cors_origins: str = Field(default="*")

    # ----- Stream ingestion -------------------------------------------------
    # RTSP URL exposed by MediaMTX. In development the laptop/Pi publishes to
    # MediaMTX which the backend then consumes over loopback. This pair defines
    # the *default* single-camera pipeline.
    stream_url: str = Field(default="rtsp://localhost:8554/carcam")
    camera_id: str = Field(default="carcam")

    # Frame ingest mode for all cameras (override per-camera in CAMERAS):
    #   "rtsp"   — production: RTSP from MediaMTX.
    #   "webrtc" — development: browsers publish their webcam directly to the
    #              backend (Browser Camera Mode), no FFmpeg / MediaMTX needed.
    ingest_mode: str = Field(default="rtsp")

    # Optional multi-camera configuration. When set, this JSON array fully
    # overrides the single-camera pair above, e.g.:
    #   CAMERAS=[{"camera_id":"carcam1","stream_url":"rtsp://localhost:8554/carcam1"}]
    # Leaving it empty keeps the simple single-camera default so nothing needs
    # to change for a one-camera deployment.
    cameras: str = Field(default="")

    # Seconds to wait before attempting to reconnect to a dropped stream.
    stream_reconnect_delay: float = Field(default=2.0)
    # If no frame is read within this many seconds the stream is "offline".
    stream_stale_after: float = Field(default=5.0)

    # ----- Detection engine -------------------------------------------------
    model: str = Field(default="yolov8n.pt")
    # Detection cadence. The camera may run at 30 FPS but we only sample the
    # latest frame this many times per second to keep latency low.
    detection_fps: int = Field(default=10)
    confidence_threshold: float = Field(default=0.35)
    iou_threshold: float = Field(default=0.45)
    # Ultralytics tracker config. ``bytetrack.yaml`` ships with ultralytics.
    tracker: str = Field(default="bytetrack.yaml")
    # Inference device: "cpu", "cuda", "0", etc.
    device: str = Field(default="cpu")

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def detection_interval(self) -> float:
        """Seconds between detection passes derived from ``detection_fps``."""
        return 1.0 / max(self.detection_fps, 1)

    def camera_configs(self) -> list[CameraConfig]:
        """Return the list of cameras to run.

        Uses ``CAMERAS`` (a JSON array) when provided, otherwise falls back to
        the single default camera defined by ``STREAM_URL`` / ``CAMERA_ID``.
        """
        if self.cameras.strip():
            raw = json.loads(self.cameras)
            return [CameraConfig(**item) for item in raw]
        return [CameraConfig(camera_id=self.camera_id, stream_url=self.stream_url)]


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""
    return Settings()
