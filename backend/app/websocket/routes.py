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
