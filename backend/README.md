# ADAS Detection Backend

Real-time, multi-camera object detection backend. Consumes an RTSP stream from
MediaMTX, runs **YOLOv8n + ByteTrack**, and pushes **detection metadata only**
(never annotated video) to the frontend over two independent WebSocket channels.

> Low-latency by design: the stream reader keeps **only the latest frame** — no
> queues, no backlog. The detector samples that frame at a configurable rate
> (default 10 FPS) while the camera streams at up to 30 FPS.

## Stack

Python 3.12 · FastAPI · OpenCV · Ultralytics YOLOv8 · ByteTrack · Pydantic · Uvicorn

## Architecture (per camera)

```
RTSP ─► StreamReader (thread) ─► latest frame ─► YOLO+ByteTrack (executor)
     ─► DetectionMessage ─┬─► /ws/detections
                          └─► /ws/metrics   (health/FPS/latency)
```

- **StreamReader** — daemon thread, auto-reconnect, single lock-protected latest
  frame. Never blocks the detector; the detector never blocks ingestion.
- **YoloDetector** — YOLOv8 with ByteTrack (`persist=True`) for stable ids. One
  instance per camera so tracker state never mixes.
- **CameraPipeline** — runs a detection loop (paced to `DETECTION_FPS`) and a
  metrics loop (~1 Hz). Inference runs in a thread executor off the event loop.
- **PipelineManager** — owns one pipeline per camera; multi-camera from day one.

## API

| Method | Path                  | Description                                   |
|--------|-----------------------|-----------------------------------------------|
| GET    | `/health`             | Aggregate health: `{status, stream, yolo, fps, cameras, uptimeSeconds}` |
| GET    | `/metrics`            | Per-camera metrics (`?cameraId=` to filter)   |
| GET    | `/streams`            | Configured streams + live status              |
| GET    | `/latest-detections`  | Most recent detections per camera             |

### WebSocket channels (independent)

| Path              | Payload                                                          |
|-------------------|------------------------------------------------------------------|
| `/ws/detections`  | `{cameraId, timestamp, frameWidth, frameHeight, objects[]}`      |
| `/ws/metrics`     | `{cameraId, streamStatus, streamFps, detectionFps, latencyMs, trackedObjects, uptimeSeconds}` |

Both accept optional `?cameraId=carcam` to subscribe to a single camera; omit it
to receive all cameras. Server-push only — no polling.

Detection object shape:

```json
{ "id": 7, "class": "person", "confidence": 0.94, "x1": 100, "y1": 50, "x2": 220, "y2": 310 }
```

Coordinates are in the **source frame resolution** (`frameWidth`×`frameHeight`).
The frontend scales them to the displayed video size.

## Configuration

All config is via environment variables — see [`.env.example`](.env.example).
Key ones:

```env
STREAM_URL=rtsp://localhost:8554/carcam
MODEL=yolov8n.pt
DETECTION_FPS=10
CORS_ORIGINS=https://your-app.vercel.app
```

Multiple cameras (overrides `STREAM_URL`/`CAMERA_ID`):

```env
CAMERAS=[{"camera_id":"carcam1","stream_url":"rtsp://localhost:8554/carcam1"},{"camera_id":"carcam2","stream_url":"rtsp://localhost:8554/carcam2"}]
```

## Run locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # edit STREAM_URL etc.
uvicorn app.main:app --reload --port 8000
```

You need a reachable RTSP source. With MediaMTX running locally, publish your
webcam:

```bash
# Linux webcam → MediaMTX
ffmpeg -f v4l2 -i /dev/video0 -vcodec libx264 -preset ultrafast -tune zerolatency \
       -f rtsp rtsp://localhost:8554/carcam
```

## Browser Camera Mode (development)

For local development you can skip FFmpeg **and** MediaMTX entirely: have the
browser publish its webcam straight to the backend over WebRTC.

```bash
pip install -r requirements-dev.txt   # adds aiortc + PyAV
INGEST_MODE=webrtc uvicorn app.main:app --reload --port 8000
```

Then click **Start Camera** in the frontend. Under the hood:

```
Browser getUserMedia ──WebRTC/WHIP──► POST /webrtc/ingest/{cameraId}
                                       └─► WebRTCFrameSource ─► same YOLO pipeline
```

- The pipeline is source-agnostic (`app/stream/base.py::FrameSource`); only the
  frame source swaps. Detection, tracking, WebSocket channels and metrics are
  identical to production.
- `INGEST_MODE` can be set per-camera in `CAMERAS` (`"ingest_mode":"webrtc"`),
  so you can mix a browser dev camera with RTSP cameras.
- Production stays `INGEST_MODE=rtsp` (the default) — `aiortc` is imported
  lazily and is **not** required for RTSP deployments.

## Docker

```bash
cd backend
docker compose up --build
```

The image pre-downloads `yolov8n.pt` at build time and ships a `HEALTHCHECK`
hitting `/health`.

## Deploy to AWS EC2

1. Launch an EC2 instance (Ubuntu 22.04+, ≥2 vCPU / 4 GB for `yolov8n` on CPU).
2. Install Docker + Compose.
3. Open security-group ports: `8000` (API/WS) and whatever MediaMTX uses
   (`8554` RTSP, `8889` WebRTC).
4. Copy this folder, set `.env` (`ENVIRONMENT=production`, real `CORS_ORIGINS`,
   correct `STREAM_URL`).
5. `docker compose up -d --build`.
6. Front it with Nginx/ALB + TLS so the frontend can use `wss://` and `https://`.

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full system design.
