from .models import RadarFrame, CommandAck
from .protocol import *


class RadarParser:

    @staticmethod
    def parse(packet: bytes) -> RadarFrame:

        if packet[:4] != REPORT_HEADER:
            raise ValueError("Invalid report header")

        if packet[-4:] != REPORT_FOOTER:
            raise ValueError("Invalid report footer")

        payload = packet[6:-4]

        data_type = payload[0]

        if data_type not in (DATA_TYPE_BASIC, DATA_TYPE_ENGINEERING):
            raise NotImplementedError(
                f"Unsupported report type {hex(data_type)}"
            )

        if payload[1] != FRAME_HEAD:
            raise ValueError("Invalid frame head")

        if payload[-2] != FRAME_TAIL:
            raise ValueError("Invalid frame tail")

        if payload[-1] != FRAME_END:
            raise ValueError("Invalid frame end")

        frame = RadarFrame(
            data_type=data_type,
            target_state=payload[2],
            moving_distance=int.from_bytes(payload[3:5], "little"),
            moving_energy=payload[5],
            stationary_distance=int.from_bytes(payload[6:8], "little"),
            stationary_energy=payload[8],
            detection_distance=int.from_bytes(payload[9:11], "little"),
            raw_packet=packet,
        )

        if data_type == DATA_TYPE_ENGINEERING:
            frame.max_moving_gate = payload[11]
            frame.max_stationary_gate = payload[12]

            num_move = frame.max_moving_gate + 1
            num_rest = frame.max_stationary_gate + 1

            start_move = 13
            start_rest = start_move + num_move
            start_extra = start_rest + num_rest

            frame.moving_gate_energies = list(payload[start_move : start_rest])
            frame.stationary_gate_energies = list(payload[start_rest : start_extra])
            frame.extra_data = payload[start_extra : -2]

        return frame

    @staticmethod
    def parse_ack(packet: bytes) -> CommandAck:

        if packet[:4] != COMMAND_HEADER:
            raise ValueError("Invalid command header")

        if packet[-4:] != COMMAND_FOOTER:
            raise ValueError("Invalid command footer")

        payload = packet[6:-4]

        command = int.from_bytes(
            payload[0:2],
            "little"
        )

        status = int.from_bytes(
            payload[2:4],
            "little"
        )

        data = payload[4:]

        return CommandAck(
            command=command,
            status=status,
            payload=data,
            raw_packet=packet,
        )