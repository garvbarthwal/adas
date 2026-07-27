/** Subscribes to the `/ws/detections` channel and feeds the store. */

import { useEffect } from "react";
import { ReconnectingSocket } from "@/services/websocket";
import { wsUrl } from "@/services/config";
import { useStore } from "@/store/useStore";
import type { DetectionMessage } from "@/types";

export function useDetectionSocket(cameraId?: string): void {
  const { setDetection, setDetectionSocket: setState, pushAlert } = useStore.getState();

  useEffect(() => {
    const socket = new ReconnectingSocket<DetectionMessage>({
      url: wsUrl("detections", cameraId),
      onMessage: (data) => setDetection(data.cameraId, data),
      onStateChange: (state) => {
        setState(state);
        if (state === "closed") {
          pushAlert("warning", "Detection channel disconnected — reconnecting…");
        }
      },
    });
    socket.connect();
    return () => socket.close();
  }, [cameraId]);
}
