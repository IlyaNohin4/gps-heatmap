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

    model_config = {"env_file": ".env"}

    def model_post_init(self, __context):
        if self.ENVIRONMENT == "production" and self.JWT_SECRET == "change_me":
            raise RuntimeError(
                "Production environment detected but JWT_SECRET is set to default 'change_me'. "
                "Set a secure JWT_SECRET in .env before running production."
            )


settings = Settings()
