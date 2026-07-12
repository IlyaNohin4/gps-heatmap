from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://user:password@localhost/gps_heatmap"
    REDIS_URL: str = "redis://localhost:6379"
    ENVIRONMENT: str = "development"
    JWT_SECRET: str = "change_me"
    JWT_EXPIRES_DAYS: int = 30
    RESEND_API_KEY: str = ""
    ORS_API_KEY: str = ""
    MAX_FILE_SIZE_MB: int = 20
    NOMINATIM_USER_AGENT: str = "gps-heatmap/1.0 (change-me@example.com)"
    # Dev-only gate: in production frontend+API are same-origin behind nginx (see deploy/nginx.conf),
    # so CORS never triggers there. This exists for local dev (Vite on :5173 vs API on :8000).
    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {"env_file": ".env"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    def model_post_init(self, __context):
        if self.ENVIRONMENT == "production" and self.JWT_SECRET == "change_me":
            raise RuntimeError(
                "Production environment detected but JWT_SECRET is set to default 'change_me'. "
                "Set a secure JWT_SECRET in .env before running production."
            )


settings = Settings()
