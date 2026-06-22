/**
 * WHEP (WebRTC-HTTP Egress Protocol) client for MediaMTX.
 *
 * MediaMTX publishes each path over WebRTC at `<host>:8889/<path>/whep`. This
 * performs the WHEP handshake (recvonly offer → SDP answer) and pipes the
 * resulting MediaStream into a <video> element. Video travels over WebRTC for
 * sub-300ms latency and is completely separate from detection metadata.
 */

export interface WhepSession {
  pc: RTCPeerConnection;
  close: () => void;
}

/**
 * Negotiate a WHEP session and attach the remote video track to `video`.
 *
 * @param whepUrl  Full WHEP endpoint, e.g. https://media.example.com/carcam/whep
 * @param video    Target video element.
 * @param onState  Optional connection-state callback.
 */
export async function startWhep(
  whepUrl: string,
  video: HTMLVideoElement,
  onState?: (state: RTCPeerConnectionState) => void,
): Promise<WhepSession> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // We only receive media.
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  const remote = new MediaStream();
  pc.ontrack = (event) => {
    remote.addTrack(event.track);
    if (video.srcObject !== remote) video.srcObject = remote;
  };

  pc.onconnectionstatechange = () => onState?.(pc.connectionState);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const res = await fetch(whepUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? offer.sdp ?? "",
  });
  if (!res.ok) {
    pc.close();
    throw new Error(`WHEP negotiation failed: ${res.status}`);
  }

  const answerSdp = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return { pc, close: () => pc.close() };
}

/** Resolve once ICE gathering is complete (or after a short timeout). */
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
