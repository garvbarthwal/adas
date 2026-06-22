# Architecture

A production-grade, real-time, multi-camera video analytics platform. Video and
detection metadata travel on **separate paths** end-to-end: video over WebRTC,
metadata over WebSocket. The frontend composes them by drawing boxes on a canvas
above the live video.

```
 Raspberry Pi / Laptop
         │  (FFmpeg, H.264)
         ▼
       FFmpeg ──RTSP publish──►  AWS MediaMTX  ─┬─ WebRTC (WHEP) ──► Frontend <video>
                                                │
                                                └─ RTSP pull ──► YOLO Backend ──► Frontend (WebSocket)
                                                                                 ├─ /ws/detections
                                                                                 └─ /ws/metrics
```

MediaMTX is an **external dependency** — not part of this codebase. The backend
only consumes the RTSP URL it exposes; the frontend only consumes its WebRTC
endpoint.

---

## 1. Camera publishing workflow

The camera source publishes an RTSP stream to MediaMTX using FFmpeg. The same
contract works for a dev laptop and a production Raspberry Pi — only the FFmpeg
input changes, which is what makes the Pi **plug-and-play**.

```bash
# Laptop (Linux webcam)
ffmpeg -f v4l2 -i /dev/video0 \
       -vcodec libx264 -preset ultrafast -tune zerolatency \
       -f rtsp rtsp://<mediamtx-host>:8554/carcam

# Raspberry Pi (libcamera/Pi camera)
libcamera-vid -t 0 --inline -o - | \
  ffmpeg -i - -vcodec libx264 -preset ultrafast -tune zerolatency \
         -f rtsp rtsp://<mediamtx-host>:8554/carcam
```

`-tune zerolatency` + `ultrafast` minimize encoder latency. Each camera uses a
distinct path (`/carcam1`, `/carcam2`, …) so multi-camera is purely additive.

## 2. MediaMTX integration

MediaMTX is the media hub. It:

- ingests the RTSP publish from the camera,
- re-exposes the same stream over **WebRTC (WHEP)** at `:8889/<path>/whep` for
  the browser, and over **RTSP** at `:8554/<path>` for the backend.

This fan-out is why the browser gets low-latency video without the backend ever
touching pixels for display. MediaMTX is deployed and managed independently
(its own container/service); this repo treats it as configuration (URLs).

## 3. WebRTC streaming flow

The frontend establishes a WHEP session (`services/webrtc.ts`):

1. Create `RTCPeerConnection`, add `recvonly` transceivers.
2. Create an SDP offer, gather ICE.
3. `POST` the offer to the WHEP URL; receive an SDP answer.
4. Attach the inbound `MediaStream` to the `<video>` element.

Target: **< 300 ms** glass-to-glass. WebRTC is chosen over HLS/MSE precisely for
this latency budget. `useWebRTC` retries automatically after interruptions.

## 4. YOLO detection flow

Per camera, in-process (`services/pipeline.py`):

```
RTSP ─► StreamReader (daemon thread) ─► latest frame (single slot)
     ─► detection loop @ DETECTION_FPS ─► YOLOv8n + ByteTrack (thread executor)
     ─► DetectionMessage
```

Key low-latency rules:

- **Latest frame only.** `StreamReader` overwrites a single lock-protected slot;
  no queue ever forms, so the detector always works on the freshest frame and
  stale frames are dropped automatically.
- **Decoupled rates.** Camera may run at 30 FPS; detection runs at a configurable
  `DETECTION_FPS` (default 10). The loop paces itself without drift.
- **Non-blocking inference.** Blocking YOLO calls run in a thread executor so the
  event loop (and thus WebSocket pushes / reconnect logic) never stalls.
- **Stable IDs.** ByteTrack (`persist=True`) gives consistent tracking ids — the
  foundation for future speed/counting/ADAS features. One detector instance per
  camera keeps tracker state isolated.

Target: **< 500 ms** detection latency, reported live as `latencyMs`.

### 4a. Development: Browser Camera Mode

To remove all local setup friction during development, the backend can ingest a
webcam published directly from the browser — no FFmpeg, no terminal, no local
MediaMTX:

```
Browser getUserMedia ──WebRTC/WHIP──► POST /webrtc/ingest/{cameraId}  (aiortc)
                                       └─► WebRTCFrameSource ─► (same pipeline)
```

