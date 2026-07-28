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
      rxCharRef.current = await service.getCharacteristic(RX_CHAR_UUID);
      txCharRef.current = await service.getCharacteristic(TX_CHAR_UUID);

      // 4. Connect WebSocket to AWS backend
      const wsUrl = config.wsBaseUrl.replace("http", "ws") + "/ws/radar-stream?cameraId=carcam";
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");
        
        // 5. Start listening to radar BLE stream and forward to WebSocket
        await rxCharRef.current.startNotifications();
        rxCharRef.current.addEventListener('characteristicvaluechanged', (event: any) => {
          const value: DataView = event.target.value;
          const buffer = new Uint8Array(value.buffer);
          
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(buffer);
          }
        });
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
