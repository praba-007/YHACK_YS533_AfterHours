from typing import Any, Dict
from fastapi import APIRouter

from app.services.ml_service import ml_service

router = APIRouter(prefix="/evaluation", tags=["Pipeline Evaluation & Baselines"])


@router.get("/events")
async def get_failure_events_evaluation() -> Dict[str, Any]:
    """
    Get evaluation results against documented ground-truth failure events (F1–F4):
    detection status, predictive lead time hours, alert timestamps, and severity.
    """
    return ml_service.get_failure_events_evaluation()


@router.get("/baselines")
async def get_baselines_comparison() -> Dict[str, Any]:
    """
    Get performance comparison between MachPulse (Mahalanobis) and baseline detectors:
    naive fixed threshold (Motor_current > 4A), on-board LPS alarm, and Isolation Forest.
    """
    return ml_service.get_baselines_comparison()


@router.get("/summary")
async def get_pipeline_summary() -> Dict[str, Any]:
    """
    Get full ML pipeline summary: model parameters, calibrated thresholds,
    feature windows, dataset partition sizes, and execution performance.
    """
    return ml_service.get_pipeline_summary()
