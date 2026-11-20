"""Pydantic schemas for API requests and responses (separate from DB models)."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from .models import (
    DEFAULT_EXTRACTION_POLICY,
    DEFAULT_SOURCE_TYPES,
    ClaimType,
    EntityType,
    MemoryStatus,
    TopicCardinality,
    UpdatePolicy,
    WorkspaceRole,
    normalize_extraction_policy,
    normalize_source_type,
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
    owner_id: Optional[int] = None
    role: Optional[WorkspaceRole] = None
    extraction_policy: dict[str, Any] = Field(default_factory=lambda: dict(DEFAULT_EXTRACTION_POLICY))
    source_types: list[str] = Field(default_factory=lambda: list(DEFAULT_SOURCE_TYPES))
    created_at: datetime

    @field_validator("extraction_policy", mode="before")
    @classmethod
    def _ensure_policy(cls, v: Any) -> dict[str, Any]:
        return normalize_extraction_policy(v if isinstance(v, dict) else None)


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    clone_schema_from_workspace_id: Optional[int] = None


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    extraction_policy: Optional[dict[str, Any]] = None


class WorkspaceMemberRead(BaseModel):
    id: int
    workspace_id: int
    user_id: int
    email: str
    full_name: str
    role: WorkspaceRole
    joined_at: datetime


class WorkspaceMemberAdd(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    role: WorkspaceRole = WorkspaceRole.MEMBER


class WorkspaceMemberUpdate(BaseModel):
    role: WorkspaceRole


class WorkspaceInviteCreate(BaseModel):
    email: str = Field(default="", max_length=255)
    role: WorkspaceRole = WorkspaceRole.MEMBER
    expires_in_days: int = Field(default=7, ge=1, le=90)


class WorkspaceInviteRead(BaseModel):
    id: int
    workspace_id: int
    workspace_name: str = ""
    token: str
    email: str = ""
    role: WorkspaceRole
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    created_at: datetime


class InviteAcceptRequest(BaseModel):
    email: Optional[str] = None
    full_name: str = ""
    password: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
    workspace: WorkspaceRead
    workspaces: list[WorkspaceRead] = []
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
    state: dict[str, Any] = Field(default_factory=dict)


class EntityDetail(EntityRead):
    memories: list["MemoryRead"] = []


# ──────────────────────────────────────────────
# Topic / Memory Tag Schemas
# ──────────────────────────────────────────────

class TopicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    label: str = ""
    description: str = ""
    extraction_instructions: str = ""
    examples: list[Any] = []
    data_type: str = "text"
    cardinality: TopicCardinality = TopicCardinality.MULTIPLE
    update_policy: UpdatePolicy = UpdatePolicy.APPEND
    temporal: bool = False
    ttl_days: Optional[int] = Field(default=None, ge=1, le=3650)
    enum_values: list[str] = []
    allow_custom_values: bool = False
    allow_inferred: bool = True
    min_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    constraints: dict[str, Any] = Field(default_factory=dict)
    applies_to_entity_types: list[str] = Field(default_factory=list)


class TopicUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    extraction_instructions: Optional[str] = None
    examples: Optional[list[Any]] = None
    data_type: Optional[str] = None
    cardinality: Optional[TopicCardinality] = None
    update_policy: Optional[UpdatePolicy] = None
    temporal: Optional[bool] = None
    ttl_days: Optional[int] = None
    enum_values: Optional[list[str]] = None
    allow_custom_values: Optional[bool] = None
    allow_inferred: Optional[bool] = None
    min_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    constraints: Optional[dict[str, Any]] = None
    applies_to_entity_types: Optional[list[str]] = None
    is_active: Optional[bool] = None


class TopicRead(BaseModel):
    id: int
    name: str
    label: str = ""
    description: str
    extraction_instructions: str = ""
    examples: list = []
    data_type: str
    cardinality: TopicCardinality
    update_policy: UpdatePolicy
    temporal: bool
    ttl_days: Optional[int] = None
    enum_values: list
    allow_custom_values: bool = False
    allow_inferred: bool = True
    min_confidence: float = 0.0
    constraints: dict[str, Any] = Field(default_factory=dict)
    applies_to_entity_types: list[str] = Field(default_factory=list)
    schema_version: int = 1
    is_active: bool
    created_at: datetime


# ──────────────────────────────────────────────
# Memory Schemas
# ──────────────────────────────────────────────

class MemoryRead(BaseModel):
    id: int
    entity_id: int
    entity_name: Optional[str] = None
    entity_external_id: Optional[str] = None
    topic_id: Optional[int]
    topic_name: Optional[str] = None
    claim: str
    value: str
    structured_value: Optional[Any] = None
    claim_type: ClaimType = ClaimType.EXPLICIT
    confidence: float
    status: MemoryStatus
    judge_note: Optional[str] = None
    superseded_by_id: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    evidence: list["EvidenceRead"] = []


class MemoryUpdate(BaseModel):
    status: Optional[MemoryStatus] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    claim: Optional[str] = None
    value: Optional[str] = None
    topic_id: Optional[int] = None


# ──────────────────────────────────────────────
# Episode / Evidence Schemas
# ──────────────────────────────────────────────

class AttachmentRead(BaseModel):
    id: int
    episode_id: int
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str = ""
    has_file: bool = False
    download_url: Optional[str] = None
    created_at: datetime


class EpisodeRead(BaseModel):
    id: int
    entity_id: int
    source_type: str = "custom"
    source_record_id: Optional[str] = None
    content: str
    content_hash: str = ""
    source_description: str
    meta: dict
    occurred_at: datetime
    created_at: datetime
    attachments: list[AttachmentRead] = Field(default_factory=list)


class EvidenceRead(BaseModel):
    id: int
    episode_id: int
    excerpt: str
    is_verified: bool = False
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    content_hash: str = ""
    created_at: datetime
    episode_content: Optional[str] = None
    episode_source_type: Optional[str] = None
    episode_description: Optional[str] = None
    episode_occurred_at: Optional[datetime] = None
    episode_attachments: list[AttachmentRead] = Field(default_factory=list)


# ──────────────────────────────────────────────
# Ingest Schemas
# ──────────────────────────────────────────────

class IngestRequest(BaseModel):
    """Ingest unstructured data about an entity and extract structured state."""
    entity_id: Optional[int] = Field(default=None, description="Internal entity ID (use this OR external_id)")
    external_id: Optional[str] = Field(default=None, description="Your app's entity ID (use this OR entity_id)")
    content: str = Field(..., min_length=1, description="The unstructured text to extract memories from")
    source_type: str = Field(
        default="conversation",
        max_length=50,
        description="Source category slug (e.g. conversation, note, reflection, interaction, or any custom slug)",
    )
    source_record_id: Optional[str] = Field(default=None, max_length=255, description="Origin CRM, ticket, or order ID")
    idempotency_key: Optional[str] = Field(default=None, max_length=255, description="Optional key to prevent duplicate ingestion")
    occurred_at: Optional[datetime] = Field(default=None, description="Timestamp when the interaction actually occurred")
    source_description: str = Field(default="", description="Human-readable description of the source")
    meta: dict = Field(default_factory=dict, description="Any additional metadata about this ingestion")
    auto_create_entity: bool = Field(default=True, description="If true, create the entity if it doesn't exist")
    entity_name: str = Field(default="", description="Name for auto-created entity")
    dry_run: bool = Field(default=False, description="If true, simulate extraction and schema validation without persisting state")
    mode: str = Field(default="sync", description="Execution mode: 'sync' (wait for result) or 'async' (enqueue durable background job)")
    queue_on_error: bool = Field(default=False, description="If true in sync mode, enqueue a durable retry job if the LLM provider fails transiently")

    @field_validator("source_type", mode="before")
    @classmethod
    def validate_source_type(cls, v: Any) -> str:
        return normalize_source_type(v)


class SourceTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="Source category name/slug")

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        return normalize_source_type(v)


class SourceTypesResponse(BaseModel):
    source_types: list[str]
    defaults: list[str] = list(DEFAULT_SOURCE_TYPES)


class JudgeRejectedItem(BaseModel):
    claim: str
    topic_name: Optional[str] = None
    value: str = ""
    reason: str = ""


class IngestResponse(BaseModel):
    episode_id: int
    entity_id: int
    memories_extracted: int
    memories_updated: int
    memories_new: int
    idempotent_replay: bool = False
    dry_run: bool = False
    job_id: Optional[int] = None
    job_status: Optional[str] = None
    judge_applied: bool = False
    judge_rejected: list[JudgeRejectedItem] = Field(default_factory=list)
    state: dict[str, Any] = Field(default_factory=dict)
    memories: list[MemoryRead]


class IngestJobRead(BaseModel):
    id: int
    workspace_id: int
    entity_id: int
    episode_id: int
    entity_name: Optional[str] = None
    entity_external_id: Optional[str] = None
    status: str
    attempts: int
    max_attempts: int
    next_run_at: datetime
    last_error: Optional[str] = None
    result_summary: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class DemoSeedRequest(BaseModel):
    preset: str = Field(default="clinical", description="Sample workspace preset: 'clinical' or 'saas'")


# ──────────────────────────────────────────────
# Intel Schemas
# ──────────────────────────────────────────────

class IntelResponse(BaseModel):
    """Formatted entity state ready for customer service, personalization, or AI prompts."""
    entity_id: int
    entity_name: str
    entity_type: EntityType
    formatted_prompt: str = Field(description="Ready-to-use text block for system context")
    state: dict[str, Any] = Field(default_factory=dict, description="Compiled key-value state dictionary mapped by topic slug")
    memories: list[MemoryRead] = []
    total_memories: int = 0
    total_episodes: int = 0
