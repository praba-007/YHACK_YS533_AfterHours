import os
from typing import List


class Settings:
    PROJECT_NAME: str = "MachPulse API"
    TAGLINE: str = "From Machine Signals to Maintenance Decisions."
    API_PREFIX: str = "/api"

    # Specific origins allowed for local frontend development & deployment
    DEFAULT_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @property
    def CORS_ORIGINS(self) -> List[str]:
        raw_origins = os.getenv("CORS_ORIGINS", "") or os.getenv("ALLOWED_ORIGINS", "")
        if raw_origins:
            if raw_origins.strip() == "*":
                return ["*"]
            custom = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
            return custom + self.DEFAULT_CORS_ORIGINS
        return self.DEFAULT_CORS_ORIGINS

    CORS_ORIGIN_REGEX: str = os.getenv("CORS_ORIGIN_REGEX", r"^https:\/\/.*\.netlify\.app$")

    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")


settings = Settings()
