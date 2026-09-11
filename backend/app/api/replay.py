"""
Historical Telemetry Replay API Router for MachPulse (Phase 5C.1).
Exposes endpoints to query, start, pause, reset, and configure historical replay speed.
"""
from typing import Any, Dict
from pydantic import BaseModel, Field
from fastapi import APIRouter

from app.services.replay_service import replay_service

router = APIRouter(prefix="/replay", tags=["Historical Replay"])


class SpeedRequest(BaseModel):
    speed: int = Field(description="Replay speed multiplier: 1, 5, or 20")


@router.get("/status")
async def get_replay_status() -> Dict[str, Any]:
    """Get current historical replay status, timestamp, and speed."""
    return replay_service.get_status()


@router.get("/current")
async def get_replay_current() -> Dict[str, Any]:
    """Get current replay observation and machine health."""
    return replay_service.get_current_machine_health()


@router.post("/start")
async def start_replay() -> Dict[str, Any]:
    """Start or resume chronological historical replay."""
    return replay_service.start()


@router.post("/pause")
async def pause_replay() -> Dict[str, Any]:
    """Pause historical replay at current observation timestamp."""
    return replay_service.pause()


@router.post("/reset")
async def reset_replay() -> Dict[str, Any]:
    """Reset historical replay to the first observation."""
    return replay_service.reset()


@router.post("/speed")
async def set_replay_speed(body: SpeedRequest) -> Dict[str, Any]:
    """Set replay speed (1x, 5x, 20x)."""
    return replay_service.set_speed(body.speed)
