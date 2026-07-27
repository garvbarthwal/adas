import asyncio
import logging
from dataclasses import dataclass, field
import serial_asyncio
import serial.tools.list_ports
import struct

logger = logging.getLogger(__name__)

RADAR_HEADER = bytes([0xF4, 0xF3, 0xF2, 0xF1])
RADAR_TRAILER = bytes([0xF8, 0xF7, 0xF6, 0xF5])
CONFIG_HEADER = bytes([0xFD, 0xFC, 0xFB, 0xFA])
CONFIG_TRAILER = bytes([0x04, 0x03, 0x02, 0x01])

def discover_radar_port() -> str:
    ports = serial.tools.list_ports.comports()
    for p in ports:
        if "USB" in p.device or "ACM" in p.device:
            return p.device
    if ports:
        return ports[0].device
    return "/dev/ttyUSB0"

@dataclass
class RadarFrame:
    target_state: int = 0  # 0: None, 1: Moving, 2: Static, 3: Both
    moving_distance_cm: int = 0
    moving_energy: int = 0
    static_distance_cm: int = 0
    static_energy: int = 0
    detection_distance_cm: int = 0
    # Engineering mode data: gate 0-8
    motion_gates: list[int] = field(default_factory=lambda: [0]*9)
    static_gates: list[int] = field(default_factory=lambda: [0]*9)
    is_engineering: bool = False

class LD2410Native:
    def __init__(self):
        self.latest_frame: RadarFrame | None = None
        self._config_ack_event = asyncio.Event()
        self._config_mode = False
        self._buffer = bytearray()
        self.outgoing_queue: asyncio.Queue[bytes] = asyncio.Queue()

    async def start(self):
        # Called when a new WS connects
        logger.info("LD2410 Native Headless started")
        # Ensure we request engineering mode from the new connection
        await self.enable_engineering_mode()

    async def stop(self):
        logger.info("LD2410 Native Headless stopped")

    async def _send_command(self, payload: bytes):
        self._config_ack_event.clear()
        
        # Calculate length
        length = len(payload)
        length_bytes = struct.pack('<H', length)
        
        packet = CONFIG_HEADER + length_bytes + payload + CONFIG_TRAILER
        
        # Enqueue for the WebSocket to transmit
        await self.outgoing_queue.put(packet)
        
        try:
            await asyncio.wait_for(self._config_ack_event.wait(), timeout=1.0)
        except asyncio.TimeoutError:
            logger.warning("Timeout waiting for LD2410 ACK from WS")

    async def enable_configuration(self):
        payload = bytes([0xFF, 0x00, 0x01, 0x00])
        await self._send_command(payload)
        self._config_mode = True

    async def end_configuration(self):
        payload = bytes([0xFE, 0x00])
        await self._send_command(payload)
        self._config_mode = False

    async def enable_engineering_mode(self, enable: bool = True):
        await self.enable_configuration()
        cmd = 0x62 if enable else 0x63
        payload = bytes([cmd, 0x00])
        await self._send_command(payload)
        await self.end_configuration()

    async def set_gate_sensitivity(self, gate: int, motion: int, static: int):
        await self.enable_configuration()
        gate_byte = 0xFF if gate == -1 else gate
        payload = bytes([
            0x64, 0x00, 0x00, 0x00,
            gate_byte, 0x00 if gate != -1 else 0xFF, 0x00, 0x00,
            0x01, 0x00, motion, 0x00, 0x00, 0x00,
            0x02, 0x00, static, 0x00, 0x00, 0x00
        ])
        await self._send_command(payload)
        await self.end_configuration()

    def feed(self, data: bytes):
        """Called by the WebSocket when binary chunks arrive."""
        self._buffer.extend(data)
        
        # Try to parse all complete frames in buffer
        while True:
            # Find header
            idx_radar = self._buffer.find(RADAR_HEADER)
            idx_config = self._buffer.find(CONFIG_HEADER)
            
            if idx_radar == -1 and idx_config == -1:
                # Keep only the last 3 bytes to not miss a split header
                if len(self._buffer) > 3:
                    self._buffer = self._buffer[-3:]
                break
                
            # Determine which header is first
            start_idx = idx_radar
            is_config = False
            if idx_config != -1 and (idx_radar == -1 or idx_config < idx_radar):
                start_idx = idx_config
                is_config = True
            
            if start_idx > 0:
                self._buffer = self._buffer[start_idx:]
            
            # We need at least header(4) + length(2) bytes
            if len(self._buffer) < 6:
                break
                
            length = struct.unpack('<H', self._buffer[4:6])[0]
            total_len = 4 + 2 + length + 4 # header + length + payload + trailer
            
            if len(self._buffer) < total_len:
                break # wait for more data
                
            packet = self._buffer[:total_len]
            self._buffer = self._buffer[total_len:] # consume packet
            
            # Validate trailer
            trailer = packet[-4:]
            expected_trailer = CONFIG_TRAILER if is_config else RADAR_TRAILER
            if trailer != expected_trailer:
                continue # invalid packet
                
            if is_config:
                self._config_ack_event.set()
            else:
                self._parse_radar_data(packet)

    def _parse_radar_data(self, vals: bytes):
        if len(vals) < 17: return
        data_type = vals[6]
        
        frame = RadarFrame()
        frame.target_state = vals[8]
        frame.moving_distance_cm = vals[9] + (vals[10] << 8)
        frame.moving_energy = vals[11]
        frame.static_distance_cm = vals[12] + (vals[13] << 8)
        frame.static_energy = vals[14]
        frame.detection_distance_cm = vals[15] + (vals[16] << 8)
        
        if data_type == 0x01:
            frame.is_engineering = True
            if len(vals) >= 35:
                frame.motion_gates = list(vals[17:26])
                frame.static_gates = list(vals[26:35])
                
        self.latest_frame = frame
