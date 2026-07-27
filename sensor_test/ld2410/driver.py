import serial
import threading
import queue
import logging
from typing import Callable

from .protocol import *
from .parser import RadarParser
from .commands import Command
from .models import FirmwareInfo, CommandAck, RadarConfiguration

logger = logging.getLogger(__name__)

class LD2410:

    def __init__(
        self,
        port=DEFAULT_PORT,
        baudrate=DEFAULT_BAUDRATE,
        timeout=DEFAULT_TIMEOUT
    ):

        self.serial = serial.Serial(
            port=port,
            baudrate=baudrate,
            timeout=timeout
        )

        self.buffer = bytearray()
        
        # Threading and Callbacks
        self._callbacks: list[Callable] = []
        self._frame_queue: queue.Queue = queue.Queue(maxsize=100)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    # =====================================================
    # Raw Read
    # =====================================================

    def _read(self, size=128):

        data = self.serial.read(size)

        if data:
            self.buffer.extend(data)

    # =====================================================
    # Read Radar Report
    # =====================================================

    def _read_frame_blocking(self):
        """Reads a single frame from the buffer, blocking until one is found or timeout occurs."""
        while True:
            # To ensure this doesn't block the thread indefinitely, 
            # we rely on the serial port timeout configured in __init__.
            self._read()

            start = self.buffer.find(REPORT_HEADER)

            if start == -1:

                # Keep only last few bytes in case header
                # spans two serial reads.
                if len(self.buffer) > 4:
                    self.buffer = self.buffer[-4:]

                # Check if we should exit (prevent blocking forever if thread is stopping)
                if self._stop_event and self._stop_event.is_set():
                    return None

                continue

            # Need header + length
            if len(self.buffer) < start + 6:
                continue

            payload_length = int.from_bytes(
                self.buffer[start + 4:start + 6],
                "little"
            )

            packet_size = (
                REPORT_HEADER_SIZE
                + REPORT_LENGTH_SIZE
                + payload_length
                + REPORT_FOOTER_SIZE
            )

            if len(self.buffer) < start + packet_size:
                continue

            packet = bytes(
                self.buffer[start:start + packet_size]
            )

            self.buffer = self.buffer[
                start + packet_size:
            ]

            if packet[-4:] != REPORT_FOOTER:
                continue

            try:
                return RadarParser.parse(packet)
            except Exception as e:
                logger.error(f"Error parsing radar frame: {e}")
                continue
                
        return None

    # =====================================================
    # Async / Threading / Callbacks
    # =====================================================

    def on_frame(self, callback: Callable):
        """Register a callback function to be called when a new frame is received."""
        self._callbacks.append(callback)

    def get_frame_queue(self) -> queue.Queue:
        """Get the queue that stores incoming frames."""
        return self._frame_queue

    def start(self):
        """Start the background thread that continuously reads frames."""
        if self._thread is not None and self._thread.is_alive():
            logger.warning("Radar background thread is already running.")
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("Radar background thread started.")

    def stop(self):
        """Stop the background thread."""
        if self._thread is not None:
            self._stop_event.set()
            self._thread.join()
            self._thread = None
            logger.info("Radar background thread stopped.")

    def _run_loop(self):
        while not self._stop_event.is_set():
            try:
                frame = self._read_frame_blocking()
            except serial.SerialException as e:
                logger.error(f"Radar serial connection lost: {e}")
                self._stop_event.set()
                break
            except Exception as e:
                logger.error(f"Unexpected error reading radar: {e}")
                continue

            if frame:
                # Trigger callbacks
                for cb in self._callbacks:
                    try:
                        cb(frame)
                    except Exception as e:
                        logger.error(f"Error in radar callback: {e}")
                
                # Put in queue for async consumers
                try:
                    self._frame_queue.put_nowait(frame)
                except queue.Full:
                    # Drop oldest frame if queue is full to avoid stalling
                    try:
                        self._frame_queue.get_nowait()
                        self._frame_queue.put_nowait(frame)
                    except queue.Empty:
                        pass

    # =====================================================
    # Flush UART
    # =====================================================

    def flush(self):

        self.serial.reset_input_buffer()
        self.buffer.clear()

    # =====================================================
    # Close Port
    # =====================================================

    def close(self):

        self.serial.close()

    # =====================================================
    # Command Sending
    # =====================================================

    def _write(self, data: bytes):

        self.serial.write(data)
        self.serial.flush()

    def _build_command(
        self,
        command: int,
        payload: bytes = b"",
    ):

        body = (
            command.to_bytes(2, "little")
            + payload
        )

        length = len(body).to_bytes(2, "little")

        return (
            COMMAND_HEADER
            + length
            + body
            + COMMAND_FOOTER
        )

    def send_command(
        self,
        command: int,
        payload: bytes = b"",
    ):

        packet = self._build_command(
            command,
            payload,
        )

        self._write(packet)

    def read_ack(self) -> CommandAck:

        while True:

            self._read()

            start = self.buffer.find(COMMAND_HEADER)

            if start == -1:

                if len(self.buffer) > 4:
                    self.buffer = self.buffer[-4:]

                continue

            if len(self.buffer) < start + 6:
                continue

            payload_length = int.from_bytes(
                self.buffer[start + 4:start + 6],
                "little"
            )

            packet_size = (
                COMMAND_HEADER_SIZE
                + COMMAND_LENGTH_SIZE
                + payload_length
                + COMMAND_FOOTER_SIZE
            )

            if len(self.buffer) < start + packet_size:
                continue

            packet = bytes(
                self.buffer[start:start + packet_size]
            )

            self.buffer = self.buffer[
                start + packet_size:
            ]

            if packet[-4:] != COMMAND_FOOTER:
                continue

            return RadarParser.parse_ack(packet)

    def enable_configuration(self):

        self.send_command(Command.ENABLE_CONFIGURATION, b"\x01\x00")

        ack = self.read_ack()

        if ack.status != 0:
            raise RuntimeError("Failed to enter configuration mode")

    def end_configuration(self):

        self.send_command(Command.END_CONFIGURATION)

        ack = self.read_ack()

        if ack.status != 0:
            raise RuntimeError("Failed to exit configuration mode")

    def read_firmware(self) -> FirmwareInfo:

        self.enable_configuration()

        try:

            self.send_command(Command.READ_FIRMWARE)

            ack = self.read_ack()

            if ack.status != 0:
                raise RuntimeError("Read firmware failed")

            payload = ack.payload

            firmware_type = int.from_bytes(
                payload[0:2],
                "little"
            )

            major_version_bytes = payload[2:4]
            minor_version_bytes = payload[4:8]

            return FirmwareInfo(
                firmware_type=firmware_type,
                major_version_bytes=major_version_bytes,
                minor_version_bytes=minor_version_bytes,
            )

        finally:

            self.end_configuration()

    def read_parameters(self) -> RadarConfiguration:

        self.enable_configuration()

        try:
            self.send_command(Command.READ_PARAMETERS)

            ack = self.read_ack()

            if ack.status != 0:
                raise RuntimeError("Read parameters failed")

            payload = ack.payload

            if payload[0] != 0xAA:
                raise ValueError("Invalid parameters header")

            max_distance_gate = payload[1]
            max_motion_distance_gate = payload[2]
            max_stationary_distance_gate = payload[3]

            num_gates = max_distance_gate + 1

            motion_sensitivities = list(payload[4 : 4 + num_gates])
            stationary_sensitivities = list(payload[4 + num_gates : 4 + num_gates * 2])

            unoccupied_duration_s = int.from_bytes(
                payload[4 + num_gates * 2 : 4 + num_gates * 2 + 2],
                "little"
            )

            return RadarConfiguration(
                max_distance_gate=max_distance_gate,
                max_motion_distance_gate=max_motion_distance_gate,
                max_stationary_distance_gate=max_stationary_distance_gate,
                motion_sensitivities=motion_sensitivities,
                stationary_sensitivities=stationary_sensitivities,
                unoccupied_duration_s=unoccupied_duration_s,
            )

        finally:
            self.end_configuration()

    def enable_engineering_mode(self):

        self.enable_configuration()

        try:
            self.send_command(Command.ENABLE_ENGINEERING_MODE)

            ack = self.read_ack()

            if ack.status != 0:
                raise RuntimeError("Enable engineering mode failed")

        finally:
            self.end_configuration()

    def disable_engineering_mode(self):

        self.enable_configuration()

        try:
            self.send_command(Command.DISABLE_ENGINEERING_MODE)

            ack = self.read_ack()

            if ack.status != 0:
                raise RuntimeError("Disable engineering mode failed")

        finally:
            self.end_configuration()

    # =====================================================
    # Configuration Commands
    # =====================================================

    def set_gate_sensitivity(self, distance_gate: int, motion_sensitivity: int, stationary_sensitivity: int):
        self.enable_configuration()
        try:
            payload = (
                b"\x00\x00" + distance_gate.to_bytes(4, "little", signed=False) +
                b"\x01\x00" + motion_sensitivity.to_bytes(4, "little", signed=False) +
                b"\x02\x00" + stationary_sensitivity.to_bytes(4, "little", signed=False)
            )
            self.send_command(Command.SET_GATE_SENSITIVITY, payload)
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Set gate sensitivity failed")
        finally:
            self.end_configuration()

    def set_distance_resolution(self, resolution_index: int):
        self.enable_configuration()
        try:
            self.send_command(Command.SET_DISTANCE_RESOLUTION, resolution_index.to_bytes(2, "little"))
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Set distance resolution failed")
        finally:
            self.end_configuration()

    def get_distance_resolution(self) -> int:
        self.enable_configuration()
        try:
            self.send_command(Command.GET_DISTANCE_RESOLUTION)
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Get distance resolution failed")
            return int.from_bytes(ack.payload[0:2], "little")
        finally:
            self.end_configuration()

    def set_baudrate(self, index: int):
        self.enable_configuration()
        try:
            self.send_command(Command.SET_BAUDRATE, index.to_bytes(2, "little"))
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Set baudrate failed")
        finally:
            self.end_configuration()

    def restart_module(self):
        self.enable_configuration()
        try:
            self.send_command(Command.RESTART)
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Restart failed")
        finally:
            # Module restarts, so we may not get an ACK for end_configuration
            pass

    def restore_factory_settings(self):
        self.enable_configuration()
        try:
            self.send_command(Command.RESTORE_FACTORY)
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Restore factory settings failed")
        finally:
            self.end_configuration()

    def set_bluetooth(self, enable: bool):
        self.enable_configuration()
        try:
            val = 1 if enable else 0
            self.send_command(Command.BLUETOOTH_ENABLE, val.to_bytes(2, "little"))
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Set bluetooth failed")
        finally:
            self.end_configuration()

    def get_mac_address(self) -> str:
        self.enable_configuration()
        try:
            self.send_command(Command.GET_MAC, b"\x01\x00")
            ack = self.read_ack()
            if ack.status != 0:
                raise RuntimeError("Get MAC address failed")
            
            # The documentation mentions a fixed 0x00 byte, but the actual 
            # hardware returns exactly the 6 bytes of the MAC address.
            mac_bytes = ack.payload[0:6]
            return ":".join(f"{b:02X}" for b in mac_bytes)
        finally:
            self.end_configuration()