import { useState, useRef, useEffect } from "react";
import { config } from "@/services/config";

export function useRadarWebSerial() {
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  
  const portRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef(false);

  const disconnect = async () => {
    keepReadingRef.current = false;
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (e) {}
      readerRef.current = null;
    }
    
    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (e) {}
      portRef.current = null;
    }
    
    setStatus("disconnected");
  };

  const connect = async () => {
    if (!("serial" in navigator)) {
      alert("Web Serial API not supported in this browser. Please use Chrome/Edge on Desktop or Android.");
      return;
    }

    try {
      setStatus("connecting");
      
      // 1. Request port (shows browser popup)
      const port = await (navigator as any).serial.requestPort();
      portRef.current = port;
      
      // 2. Open serial port (LD2410 baudrate is 256000)
      await port.open({ baudRate: 256000 });
      
      // 3. Connect WebSocket to backend
      const wsUrl = config.wsBaseUrl + "/ws/radar-stream";
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        startReading();
      };

      ws.onclose = () => {
        disconnect();
      };

      // 4. Handle incoming commands from Backend -> Serial
      ws.onmessage = async (event) => {
        if (!portRef.current) return;
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          const writer = portRef.current.writable.getWriter();
          await writer.write(new Uint8Array(data));
          writer.releaseLock();
        }
      };
      
    } catch (e: any) {
      console.error("Web Serial connection failed:", e);
      alert(`Connection failed: ${e.message || String(e)}\n\nMake sure no other program is using the COM port and that you are using HTTPS or localhost.`);
      disconnect();
    }
  };

  const startReading = async () => {
    keepReadingRef.current = true;
    while (portRef.current && portRef.current.readable && keepReadingRef.current) {
      const reader = portRef.current.readable.getReader();
      readerRef.current = reader;
      
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && wsRef.current?.readyState === WebSocket.OPEN) {
            // Forward chunk to backend
            wsRef.current.send(value);
          }
        }
      } catch (error) {
        console.error("Serial read error:", error);
      } finally {
        reader.releaseLock();
      }
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return { connect, disconnect, status };
}
