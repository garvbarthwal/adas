"""WebSocket connection manager.

A reusable hub used independently by each channel (``/ws/detections`` and
``/ws/metrics``). Keeping a manager *per channel* means detection traffic and
metrics traffic never interfere, matching the separate-channels architecture.

Clients may optionally subscribe to a single ``cameraId`` (query param). A
``None`` subscription receives messages from all cameras — convenient for a
dashboard showing one camera today and several tomorrow.
"""

from __future__ import annotations

import asyncio
import msgpack

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    """Tracks connected clients for one logical channel and broadcasts to them."""

    def __init__(self, channel: str) -> None:
        self._channel = channel
        # Map of websocket -> dict with camera_id and queue.
        self._clients: dict[WebSocket, dict] = {}
        self._max_queue = 3
        self._tasks: dict[WebSocket, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, camera_id: str | None) -> None:
        await websocket.accept()
        queue = asyncio.Queue(maxsize=self._max_queue)
        async with self._lock:
            self._clients[websocket] = {"camera_id": camera_id, "queue": queue}
            self._tasks[websocket] = asyncio.create_task(self._drain(websocket, queue))
        logger.info(
            "WS client connected",
            extra={"channel": self._channel, "camera_id": camera_id,
                   "clients": len(self._clients)},
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.pop(websocket, None)
            task = self._tasks.pop(websocket, None)
            if task:
                task.cancel()
        logger.info(
            "WS client disconnected",
            extra={"channel": self._channel, "clients": len(self._clients)},
        )

    async def _drain(self, websocket: WebSocket, queue: asyncio.Queue) -> None:
        while True:
            try:
                data = await queue.get()
                await websocket.send_bytes(data)
            except Exception:
                break

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, camera_id: str, payload: dict) -> None:
        """Send ``payload`` to every client subscribed to ``camera_id`` (or all).

        Dead sockets are pruned by the drain task which exits on error,
        and then the manager handles cleanup during the explicit disconnect.
        """
        data = msgpack.packb(payload)
        async with self._lock:
            targets = [
                info["queue"]
                for ws, info in self._clients.items()
                if info["camera_id"] is None or info["camera_id"] == camera_id
            ]
        if not targets:
            return

        for queue in targets:
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(data)
                except asyncio.QueueFull:
                    pass
