<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success.svg?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Python-3.11+-blue.svg?style=for-the-badge&logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/React-18-61DAFB.svg?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/YOLOv8-FF0000.svg?style=for-the-badge&logo=ultralytics" alt="YOLOv8" />
  <img src="https://img.shields.io/badge/Web_Serial_API-FFB900?style=for-the-badge&logo=googlechrome&logoColor=black" alt="Web Serial" />
</div>

<br />

<h1 align="center">ADAS & Radar Telemetry Platform</h1>

<p align="center">
  <strong>A production-grade, low-latency Advanced Driver Assistance System (ADAS).</strong><br />
  Fuses live computer vision (YOLOv8 + ByteTrack) with hardware-level mmWave Radar telemetry (LD2410) via zero-driver Web Serial proxying.
</p>

---

## ✨ Features

- **📷 WebRTC Video Ingest**: Video streams seamlessly from any mobile device or webcam browser directly to the Python backend over WebRTC. No external media servers required!
- **📡 Headless Radar Proxy**: Fuses YOLO visual detection with live distance and collision data from an LD2410 mmWave Radar. Your browser proxies the raw USB serial data to the cloud via WebSockets using the **Web Serial API**—zero local drivers required!
- **⚡ Metadata-Only Streaming**: The backend never sends heavy annotated video back. It streams bounding boxes and metrics over WebSockets, and the React frontend overlays them on your local canvas at 60 FPS.
- **🏎️ Ultra Low Latency**: Processes only the *latest* frame on the backend, avoiding queue buildup and maintaining realtime inference speeds.
- **🌐 Edge-to-Cloud Architecture**: Deploy the frontend on Vercel and the backend on Railway/AWS, while your mobile device acts as the edge sensor hub.

## 🏗️ Architecture Flow

```text
📱 Edge Device (Smartphone / Laptop)
├── 📷 Camera ───────── WebRTC (Video) ─────────┐
└── 📡 LD2410 Radar ─── Web Serial (Bytes) ─────┼──► ☁️ Python FastAPI Backend
                                                │    - YOLOv8 Inference
                                                │    - ByteTrack Tracking
                                                │    - Radar Byte Parsing & Fusion
💻 Frontend Dashboard ◄── WebSockets (JSON) ────┘
    - Renders Video + Canvas Bounding Boxes
    - Displays Unified Collision Alerts
```

## 📂 Repository Layout

```text
project-root/
├── frontend/   # React + TS + Vite + Tailwind + Zustand → Vercel
├── backend/    # FastAPI + YOLOv8 + WebRTC + LD2410     → Railway / EC2
└── docs/       # Architecture & Deployment Guides
```

The frontend and backend are completely decoupled. Their only link is URL configuration and shared JSON payload structures.

## 🚀 Quick Start (Local Development)

### 1. Backend (Python)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend (React)
```bash
cd frontend
npm install
cp .env.example .env
npm run dev    # Starts on http://localhost:5173
```

> **Note:** To test the Web Serial Radar feature locally, access the frontend via `localhost` or set up HTTPS. Browsers strictly block USB/Serial access over insecure `http://` IP addresses!

## ☁️ Deployment

- **Frontend → Vercel:** Simply push the `frontend/` directory to Vercel using the standard Vite preset.
- **Backend → Railway:** Create a new project pointing to the `backend/` directory. The repo includes a `railway.toml` and a CPU-optimized PyTorch `requirements.txt` specifically designed for lightning-fast Railway deployment.

## 🎯 Performance Targets

| Metric | Target |
| :--- | :--- |
| **Video Latency** | `< 200 ms` (Direct WebRTC) |
| **Detection FPS** | `10-30 FPS` (Hardware dependent) |
| **Radar Polling** | `~60 Hz` (via Web Serial bridge) |
