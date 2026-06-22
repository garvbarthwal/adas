# ADAS Detection Frontend

Professional real-time detection dashboard. Renders the **WebRTC video** from
MediaMTX and draws **bounding boxes on a canvas overlay** from detection
metadata received over WebSocket. The frontend never receives annotated video —
all boxes are drawn client-side.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · React Query

## Design

```
┌──────────────────────────────┬─────────────────┐
│                              │  Detections     │
│   <video> (WebRTC)           │  Metrics        │
│   + <canvas> overlay         │  Alerts         │
│                              │                 │
└──────────────────────────────┴─────────────────┘
```

- **Video** travels over WebRTC (WHEP) for sub-300 ms latency — see
  `services/webrtc.ts`.
- **Detections** arrive on `/ws/detections`; **metrics** on a separate
  `/ws/metrics`. The two channels are subscribed independently
  (`hooks/useDetectionSocket`, `hooks/useMetricsSocket`).
- **Rendering**: a `requestAnimationFrame` loop in `VideoCanvas` reads the
  latest detection from the Zustand store and draws via `services/overlay.ts`.
  Boxes are drawn on the **canvas**, never as React DOM elements, so rendering
  stays smooth with many objects / future multi-camera grids.
- **Coordinate scaling**: detections are in source-frame pixels
  (`frameWidth`×`frameHeight`); the overlay maps them into the letterboxed
  (`object-contain`) video rectangle at any display size.

## Configuration

Environment variables (see [`.env.example`](.env.example)):

| Var                  | Purpose                                          |
|----------------------|--------------------------------------------------|
| `VITE_API_BASE_URL`  | Backend REST base, e.g. `https://api.example.com`|
| `VITE_WS_BASE_URL`   | Backend WS base, e.g. `wss://api.example.com`    |
| `VITE_WEBRTC_URL`    | MediaMTX WHEP URL, e.g. `https://media.example.com/carcam/whep` |
| `VITE_CAMERA_ID`     | Camera id to subscribe to (default `carcam`)     |

## Develop

```bash
cd frontend
npm install
cp .env.example .env       # point at your backend / MediaMTX
npm run dev                # http://localhost:5173
```

### Browser Camera Mode (no FFmpeg / MediaMTX)

Click **Start Camera** in the video panel to capture this device's webcam
(`getUserMedia`), preview it locally, and publish it to the backend over WebRTC
(WHIP → `POST /webrtc/ingest/{cameraId}`). Detections come back over the usual
`/ws/detections` channel and render on the canvas. Requires the backend running
with `INGEST_MODE=webrtc` (see `backend/requirements-dev.txt`). No extra frontend
env is needed — the ingest URL is derived from `VITE_API_BASE_URL`.

Switching to **MediaMTX stream** mode falls back to pulling WebRTC video from
`VITE_WEBRTC_URL` (the production path). Source selection lives in the Zustand
store (`sourceMode`); `useWebRTC` and `useBrowserCamera` are each gated by it.

## Build

```bash
npm run build              # type-checks then builds to dist/
npm run preview
```

## Deploy to Vercel

1. Import the repo in Vercel and set the **Root Directory** to `frontend/`.
2. Framework preset: **Vite** (auto-detected; `vercel.json` is included).
3. Add the `VITE_*` environment variables in Project Settings → Environment
   Variables (use `https://` / `wss://` production URLs).
4. Deploy. The SPA rewrite in `vercel.json` handles client-side routing.

> Because video and detections come straight from the backend / MediaMTX
> (not from Vercel), the frontend deploys as a static site with zero server code.

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full system design.
