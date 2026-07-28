"""WebSocket routes — two independent channels.

    /ws/detections   bounding boxes, labels, confidence, tracking ids
    /ws/metrics       stream health, FPS, latency, uptime, tracked-object count

Keeping them separate means a burst of detections never delays metric updates
and vice-versa, and each can be scaled / debugged on its own. Both accept an
optional ``?cameraId=`` query param to subscribe to a single camera; omitting it
subscribes to every camera (handy for a one-camera dashboard today, many later).

Pushes are server-initiated only (no polling). The receive loop exists solely to
detect disconnects and ignore any client chatter.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


async def _serve(websocket: WebSocket, channel: str, camera_id: str | None) -> None:
    manager = getattr(websocket.app.state.manager, f"{channel}_ws")
    await manager.connect(websocket, camera_id)
    try:
        # We only push; block on receive purely to observe disconnects.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.warning("WS error", extra={"channel": channel})
    finally:
        await manager.disconnect(websocket)


@router.websocket("/ws/detections")
async def ws_detections(
    websocket: WebSocket,
    cameraId: str | None = Query(default=None),
) -> None:
    """Stream detection metadata for one or all cameras."""
    await _serve(websocket, "detections", cameraId)


@router.websocket("/ws/metrics")
async def ws_metrics(
    websocket: WebSocket,
    cameraId: str | None = Query(default=None),
) -> None:
    """Stream system / stream health metrics for one or all cameras."""
    await _serve(websocket, "metrics", cameraId)

import asyncio

@router.websocket("/ws/radar-stream")
async def ws_radar_stream(websocket: WebSocket) -> None:
    """Bi-directional proxy for Web Serial radar data."""
    await websocket.accept()
    manager = websocket.app.state.manager
    radar_service = manager.radar_service
    
    if not radar_service:
        await websocket.close()
        return

    async def send_outgoing():
        try:
            while True:
                data = await radar_service.get_outgoing_bytes()
                await websocket.send_bytes(data)
        except Exception:
            pass

    sender_task = asyncio.create_task(send_outgoing())
    
    try:
        while True:
            data = await websocket.receive_bytes()
            radar_service.feed(data)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Radar stream error: {e}")
    finally:
        sender_task.cancel()
        radar_service.reset()
