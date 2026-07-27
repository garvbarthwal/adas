from ld2410 import LD2410


def main():

    radar = LD2410()

    try:

        firmware = radar.read_firmware()

        print()

        print("Firmware Information")
        print("--------------------")
        print("Type   :", firmware.firmware_type)
        print("Major  :", firmware.major_version_bytes.hex())
        print("Minor  :", firmware.minor_version_bytes.hex())
        print("Version:", firmware.version_string)

        config = radar.read_parameters()
        print("\nConfiguration")
        print("-------------")
        print(f"Max distance gate: {config.max_distance_gate}")
        print(f"Max motion gate  : {config.max_motion_distance_gate}")
        print(f"Max station. gate: {config.max_stationary_distance_gate}")
        print(f"Motion sens.     : {config.motion_sensitivities}")
        print(f"Station. sens.   : {config.stationary_sensitivities}")
        print(f"Unoccupied dur.  : {config.unoccupied_duration_s}s")

        print("\nConfiguration Settings")
        print("----------------------")
        resolution = radar.get_distance_resolution()
        print(f"Distance Res.    : {resolution} (0=0.75m, 1=0.2m)")
        
        try:
            mac = radar.get_mac_address()
            print(f"MAC Address      : {mac}")
        except Exception as e:
            print(f"MAC Address      : Failed ({e})")

        print("\nEngineering Mode Test")
        print("---------------------")
        radar.enable_engineering_mode()
        try:
            print("Reading frame...")
            frame = radar.read_frame()
            print(f"Data type       : {frame.data_type}")
            print(f"Target state    : {frame.target_state}")
            print(f"Moving dist     : {frame.moving_distance}")
            print(f"Moving energy   : {frame.moving_energy}")
            print(f"Stationary dist : {frame.stationary_distance}")
            print(f"Stationary eng  : {frame.stationary_energy}")
            
            if frame.data_type == 1: # DATA_TYPE_ENGINEERING
                print(f"Max Move Gate   : {frame.max_moving_gate}")
                print(f"Max Stat Gate   : {frame.max_stationary_gate}")
                print(f"Move Energies   : {frame.moving_gate_energies}")
                print(f"Stat Energies   : {frame.stationary_gate_energies}")
                print(f"Extra Data      : {frame.extra_data.hex() if frame.extra_data else 'None'}")
        finally:
            print("Disabling engineering mode...")
            radar.disable_engineering_mode()

    finally:

        radar.close()


if __name__ == "__main__":
    main()