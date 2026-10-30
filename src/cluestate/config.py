"""Configuration via environment variables with sensible defaults."""

from pydantic_settings import BaseSettings
from functools import lru_cache


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

    # ─── Server ───
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    # ─── Security ───
    api_key: str = ""  # If set, all requests require this key in Authorization header

    # ─── Extraction tuning ───
    max_retries: int = 2
    default_confidence: float = 0.5
    conflict_threshold: float = 0.7  # Confidence above which a new claim supersedes an old one

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
