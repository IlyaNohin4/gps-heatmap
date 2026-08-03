"""Tests for the production-safety guards in app.core.config.Settings.model_post_init."""
import pytest

from app.core.config import Settings


class TestProductionGuards:
    def test_dev_defaults_are_fine(self):
        Settings(ENVIRONMENT="development", JWT_SECRET="change_me",
                 DATABASE_URL="postgresql://user:password@localhost/gps_heatmap")

    def test_production_with_default_jwt_secret_raises(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            Settings(ENVIRONMENT="production", JWT_SECRET="change_me",
                     DATABASE_URL="postgresql://user:s3cr3t@db/gps_heatmap")

    def test_production_with_default_db_password_raises(self):
        # MEDIUM: docker-compose.prod.yml no longer falls back to "password"
        # for POSTGRES_PASSWORD, but DATABASE_URL is set independently — a
        # hand-copied dev .env would still slip a default-password DB URL
        # into production undetected without this guard.
        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            Settings(ENVIRONMENT="production", JWT_SECRET="a-real-secret",
                     DATABASE_URL="postgresql://user:password@db/gps_heatmap")

    def test_production_with_real_secrets_is_fine(self):
        Settings(ENVIRONMENT="production", JWT_SECRET="a-real-secret",
                 DATABASE_URL="postgresql://user:s3cr3t@db/gps_heatmap")
