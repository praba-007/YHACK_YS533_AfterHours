import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.health import router as health_router
from app.api.machine import router as machine_router
from app.api.quality import router as quality_router
from app.api.evaluation import router as evaluation_router
from app.api.ai import router as ai_router
from app.api.replay import router as replay_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.TAGLINE,
    version="0.1.0",
)

# CORS middleware for local frontend development & Netlify deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Register API routers under /api
app.include_router(health_router, prefix=settings.API_PREFIX)
app.include_router(machine_router, prefix=settings.API_PREFIX)
app.include_router(quality_router, prefix=settings.API_PREFIX)
app.include_router(evaluation_router, prefix=settings.API_PREFIX)
app.include_router(ai_router, prefix=settings.API_PREFIX)
app.include_router(replay_router, prefix=settings.API_PREFIX)


@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "tagline": settings.TAGLINE,
        "docs_url": "/docs",
        "health_url": f"{settings.API_PREFIX}/health",
        "endpoints": [
            f"{settings.API_PREFIX}/health",
            f"{settings.API_PREFIX}/machine/health",
            f"{settings.API_PREFIX}/machine/telemetry",
            f"{settings.API_PREFIX}/quality/indicators",
            f"{settings.API_PREFIX}/evaluation/events",
            f"{settings.API_PREFIX}/evaluation/baselines",
            f"{settings.API_PREFIX}/evaluation/summary",
            f"{settings.API_PREFIX}/ai/explain",
            f"{settings.API_PREFIX}/ai/chat",
            f"{settings.API_PREFIX}/ai/status",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)

