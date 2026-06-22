"""WebRTC ingest (WHIP) — backend endpoint for "Browser Camera Mode" (dev).

    POST /webrtc/ingest/{camera_id}   body: SDP offer   ->  201 + SDP answer

A browser captures its webcam (``getUserMedia``) and publishes it here over
WebRTC. The inbound video track is attached to the camera's
:class:`WebRTCFrameSource`, after which the normal detection pipeline runs
unchanged. No FFmpeg, no MediaMTX, no terminal — just click "Start Camera".

This endpoint is only meaningful when the camera runs in ``webrtc`` ingest mode
(``INGEST_MODE=webrtc``). ``aiortc`` / PyAV are imported lazily so production
RTSP deployments never need them installed.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Request, Response

from app.api.deps import get_manager
from app.core.logging import get_logger
from app.stream.webrtc_source import WebRTCFrameSource

logger = get_logger(__name__)

router = APIRouter(prefix="/webrtc", tags=["webrtc"])


@router.post("/ingest/{camera_id}")
async def ingest(
    request: Request,
    camera_id: str = Path(description="Target camera id."),
) -> Response:
    """Accept a browser WebRTC publish (WHIP) and feed frames to the pipeline."""
    # Lazy import keeps aiortc optional for RTSP-only deployments.
    try:
        from aiortc import RTCPeerConnection, RTCSessionDescription
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(
            status_code=501,
            detail="WebRTC ingest unavailable: install requirements-dev.txt (aiortc).",
        ) from exc

    manager = get_manager(request)
    pipeline = manager.get(camera_id)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Unknown cameraId")
    if not isinstance(pipeline.source, WebRTCFrameSource):
        raise HTTPException(
            status_code=400,
            detail=f"Camera '{camera_id}' is not in webrtc ingest mode "
            f"(INGEST_MODE={pipeline.ingest_mode}).",
        )

    offer_sdp = (await request.body()).decode("utf-8")
    offer = RTCSessionDescription(sdp=offer_sdp, type="offer")

    pc = RTCPeerConnection()
    _register_pc(request, pc)
    source = pipeline.source

    @pc.on("track")
    def on_track(track) -> None:  # noqa: ANN001
        if track.kind == "video":
            source.attach_track(track)

    @pc.on("connectionstatechange")
    async def on_state() -> None:
        logger.info(
            "Ingest PC state",
            extra={"camera_id": camera_id, "state": pc.connectionState},
        )
        if pc.connectionState in {"failed", "closed", "disconnected"}:
            source.detach()
            await _close_pc(request, pc)

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    # WHIP: 201 Created + SDP answer.
    return Response(
        content=pc.localDescription.sdp,
        media_type="application/sdp",
        status_code=201,
    )


# --------------------------------------------------------------------------- #
# Peer-connection registry (so connections aren't garbage collected and can be
# closed cleanly on shutdown).
# --------------------------------------------------------------------------- #
def _register_pc(request: Request, pc) -> None:  # noqa: ANN001
    pcs = getattr(request.app.state, "ingest_pcs", None)
    if pcs is None:
        pcs = set()
        request.app.state.ingest_pcs = pcs
    pcs.add(pc)


async def _close_pc(request: Request, pc) -> None:  # noqa: ANN001
    pcs = getattr(request.app.state, "ingest_pcs", set())
    if pc in pcs:
        pcs.discard(pc)
        await pc.close()
