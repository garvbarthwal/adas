import { useState, useRef, useEffect } from "react";
import { config } from "@/services/config";

// LD2410 BLE UUIDs
const SERVICE_UUID = 0xFFF0;
const RX_CHAR_UUID = 0xFFF1; // Device sends data to us on this characteristic
const TX_CHAR_UUID = 0xFFF2; // We write commands to this characteristic

export function useRadarBluetooth() {
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  
  const deviceRef = useRef<any>(null);
  const rxCharRef = useRef<any>(null);
  const txCharRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const disconnect = async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (rxCharRef.current) {
      try {
        await rxCharRef.current.stopNotifications();
      } catch (e) {}
      rxCharRef.current = null;
    }

    txCharRef.current = null;
    
    if (deviceRef.current && deviceRef.current.gatt.connected) {
      try {
        deviceRef.current.gatt.disconnect();
      } catch (e) {}
    }
    deviceRef.current = null;
    
    setStatus("disconnected");
  };

  const connect = async () => {
    if (!("bluetooth" in navigator)) {
      alert("Web Bluetooth API not supported in this browser. Please use Chrome on Android, Windows, or Mac.");
      return;
    }

    try {
      setStatus("connecting");
      
      // 1. Request Bluetooth Device (Shows browser popup)
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: 'HLK' },
          { namePrefix: 'LD2410' }
        ],
        optionalServices: [SERVICE_UUID]
      });

      deviceRef.current = device;

      device.addEventListener('gattserverdisconnected', disconnect);

      // 2. Connect GATT Server
      const server = await device.gatt.connect();
      
      // 3. Get Service and Characteristics
      const service = await server.getPrimaryService(SERVICE_UUID);
      const char1 = await service.getCharacteristic(0xFFF1);
      const char2 = await service.getCharacteristic(0xFFF2);

      // 4. Connect WebSocket to local backend
      const wsUrl = config.wsBaseUrl.replace("http", "ws") + "/ws/radar-stream?cameraId=carcam";
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");
        
        console.log("Starting BLE notifications on BOTH characteristics...");
        
        const handleData = (charName: string) => (event: any) => {
          const value: DataView = event.target.value;
          const buffer = new Uint8Array(value.buffer);
          console.log(`[BLE ${charName}] ${buffer.length} bytes:`, Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join(' '));
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(buffer);
          }
        };

        // Try subscribing to FFF1
        try {
          if (char1.properties.notify || char1.properties.indicate) {
            await char1.startNotifications();
            char1.addEventListener('characteristicvaluechanged', handleData("FFF1"));
            rxCharRef.current = char1;
            txCharRef.current = char2;
            console.log("Subscribed to FFF1");
          }
        } catch (e) { console.log("FFF1 is not notifiable"); }

        // Try subscribing to FFF2
        try {
          if (char2.properties.notify || char2.properties.indicate) {
            await char2.startNotifications();
            char2.addEventListener('characteristicvaluechanged', handleData("FFF2"));
            rxCharRef.current = char2;
            txCharRef.current = char1;
            console.log("Subscribed to FFF2");
          }
        } catch (e) { console.log("FFF2 is not notifiable"); }

        // 5.5 Send LD2410 Bluetooth Unlock Password ("adasgb")
        // The LD2410 will not stream BLE data until it receives this auth frame!
        // The Bluetooth auth command is 0xA8, and the password is 6 bytes.
        const authFrame = new Uint8Array([
          0xFD, 0xFC, 0xFB, 0xFA,             // Header
          0x08, 0x00,                         // Length (8 bytes)
          0xA8, 0x00,                         // Command (Auth: 0xA8)
          0x61, 0x64, 0x61, 0x73, 0x67, 0x62, // "adasgb" in HEX
          0x04, 0x03, 0x02, 0x01              // Footer
        ]);
        try {
          await txCharRef.current.writeValueWithoutResponse(authFrame);
          console.log("Sent BLE Auth Frame for password 'adasgb'");
        } catch (e) {
          console.error("Failed to send auth frame:", e);
        }
      };

      ws.onclose = () => {
        disconnect();
      };

      // 6. Handle incoming configuration commands from AWS Backend -> BLE TX
      ws.onmessage = async (event) => {
        if (!txCharRef.current) return;
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          try {
            await txCharRef.current.writeValueWithoutResponse(new Uint8Array(data));
          } catch (e) {
            console.error("Failed to write to radar:", e);
          }
        }
      };
      
    } catch (e: any) {
      console.error("Web Bluetooth connection failed:", e);
      if (e.name !== 'NotFoundError') { // Ignore user canceling popup
        alert(`Bluetooth Connection failed: ${e.message || String(e)}`);
      }
      disconnect();
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return { connect, disconnect, status };
}
