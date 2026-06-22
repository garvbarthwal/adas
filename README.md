# Real-Time Object Detection Platform (ADAS)

A production-grade, low-latency, multi-camera object detection platform.

- **Video** is delivered to the browser over **WebRTC** (via MediaMTX).
- **Detections** (YOLOv8 + ByteTrack) are delivered as **metadata only** over
  **WebSocket** — the backend never sends annotated video.
- The browser draws bounding boxes on a **canvas overlay** above the live video.

```
Raspberry Pi / Laptop ─FFmpeg─► AWS MediaMTX ─┬─ WebRTC ─► Frontend <video>
                                              └─ RTSP   ─► YOLO Backend ─► Frontend WebSocket
                                                                          (/ws/detections, /ws/metrics)
```

## Repository layout

```
project-root/
├── frontend/   # React + TS + Vite + Tailwind + Zustand + React Query → Vercel
├── backend/    # FastAPI + OpenCV + YOLOv8 + ByteTrack (Dockerized)     → AWS EC2
└── docs/
    └── ARCHITECTURE.md
```

The two folders are **completely independent** and deploy separately. Their only
coupling is URL configuration and the shared wire contract
(`frontend/src/types` ↔ `backend/app/schemas`).

## Design principles

1. Low latency first (latest-frame-only, decoupled detection rate).
2. Process only the latest frame — never build frame queues.
3. Video and detection metadata stay on separate transports.
4. Frontend and backend deploy independently.
5. Multi-camera from day one (`cameraId` in every payload).
6. Separate WebSocket channels: `/ws/detections` and `/ws/metrics`.
7. Clean, typed, documented, Docker-first.

## Quick start (local)

You need a running **MediaMTX** (external) and an RTSP publisher.

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# 2. Publish your webcam to MediaMTX
ffmpeg -f v4l2 -i /dev/video0 -vcodec libx264 -preset ultrafast -tune zerolatency \
       -f rtsp rtsp://localhost:8554/carcam

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env
npm run dev    # http://localhost:5173
```

## Deployment

- **Frontend → Vercel:** root directory `frontend/`, Vite preset, set `VITE_*`
  env vars. See [`frontend/README.md`](frontend/README.md).
- **Backend → AWS EC2 (Docker):** `docker compose up -d --build`, set `.env`,
  front with Nginx/ALB + TLS. See [`backend/README.md`](backend/README.md).
- **MediaMTX:** deployed independently on AWS (not in this repo).

## Performance targets

| Metric              | Target            |
|---------------------|-------------------|
| Video latency       | < 300 ms (WebRTC) |
| Detection latency   | < 500 ms          |
| Detection FPS       | configurable (default 10) |

## Documentation

Full system design — camera publishing, MediaMTX, WebRTC, YOLO pipeline,
WebSocket flow, React rendering, deployment and scaling — is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
