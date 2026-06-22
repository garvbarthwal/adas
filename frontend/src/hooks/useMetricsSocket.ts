/** Subscribes to the `/ws/metrics` channel and feeds the store. */

import { useEffect, useRef } from "react";
import { ReconnectingSocket } from "@/services/websocket";
import { wsUrl } from "@/services/config";
import { useStore } from "@/store/useStore";
import type { CameraMetrics } from "@/types";

export function useMetricsSocket(cameraId?: string): void {
  const setMetrics = useStore((s) => s.setMetrics);
  const setState = useStore((s) => s.setMetricsSocket);
  const pushAlert = useStore((s) => s.pushAlert);
  // Track previous stream status to alert only on transitions.
  const prevStream = useRef<string | null>(null);

  useEffect(() => {
    const socket = new ReconnectingSocket<CameraMetrics>({
      url: wsUrl("metrics", cameraId),
      onMessage: (m) => {
        setMetrics(m);
        if (prevStream.current && prevStream.current !== m.streamStatus) {
          if (m.streamStatus === "offline") {
            pushAlert("error", `Stream ${m.cameraId} went offline`);
          } else if (m.streamStatus === "online") {
            pushAlert("info", `Stream ${m.cameraId} is online`);
          }
        }
        prevStream.current = m.streamStatus;
      },
      onStateChange: setState,
    });
    socket.connect();
    return () => socket.close();
  }, [cameraId, setMetrics, setState, pushAlert]);
}
