"""
HLK LD2410C Protocol Definitions

Reference:
HLK-LD2410C Human Presence Sensing Module
Serial Communication Protocol V1.00
"""

# ============================================================
# UART
# ============================================================

DEFAULT_PORT = "/dev/ttyUSB0"
DEFAULT_BAUDRATE = 256000
DEFAULT_TIMEOUT = 1

# ============================================================
# Radar Report Frame
# ============================================================

REPORT_HEADER = b"\xF4\xF3\xF2\xF1"
REPORT_FOOTER = b"\xF8\xF7\xF6\xF5"

REPORT_HEADER_SIZE = 4
REPORT_LENGTH_SIZE = 2
REPORT_FOOTER_SIZE = 4

# ============================================================
# Command Frame
# ============================================================

COMMAND_HEADER = b"\xFD\xFC\xFB\xFA"
COMMAND_FOOTER = b"\x04\x03\x02\x01"

COMMAND_HEADER_SIZE = 4
COMMAND_LENGTH_SIZE = 2
COMMAND_FOOTER_SIZE = 4

# ============================================================
# Report Data Types
# ============================================================

DATA_TYPE_ENGINEERING = 0x01
DATA_TYPE_BASIC = 0x02

FRAME_HEAD = 0xAA
FRAME_TAIL = 0x55
FRAME_END = 0x00

# ============================================================
# Target States
# ============================================================

TARGET_NONE = 0x00
TARGET_MOVING = 0x01
TARGET_STATIONARY = 0x02
TARGET_BOTH = 0x03

TARGET_STATE_NAMES = {
    TARGET_NONE: "No Target",
    TARGET_MOVING: "Moving",
    TARGET_STATIONARY: "Stationary",
    TARGET_BOTH: "Moving + Stationary",
}