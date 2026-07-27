from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_manager
from app.services.manager import PipelineManager

router = APIRouter()



class GateSensitivityRequest(BaseModel):
    gate: int  # -1 for all gates
    motion: int
    static: int

@router.post("/sensitivity", tags=["radar"])
async def set_gate_sensitivity(
    req: GateSensitivityRequest,
    manager: PipelineManager = Depends(get_manager)
) -> dict[str, str]:
    """Set the motion and static sensitivity for a specific distance gate."""
    if manager.radar_service:
        await manager.radar_service.set_gate_sensitivity(req.gate, req.motion, req.static)
    return {"status": "ok"}
