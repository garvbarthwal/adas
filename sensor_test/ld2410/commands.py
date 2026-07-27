"""
LD2410C Command Words

Every command below comes directly from
Section 2.2 of the official protocol.
"""


class Command:

    # --------------------------------------------------------
    # Configuration Mode
    # --------------------------------------------------------

    ENABLE_CONFIGURATION = 0x00FF
    END_CONFIGURATION = 0x00FE

    # --------------------------------------------------------
    # Configuration
    # --------------------------------------------------------

    WRITE_PARAMETERS = 0x0060
    READ_PARAMETERS = 0x0061

    ENABLE_ENGINEERING_MODE = 0x0062
    DISABLE_ENGINEERING_MODE = 0x0063

    SET_GATE_SENSITIVITY = 0x0064

    # --------------------------------------------------------
    # System
    # --------------------------------------------------------

    READ_FIRMWARE = 0x00A0

    SET_BAUDRATE = 0x00A1

    RESTORE_FACTORY = 0x00A2

    RESTART = 0x00A3

    # --------------------------------------------------------
    # Bluetooth
    # --------------------------------------------------------

    BLUETOOTH_ENABLE = 0x00A4

    GET_MAC = 0x00A5

    GET_BLUETOOTH_PERMISSION = 0x00A8

    SET_BLUETOOTH_PASSWORD = 0x00A9

    # --------------------------------------------------------
    # Distance Resolution
    # --------------------------------------------------------

    SET_DISTANCE_RESOLUTION = 0x00AA

    GET_DISTANCE_RESOLUTION = 0x00AB