The detection pipeline consumes frames through a `FrameSource` interface
(`app/stream/base.py`) with two implementations:

| Mode (`INGEST_MODE`) | Source              | Use            |
|----------------------|---------------------|----------------|
| `rtsp` (default)     | `StreamReader`      | Production / Raspberry Pi |
| `webrtc`             | `WebRTCFrameSource` | Local development |

Everything downstream — YOLO, ByteTrack, both WebSocket channels, metrics — is
identical regardless of source. `aiortc`/PyAV are imported lazily, so RTSP
deployments don't carry the dependency. The mode is per-camera, so a browser dev
camera and RTSP cameras can coexist. The frontend shows the local `getUserMedia`
stream as the preview while publishing the same frames to the backend, so what
you see is exactly what YOLO analyzes.

## 5. WebSocket communication flow

Two **independent** channels (`websocket/routes.py`), each backed by its own
`ConnectionManager`:

| Channel           | Payload                                                       |
|-------------------|---------------------------------------------------------------|
| `/ws/detections`  | `{cameraId, timestamp, frameWidth, frameHeight, objects[]}`   |
| `/ws/metrics`     | `{cameraId, streamStatus, streamFps, detectionFps, latencyMs, trackedObjects, uptimeSeconds}` |

Separation means a burst of detections never delays metrics and each channel can
be scaled/observed/debugged on its own. Both accept `?cameraId=` to subscribe to
a single camera or all. Pushes are server-initiated only — **no polling**. Every
payload carries `cameraId`, so multi-camera routing needs no protocol change.

## 6. React rendering pipeline

```
<video> (WebRTC, object-contain)   ← live pixels
<canvas> (absolute, on top)        ← boxes/labels/ids drawn here
```

- A `requestAnimationFrame` loop (`VideoCanvas`) reads the latest detection from
  the Zustand store every frame and redraws — decoupled from WS arrival for
  smoothness.
- `services/overlay.ts` maps source-frame coordinates into the letterboxed video
  rectangle (handles HiDPI via `devicePixelRatio`). Boxes are **canvas draws**,
  not React DOM nodes, so hundreds of objects stay smooth and future
  trajectories/distance annotations slot in at documented extension points.
- State lives in Zustand (connection states, latest detection, latest metrics,
  alerts); React Query polls `/health` for the backend-availability banner.

## 7. Deployment architecture

```
        ┌─────────────┐        WebRTC (wss/https)       ┌───────────────┐
        │   Browser   │ ◄──────────────────────────────►│   MediaMTX    │
        │  (Vercel)   │                                  │   (AWS)       │
        │             │ ◄── WebSocket (wss) ── REST ──►  └──────┬────────┘
        └─────────────┘                                        │ RTSP
                │                                               ▼
                └────────── wss/https ──────────►  ┌────────────────────────┐
                                                   │  Detection Backend     │
                                                   │  FastAPI + YOLO (EC2,  │
                                                   │  Docker)               │
                                                   └────────────────────────┘
```

- **Frontend** → Vercel (static SPA, env-configured URLs).
- **Backend** → Dockerized FastAPI on AWS EC2, single worker (holds per-camera
  pipeline state), `HEALTHCHECK` on `/health`, behind Nginx/ALB for TLS so the
  browser can use `wss://`/`https://`.
- **MediaMTX** → independent service on AWS.

Frontend and backend deploy **independently**; their only coupling is the URL
configuration and the wire contract in `types/index.ts` ↔ `app/schemas`.

## 8. Future scaling strategy

The architecture is multi-camera from day one (`PipelineManager` owns N
`CameraPipeline`s; every payload carries `cameraId`). Growth paths:

- **More cameras, one box:** add entries to `CAMERAS` (JSON). Each gets its own
  reader thread, detector instance and metrics.
- **More cameras, many boxes:** run one backend container per camera/group;
  front them with a gateway that routes by `cameraId`. The per-channel
  connection managers make this clean.
- **ADAS features:** `detectors/base.py` is the extension seam for distance
  estimation, lane detection, traffic-sign recognition; ByteTrack ids enable
  speed estimation and counting. The canvas renderer already reserves hooks for
  trajectories and distance annotations.
- **Recording / event storage:** add a consumer of the detection stream (or a
  sink in the pipeline) without touching ingestion or the frontend.
- **GPU:** swap the CPU torch build for CUDA and set `DEVICE=cuda`; no code
  changes elsewhere.
