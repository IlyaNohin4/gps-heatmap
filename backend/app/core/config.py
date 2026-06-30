from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://user:password@localhost/gps_heatmap"
    REDIS_URL: str = "redis://localhost:6379"
    JWT_SECRET: str = "change_me"
    JWT_EXPIRES_DAYS: int = 30
    RESEND_API_KEY: str = ""
    ORS_API_KEY: str = ""
    MAX_FILE_SIZE_MB: int = 20
    NOMINATIM_USER_AGENT: str = "gps-heatmap/1.0 (change-me@example.com)"

    model_config = {"env_file": ".env"}


settings = Settings()
