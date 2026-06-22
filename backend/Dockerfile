# syntax=docker/dockerfile:1
# ---- Backend image: FastAPI + YOLOv8 + ByteTrack ----
FROM python:3.12-slim AS base

# System libs required by OpenCV/FFmpeg for RTSP decoding.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        ffmpeg \
        curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Force ultralytics/torch onto CPU and a writable config dir.
    YOLO_CONFIG_DIR=/tmp/Ultralytics

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Pre-download the default model weights at build time so the first request is
# not delayed by a network download (override MODEL at runtime if needed).
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY app ./app

EXPOSE 8000

# Container-level health probe hits the REST health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Single worker: the pipeline holds in-process state (latest frame, trackers).
# Scale horizontally with more containers/cameras rather than workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
