/** Subscribes to the `/ws/detections` channel and feeds the store. */

import { useEffect } from "react";
import { ReconnectingSocket } from "@/services/websocket";
import { wsUrl } from "@/services/config";
import { useStore } from "@/store/useStore";
import type { DetectionMessage } from "@/types";

export function useDetectionSocket(cameraId?: string): void {
  const setDetection = useStore((s) => s.setDetection);
  const setState = useStore((s) => s.setDetectionSocket);
  const pushAlert = useStore((s) => s.pushAlert);

  useEffect(() => {
    const socket = new ReconnectingSocket<DetectionMessage>({
      url: wsUrl("detections", cameraId),
      onMessage: setDetection,
      onStateChange: (state) => {
        setState(state);
        if (state === "closed") {
          pushAlert("warning", "Detection channel disconnected — reconnecting…");
        }
      },
    });
    socket.connect();
    return () => socket.close();
  }, [cameraId, setDetection, setState, pushAlert]);
}
