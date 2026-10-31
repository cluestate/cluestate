"""Configuration via environment variables with sensible defaults."""

import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # ─── LLM ───
    llm_model: str = "openai/gpt-4o-mini"

    # Provider keys (LiteLLM reads these automatically)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""

    # ─── Database ───
    database_url: str = "sqlite+aiosqlite:///./cluestate.db"

    # ─── Server & Platform ───
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    app_url: str = "https://app.cluestate.com"
    cors_origins: str = "https://app.cluestate.com,https://cluestate.com,http://localhost:5173,http://localhost:8000"

    # ─── Security & Authentication ───
    secret_key: str = secrets.token_urlsafe(32)
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    api_key: str = ""  # Optional static master API key for single-tenant / CLI automation

    # ─── Extraction Tuning ───
    max_retries: int = 2
    default_confidence: float = 0.5
    conflict_threshold: float = 0.7
    max_context_memories: int = 50

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url

    @property
    def parsed_cors_origins(self) -> list[str]:
        if not self.cors_origins or self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sync_database_url(self) -> str:
        """Convert async URL to sync URL for Alembic migrations."""
        return (
            self.database_url
            .replace("sqlite+aiosqlite", "sqlite")
            .replace("postgresql+asyncpg", "postgresql+psycopg")
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
