/**
 * Manages the WHEP WebRTC session lifecycle against a <video> ref.
 * Retries on failure so the video self-heals after stream interruptions.
 */

import { useEffect, RefObject } from "react";
import { startWhep, type WhepSession } from "@/services/webrtc";
import { config } from "@/services/config";
import { useStore } from "@/store/useStore";

export function useWebRTC(videoRef: RefObject<HTMLVideoElement>): void {
  const setVideoState = useStore((s) => s.setVideoState);
  const pushAlert = useStore((s) => s.pushAlert);
  // Only pull from MediaMTX when in "mediamtx" mode; in "browser" mode the
  // local webcam drives the video element instead (see useBrowserCamera).
  const sourceMode = useStore((s) => s.sourceMode);

  useEffect(() => {
    if (sourceMode !== "mediamtx") return;

    let session: WhepSession | null = null;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        setVideoState("connecting");
        session = await startWhep(config.webrtcUrl, video, (state) => {
          setVideoState(state);
          if ((state === "failed" || state === "disconnected") && !cancelled) {
            pushAlert("warning", "Video stream lost — reconnecting…");
            retry = setTimeout(connect, 2000);
          }
        });
      } catch {
        if (!cancelled) {
          setVideoState("failed");
          retry = setTimeout(connect, 2000);
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      session?.close();
      setVideoState("idle");
    };
  }, [sourceMode, videoRef, setVideoState, pushAlert]);
}
