"""Application configuration loaded from environment variables."""

import logging
import os
from functools import lru_cache

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    PROJECT_ID: str = "korondy-tutor"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    PERPLEXITY_API_KEY: str = ""
    PRIMARY_MODEL: str = "claude-opus-4-6"
    FALLBACK_MODEL: str = "gpt-5.4"
    FIRESTORE_DATABASE: str = "(default)"
    CORS_ORIGINS: list[str] = [
        "https://korondy.com",
        "http://localhost:3000",
    ]
    RATE_LIMIT_PER_MINUTE: int = 10
    MAX_CONCURRENT_RUNS: int = 50
    LOG_LEVEL: str = "INFO"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }

    def load_secrets_from_secret_manager(self) -> None:
        """Attempt to load API keys from GCP Secret Manager if not set via env."""
        keys_to_load = {
            "ANTHROPIC_API_KEY": "anthropic-api-key",
            "OPENAI_API_KEY": "openai-api-key",
            "PERPLEXITY_API_KEY": "perplexity-api-key",
        }

        missing = [k for k, _ in keys_to_load.items() if not getattr(self, k)]
        if not missing:
            return

        try:
            from google.cloud import secretmanager

            client = secretmanager.SecretManagerServiceClient()
            for env_key, secret_id in keys_to_load.items():
                if getattr(self, env_key):
                    continue
                try:
                    name = f"projects/{self.PROJECT_ID}/secrets/{secret_id}/versions/latest"
                    response = client.access_secret_version(request={"name": name})
                    value = response.payload.data.decode("utf-8").strip()
                    object.__setattr__(self, env_key, value)
                    logger.info("Loaded %s from Secret Manager", env_key)
                except Exception as e:
                    logger.warning(
                        "Failed to load secret %s from Secret Manager: %s",
                        secret_id,
                        e,
                    )
        except ImportError:
            logger.warning(
                "google-cloud-secret-manager not installed; "
                "skipping Secret Manager lookup for: %s",
                ", ".join(missing),
            )
        except Exception as e:
            logger.warning("Secret Manager client initialization failed: %s", e)


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings, loading secrets on first call."""
    settings = Settings()

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Attempt to load secrets from Secret Manager if env vars are missing
    settings.load_secrets_from_secret_manager()

    return settings
