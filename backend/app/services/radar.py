import asyncio

from app.core.logging import get_logger
from app.services.ld2410_native import LD2410Native

logger = get_logger(__name__)

class RadarService:
    def __init__(self):
        self.radar = LD2410Native()

    async def start(self) -> None:
        await self.radar.start()
        logger.info("Radar service started (Headless proxy mode)")

    async def stop(self) -> None:
        await self.radar.stop()
        logger.info("Radar service stopped")

    def feed(self, data: bytes) -> None:
        """Feed bytes from the Web Serial proxy into the driver."""
        self.radar.feed(data)

    async def get_outgoing_bytes(self) -> bytes:
        """Wait for bytes that need to be sent back to the radar."""
        return await self.radar.outgoing_queue.get()

    def get_latest_frame(self):
        return self.radar.latest_frame

    def get_latest_distance(self) -> float | None:
        """Returns the latest valid distance in meters."""
        frame = self.get_latest_frame()
        if frame and frame.target_state > 0:
            moving_cm = frame.moving_distance_cm
            static_cm = frame.static_distance_cm
            
            valid_dists = []
            if moving_cm > 0: valid_dists.append(moving_cm)
            if static_cm > 0: valid_dists.append(static_cm)
            
            if valid_dists:
                return min(valid_dists) / 100.0
        return None

    async def set_gate_sensitivity(self, gate: int, motion: int, static: int):
        """Passes the configuration command to the native driver."""
        await self.radar.set_gate_sensitivity(gate, motion, static)
