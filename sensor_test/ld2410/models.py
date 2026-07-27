from dataclasses import dataclass


@dataclass(slots=True)
class RadarFrame:
    data_type: int

    target_state: int

    moving_distance: int
    moving_energy: int

    stationary_distance: int
    stationary_energy: int

    detection_distance: int

    raw_packet: bytes

    # Engineering Mode Fields
    max_moving_gate: int | None = None
    max_stationary_gate: int | None = None
    moving_gate_energies: list[int] | None = None
    stationary_gate_energies: list[int] | None = None
    extra_data: bytes | None = None


@dataclass(slots=True)
class CommandAck:
    """
    Generic ACK packet returned by the radar.
    """

    command: int
    status: int
    payload: bytes
    raw_packet: bytes


@dataclass(slots=True)
class FirmwareInfo:
    firmware_type: int
    major_version_bytes: bytes
    minor_version_bytes: bytes

    @property
    def version_string(self) -> str:
        # Major version is typically 2 bytes, e.g., 0x01 0x07 for V1.07
        # Wait, if 0x01 0x07, little endian parsing gave 0x0701? 
        # Actually it's better to format from bytes.
        
        # In example: 07 01 -> 0x01 0x07 -> V1.07
        # Ours: 44 02 -> 0x02 0x44 -> V2.44?
        major = f"{self.major_version_bytes[1]:X}.{self.major_version_bytes[0]:02X}"

        # Minor version is 4 bytes, e.g., 16 15 09 22 -> 22091615
        # Byte 3: Year, Byte 2: Month, Byte 0: Day, Byte 1: Time?
        y = f"{self.minor_version_bytes[3]:02X}"
        m = f"{self.minor_version_bytes[2]:02X}"
        d = f"{self.minor_version_bytes[0]:02X}"
        t = f"{self.minor_version_bytes[1]:02X}"

        return f"V{major}.{y}{m}{d}{t}"

@dataclass(slots=True)
class RadarConfiguration:
    max_distance_gate: int
    max_motion_distance_gate: int
    max_stationary_distance_gate: int
    motion_sensitivities: list[int]
    stationary_sensitivities: list[int]
    unoccupied_duration_s: int