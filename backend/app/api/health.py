from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """Server health check endpoint.
    Returns the operating status and service name.
    """
    return HealthResponse(
        status="ok",
        service="MachPulse API",
    )
