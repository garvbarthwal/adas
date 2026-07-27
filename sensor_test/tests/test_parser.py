import pytest
from ld2410.parser import RadarParser
from ld2410.models import RadarFrame, CommandAck

def test_parse_basic_frame():
    # 0x02 data type, Target=0x03, MoveDist=30, MoveEng=59, StatDist=30, StatEng=100, DetectDist=32
    packet = bytes.fromhex(
        "F4 F3 F2 F1"      # Header
        "0D 00"            # Length 13
        "02"               # Data Type: Basic
        "AA"               # Head
        "03"               # Target State
        "1E 00"            # Moving Dist = 30
        "3B"               # Moving Eng = 59
        "1E 00"            # Stat Dist = 30
        "64"               # Stat Eng = 100
        "20 00"            # Detect Dist = 32
        "55"               # Tail
        "00"               # Check
        "F8 F7 F6 F5"      # Footer
    )
    
    frame = RadarParser.parse(packet)
    assert frame.data_type == 2
    assert frame.target_state == 3
    assert frame.moving_distance == 30
    assert frame.moving_energy == 59
    assert frame.stationary_distance == 30
    assert frame.stationary_energy == 100
    assert frame.detection_distance == 32
    assert frame.max_moving_gate is None

def test_parse_engineering_frame():
    # 0x01 data type, N=8 (9 gates)
    packet = bytes.fromhex(
        "F4 F3 F2 F1"      # Header
        "23 00"            # Length 35
        "01"               # Data Type: Engineering
        "AA"               # Head
        "03"               # Target State
        "1E 00"            # Moving Dist = 30
        "3B"               # Moving Eng = 59
        "1E 00"            # Stat Dist = 30
        "64"               # Stat Eng = 100
        "20 00"            # Detect Dist = 32
        "08"               # Max Move Gate N
        "08"               # Max Stat Gate N
        # Move energies (9 gates)
        "3B 2A 05 03 06 03 07 04 06"
        # Stat energies (9 gates)
        "00 00 64 40 29 14 0C 08 0A"
        "02 01"            # Extra Data
        "55"               # Tail
        "00"               # Check
        "F8 F7 F6 F5"      # Footer
    )
    
    frame = RadarParser.parse(packet)
    assert frame.data_type == 1
    assert frame.max_moving_gate == 8
    assert frame.max_stationary_gate == 8
    assert frame.moving_gate_energies == [59, 42, 5, 3, 6, 3, 7, 4, 6]
    assert frame.stationary_gate_energies == [0, 0, 100, 64, 41, 20, 12, 8, 10]
    assert frame.extra_data == b"\x02\x01"

def test_parse_ack():
    # ACK for read parameter (example)
    packet = bytes.fromhex(
        "FD FC FB FA"
        "08 00"
        "FF 01"
        "00 00"
        "01 00 40 00"
        "04 03 02 01"
    )
    ack = RadarParser.parse_ack(packet)
    assert ack.command == 0x01FF
    assert ack.status == 0
    assert ack.payload == bytes.fromhex("01 00 40 00")

def test_invalid_header():
    packet = bytes.fromhex("00 00 00 00 0D 00 02 AA 03 1E 00 3B 1E 00 64 20 00 55 00 F8 F7 F6 F5")
    with pytest.raises(ValueError, match="Invalid report header"):
        RadarParser.parse(packet)
