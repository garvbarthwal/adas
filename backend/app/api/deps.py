"""FastAPI dependencies."""

from __future__ import annotations

from fastapi import Request

from app.services.manager import PipelineManager


def get_manager(request: Request) -> PipelineManager:
    """Return the application-wide :class:`PipelineManager` from app state."""
    return request.app.state.manager
