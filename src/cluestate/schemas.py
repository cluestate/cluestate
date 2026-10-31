"""Pydantic schemas for API requests and responses (separate from DB models)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from .models import (
    ClaimType,
    EntityType,
    MemoryStatus,
    SourceType,
    TopicCardinality,
    UpdatePolicy,
)

# ──────────────────────────────────────────────
# Auth & Workspace Schemas
# ──────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=255)
    workspace_name: str = Field(default="", max_length=255)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class UserRead(BaseModel):
    id: int
    email: str
    full_name: str
    created_at: datetime


class WorkspaceRead(BaseModel):
    id: int
    name: str
    slug: str
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
    workspace: WorkspaceRead
    initial_api_key: Optional[str] = None


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ApiKeyRead(BaseModel):
    id: int
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: Optional[datetime] = None
    created_at: datetime


class ApiKeyCreatedResponse(ApiKeyRead):
    raw_key: str = Field(description="Full API key shown only once upon creation")


# ──────────────────────────────────────────────
# Entity Schemas
# ──────────────────────────────────────────────

class EntityCreate(BaseModel):
    external_id: str = Field(..., min_length=1, max_length=255, description="Your app's unique ID for this entity")
    name: str = Field(default="", max_length=500)
    entity_type: EntityType = EntityType.PERSON
    meta: dict = Field(default_factory=dict)


class EntityRead(BaseModel):
    id: int
    external_id: str
    name: str
    entity_type: EntityType
    meta: dict
    created_at: datetime
    updated_at: datetime
    memory_count: int = 0


class EntityDetail(EntityRead):
    memories: list["MemoryRead"] = []


# ──────────────────────────────────────────────
# Topic Schemas
# ──────────────────────────────────────────────

class TopicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    data_type: str = "text"
    cardinality: TopicCardinality = TopicCardinality.MULTIPLE
    update_policy: UpdatePolicy = UpdatePolicy.APPEND
    temporal: bool = False
    enum_values: list[str] = []


class TopicUpdate(BaseModel):
    description: Optional[str] = None
    data_type: Optional[str] = None
    cardinality: Optional[TopicCardinality] = None
    update_policy: Optional[UpdatePolicy] = None
    temporal: Optional[bool] = None
    enum_values: Optional[list[str]] = None
    is_active: Optional[bool] = None


class TopicRead(BaseModel):
    id: int
    name: str
    description: str
    data_type: str
    cardinality: TopicCardinality
    update_policy: UpdatePolicy
    temporal: bool
    enum_values: list
    schema_version: int = 1
    is_active: bool
    created_at: datetime


# ──────────────────────────────────────────────
# Memory Schemas
# ──────────────────────────────────────────────

class MemoryRead(BaseModel):
    id: int
    entity_id: int
    topic_id: Optional[int]
    topic_name: Optional[str] = None
    claim: str
    value: str
    structured_value: Optional[Any] = None
    claim_type: ClaimType = ClaimType.EXPLICIT
    confidence: float
    status: MemoryStatus
    superseded_by_id: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    evidence: list["EvidenceRead"] = []


class MemoryUpdate(BaseModel):
    status: Optional[MemoryStatus] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


# ──────────────────────────────────────────────
# Episode / Evidence Schemas
# ──────────────────────────────────────────────

class EpisodeRead(BaseModel):
    id: int
    entity_id: int
    source_type: SourceType
    source_record_id: Optional[str] = None
    content: str
    content_hash: str = ""
    source_description: str
    meta: dict
    occurred_at: datetime
    created_at: datetime


class EvidenceRead(BaseModel):
    id: int
    episode_id: int
    excerpt: str
    is_verified: bool = False
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    content_hash: str = ""
    created_at: datetime


# ──────────────────────────────────────────────
# Ingest Schemas
# ──────────────────────────────────────────────

class IngestRequest(BaseModel):
    """Ingest unstructured data about an entity and extract structured state."""
    entity_id: Optional[int] = Field(default=None, description="Internal entity ID (use this OR external_id)")
    external_id: Optional[str] = Field(default=None, description="Your app's entity ID (use this OR entity_id)")
    content: str = Field(..., min_length=1, description="The unstructured text to extract memories from")
    source_type: SourceType = SourceType.CUSTOM
    source_record_id: Optional[str] = Field(default=None, max_length=255, description="Origin CRM, ticket, or order ID")
    idempotency_key: Optional[str] = Field(default=None, max_length=255, description="Optional key to prevent duplicate ingestion")
    occurred_at: Optional[datetime] = Field(default=None, description="Timestamp when the interaction actually occurred")
    source_description: str = Field(default="", description="Human-readable description of the source")
    meta: dict = Field(default_factory=dict, description="Any additional metadata about this ingestion")
    auto_create_entity: bool = Field(default=True, description="If true, create the entity if it doesn't exist")
    entity_name: str = Field(default="", description="Name for auto-created entity")


class IngestResponse(BaseModel):
    episode_id: int
    entity_id: int
    memories_extracted: int
    memories_updated: int
    memories_new: int
    idempotent_replay: bool = False
    memories: list[MemoryRead]


# ──────────────────────────────────────────────
# Intel Schemas
# ──────────────────────────────────────────────

class IntelResponse(BaseModel):
    """Formatted entity state ready for customer service, personalization, or AI prompts."""
    entity_id: int
    entity_name: str
    entity_type: EntityType
    formatted_prompt: str = Field(description="Ready-to-use text block for system context")
    memories: list[MemoryRead] = []
    total_memories: int = 0
    total_episodes: int = 0
