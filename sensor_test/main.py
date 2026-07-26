import serial

# -----------------------------
# Configuration
# -----------------------------
PORT = "/dev/ttyUSB0"      # Linux
# PORT = "COM5"            # Windows

BAUDRATE = 256000

HEADER = b"\xF4\xF3\xF2\xF1"
FOOTER = b"\xF8\xF7\xF6\xF5"

# Total bytes in a normal engineering packet
PACKET_SIZE = 23


def print_packet(packet: bytes):
    """Pretty-print one packet."""

    print("\n" + "=" * 60)
    print("LD2410 Packet")
    print("=" * 60)

    print("Header :", packet[:4].hex(" ").upper())
    print("Length :", packet[4:6].hex(" ").upper())
    print("Payload:", packet[6:-4].hex(" ").upper())
    print("Footer :", packet[-4:].hex(" ").upper())

    print("\nRaw Packet:")
    print(packet.hex(" ").upper())


def main():

    print(f"Opening {PORT} @ {BAUDRATE} baud...")

    ser = serial.Serial(
        port=PORT,
        baudrate=BAUDRATE,
        timeout=1
    )

    print("Connected to LD2410!\n")

    buffer = bytearray()

    try:

        while True:

            # Read whatever bytes are currently available
            data = ser.read(128)

            if not data:
                continue

            buffer.extend(data)

            while True:

                # Search for packet header
                start = buffer.find(HEADER)

                if start == -1:
                    # Header not found, keep only last few bytes
                    if len(buffer) > 4:
                        buffer = buffer[-4:]
                    break

                # Wait until full packet is available
                if len(buffer) < start + PACKET_SIZE:
                    break

                packet = bytes(buffer[start:start + PACKET_SIZE])

                # Verify footer
                if packet[-4:] == FOOTER:

                    print_packet(packet)

                    # Remove processed packet
                    buffer = buffer[start + PACKET_SIZE:]

                else:
                    # Invalid packet, discard first header byte
                    buffer = buffer[start + 1:]

    except KeyboardInterrupt:
        print("\nStopping...")

    finally:
        ser.close()


if __name__ == "__main__":
    main()