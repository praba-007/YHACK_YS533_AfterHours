from typing import Any, Dict
from fastapi import APIRouter

from app.services.ml_service import ml_service

router = APIRouter(prefix="/quality", tags=["Data Quality"])


@router.get("/indicators")
async def get_quality_indicators() -> Dict[str, Any]:
    """
    Get empirical data quality indicators for the MetroPT-3 compressor stream:
    total grid minutes, missing minutes count and percentage, documented gaps,
    gap duration hours, and quality gate thresholds.
    """
    return ml_service.get_data_quality_indicators()
