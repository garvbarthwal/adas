/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) publisher.
 *
 * Publishes a local MediaStream (from getUserMedia) to the backend's ingest
 * endpoint. Used by "Browser Camera Mode" so a developer can feed their laptop
 * webcam to the detection pipeline with no FFmpeg / MediaMTX. This is the
 * mirror of `webrtc.ts` (which *receives* via WHEP); here we *send*.
 */

export interface WhipPublisher {
  pc: RTCPeerConnection;
  close: () => void;
}

/**
 * Negotiate a WHIP publish session, sending every track of `stream` to `url`.
 *
 * @param url     Backend ingest URL, e.g. http://localhost:8000/webrtc/ingest/carcam
 * @param stream  Local MediaStream from getUserMedia.
 * @param onState Optional connection-state callback.
 */
export async function publishStream(
  url: string,
  stream: MediaStream,
  onState?: (state: RTCPeerConnectionState) => void,
): Promise<WhipPublisher> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onconnectionstatechange = () => onState?.(pc.connectionState);

  // Send all local tracks (video, and audio if present).
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? offer.sdp ?? "",
  });
  if (!res.ok) {
    pc.close();
    throw new Error(`WHIP publish failed: ${res.status}`);
  }

  const answerSdp = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return { pc, close: () => pc.close() };
}

/** Resolve once ICE gathering completes (or after a short timeout). */
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 1500): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, timeoutMs);
  });
}
