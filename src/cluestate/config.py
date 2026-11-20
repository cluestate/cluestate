"""Configuration via environment variables with sensible defaults."""

import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


def _load_or_create_secret_key() -> str:
    """Persist auto-generated secret key locally so server restarts do not invalidate active sessions."""
    secret_file = Path(".cluestate_secret")
    try:
        if secret_file.is_file():
            existing = secret_file.read_text(encoding="utf-8").strip()
            if len(existing) >= 32:
                return existing
        generated = secrets.token_urlsafe(32)
        secret_file.write_text(generated, encoding="utf-8")
        try:
            os.chmod(secret_file, 0o600)
        except OSError:
            pass
        return generated
    except OSError:
        return secrets.token_urlsafe(32)


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # ─── LLM ───
    llm_model: str = "openai/gpt-4o-mini"
    judge_model: str = ""  # Optional dedicated Critic/Judge model (defaults to resolved_llm_model)
    vision_model: str = ""  # Optional dedicated Vision model for images/scanned PDFs (defaults to resolved_llm_model)

    # Provider keys (LiteLLM reads these automatically)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    mistral_api_key: str = ""

    # ─── Database ───
    database_url: str = "sqlite+aiosqlite:///./cluestate.db"

    # ─── Server & Platform ───
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "info"
    app_url: str = "https://app.cluestate.com"
    cors_origins: str = "*"

    # ─── Security & Authentication ───
    secret_key: str = Field(default_factory=_load_or_create_secret_key)
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    api_key: str = ""  # Optional static master API key for single-tenant / CLI automation
    allow_signup: bool = False  # Off by default after initial admin account setup

    # ─── Extraction Tuning ───
    max_retries: int = 2
    default_confidence: float = 0.5
    conflict_threshold: float = 0.7
    max_context_memories: int = 50

    # ─── Hosted Guardrails (0 = unlimited for local self-hosting) ───
    rate_limit_ingest_per_min: int = 0
    max_ingests_per_workspace_month: int = 0

    # ─── Multimodal Media Storage & Async Queue Worker ───
    upload_dir: str = "./uploads"
    store_uploaded_media: bool = True
    max_upload_size_mb: int = 10
    enable_ingest_worker: bool = True
    ingest_worker_concurrency: int = 2
    ingest_worker_poll_seconds: float = 1.0
    ingest_job_max_attempts: int = 4

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }

    @property
    def resolved_llm_model(self) -> str:
        """
        Return configured LLM model, auto-detecting a sensible default if the user
        provided a non-OpenAI provider key without overriding LLM_MODEL.
        """
        if self.llm_model != "openai/gpt-4o-mini":
            return self.llm_model
        has_openai = bool(self.openai_api_key or os.environ.get("OPENAI_API_KEY"))
        if has_openai:
            return self.llm_model
        if self.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY"):
            return "anthropic/claude-3-5-haiku-latest"
        if self.gemini_api_key or os.environ.get("GEMINI_API_KEY"):
            return "gemini/gemini-2.0-flash"
        if self.mistral_api_key or os.environ.get("MISTRAL_API_KEY"):
            return "mistral/mistral-small-latest"
        return self.llm_model

    @property
    def resolved_judge_model(self) -> str:
        """Return configured Critic/Judge model, falling back to resolved_llm_model."""
        return self.judge_model.strip() or self.resolved_llm_model

    @property
    def resolved_vision_model(self) -> str:
        """Return configured Vision model for images/scanned PDFs, falling back to resolved_llm_model."""
        return self.vision_model.strip() or self.resolved_llm_model

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
