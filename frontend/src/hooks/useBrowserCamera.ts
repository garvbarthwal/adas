/**
 * Browser Camera Mode (development).
 *
 * When active, captures this device's webcam via getUserMedia, shows it locally
 * in the <video> element (instant, low-latency preview) AND publishes it to the
 * backend over WebRTC (WHIP) so the detection pipeline runs on the same frames.
 * Detections still arrive over the normal /ws/detections channel and render on
 * the canvas overlay.
 *
 * Gated by `browserCameraActive` in the store — driven by the "Start Camera"
 * button — so capture only begins on an explicit user gesture (required for
 * getUserMedia permission anyway).
 */

import { useEffect, RefObject } from "react";
import { publishStream, type WhipPublisher } from "@/services/whip";
import { ingestUrl, config } from "@/services/config";
import { useStore } from "@/store/useStore";

export function useBrowserCamera(videoRef: RefObject<HTMLVideoElement>): void {
  const active = useStore((s) => s.browserCameraActive);
  const setVideoState = useStore((s) => s.setVideoState);
  const setBrowserCameraActive = useStore((s) => s.setBrowserCameraActive);
  const pushAlert = useStore((s) => s.pushAlert);

  useEffect(() => {
    if (!active) return;

    let stream: MediaStream | null = null;
    let publisher: WhipPublisher | null = null;
    let cancelled = false;

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        setVideoState("connecting");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Local preview = exactly what the backend will analyze.
        video.srcObject = stream;

        publisher = await publishStream(
          ingestUrl(config.cameraId),
          stream,
          (state) => {
            setVideoState(state);
            if (state === "failed") {
              pushAlert("error", "Browser camera publish failed");
            }
          },
        );
        pushAlert("info", "Browser camera started — publishing to backend");
      } catch (err) {
        if (!cancelled) {
          setVideoState("failed");
          const msg =
            err instanceof DOMException && err.name === "NotAllowedError"
              ? "Camera permission denied"
              : "Could not start browser camera";
          pushAlert("error", msg);
          setBrowserCameraActive(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      publisher?.close();
      stream?.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
      setVideoState("idle");
    };
  }, [active, videoRef, setVideoState, setBrowserCameraActive, pushAlert]);
}
