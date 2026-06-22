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

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    """Tracks connected clients for one logical channel and broadcasts to them."""

    def __init__(self, channel: str) -> None:
        self._channel = channel
        # Map of websocket -> camera filter (None == all cameras).
        self._clients: dict[WebSocket, str | None] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, camera_id: str | None) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients[websocket] = camera_id
        logger.info(
            "WS client connected",
            extra={"channel": self._channel, "camera_id": camera_id,
                   "clients": len(self._clients)},
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.pop(websocket, None)
        logger.info(
            "WS client disconnected",
            extra={"channel": self._channel, "clients": len(self._clients)},
        )

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, camera_id: str, payload: dict) -> None:
        """Send ``payload`` to every client subscribed to ``camera_id`` (or all).

        Dead sockets are pruned. Sends run concurrently so one slow client can't
        stall the others.
        """
        async with self._lock:
            targets = [
                ws
                for ws, sub in self._clients.items()
                if sub is None or sub == camera_id
            ]
        if not targets:
            return

        results = await asyncio.gather(
            *(self._safe_send(ws, payload) for ws in targets),
            return_exceptions=True,
        )
        dead = [ws for ws, ok in zip(targets, results) if ok is not True]
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.pop(ws, None)

    @staticmethod
    async def _safe_send(websocket: WebSocket, payload: dict) -> bool:
        try:
            await websocket.send_json(payload)
            return True
        except Exception:  # noqa: BLE001 - any failure means drop the client
            return False
