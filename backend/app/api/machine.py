from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query

from app.services.ml_service import ml_service

router = APIRouter(prefix="/machine", tags=["Machine Health & Telemetry"])


@router.get("/health")
async def get_machine_health() -> Dict[str, Any]:
    """
    Get current / latest machine health status.
    Includes operating state, anomaly distance, calibrated thresholds,
    decision (MONITOR / INSPECT / MAINTAIN / INSUFFICIENT_EVIDENCE),
    top contributing sensors, and current sensor telemetry.
    """
    return ml_service.get_latest_machine_health()


@router.get("/telemetry")
async def get_recent_telemetry(
    limit: int = Query(default=60, ge=1, le=200, description="Number of recent 1-minute grid points to retrieve")
) -> List[Dict[str, Any]]:
    """
    Get recent sensor telemetry and anomaly score trajectory for charting.
    Returns real 1-minute grid sensor values (Motor_current, TP2, TP3, H1, Oil_temperature, DV_pressure),
    operating states, coverage, and Mahalanobis distances.
    """
    return ml_service.get_recent_telemetry(limit=limit)
