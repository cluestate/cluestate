"""SQLModel definitions — single source of truth for DB schema, API contracts, and LLM extraction."""

import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from sqlalchemy import Column, String, Text, UniqueConstraint
from sqlalchemy.types import JSON
from sqlmodel import Field, Relationship, SQLModel

# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class EntityType(str, Enum):
    PERSON = "person"
    ORGANIZATION = "organization"
    PRODUCT = "product"
    LOCATION = "location"
    CUSTOM = "custom"


class MemoryStatus(str, Enum):
    ACTIVE = "active"
    CONFIRMED = "confirmed"
    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class ClaimType(str, Enum):
    EXPLICIT = "explicit"
    INFERRED = "inferred"
    OBSERVED = "observed"


class TopicCardinality(str, Enum):
    SINGLE = "single"
    MULTIPLE = "multiple"


class UpdatePolicy(str, Enum):
    REPLACE = "replace"
    APPEND = "append"
    REVIEW = "review"


class ClaimOperation(str, Enum):
    ADD = "add"
    UPDATE = "update"
    SUPERSEDE = "supersede"
    SUPPORT = "support"
    CONTRADICT = "contradict"
    ABSTAIN = "abstain"


class SourceType(str, Enum):
    CONVERSATION = "conversation"
    NOTE = "note"
    INTERACTION = "interaction"
    CUSTOM = "custom"
    # Legacy aliases
    EMAIL = "email"
    SURVEY = "survey"
    PURCHASE = "purchase"
    SUPPORT_TICKET = "support_ticket"
    CALL_TRANSCRIPT = "call_transcript"
    APP_INTERACTION = "app_interaction"
    REVIEW = "review"
    SOCIAL_MEDIA = "social_media"


DEFAULT_SOURCE_TYPES: list[str] = ["conversation", "note", "interaction", "custom"]


def normalize_source_type(val: Any) -> str:
    """Sanitize source type into a clean, lowercased slug (max 50 chars)."""
    if isinstance(val, Enum):
        val = val.value
    if not val or not isinstance(val, str):
        return "conversation"
    clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", val.strip().lower())
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean[:50] or "custom"


async def ensure_workspace_source_type(workspace: "Workspace", source_type: str, session: Any) -> list[str]:
    """Ensure a source type is registered in the workspace, adding it dynamically if new."""
    source_type = normalize_source_type(source_type)
    current = list(workspace.source_types or DEFAULT_SOURCE_TYPES)
    if source_type not in current:
        current.append(source_type)
        workspace.source_types = current
        session.add(workspace)
        await session.flush()
    return current


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ──────────────────────────────────────────────
# Platform / Multi-Tenancy Tables
# ──────────────────────────────────────────────

class User(SQLModel, table=True):
    """Platform user account."""

    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    password_hash: str = Field(max_length=500)
    full_name: str = Field(default="", max_length=255)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)

    workspaces: list["Workspace"] = Relationship(back_populates="owner")


class Workspace(SQLModel, table=True):
    """Isolated tenant workspace owning entities, topics, episodes, and memories."""

    __tablename__ = "workspaces"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    slug: str = Field(index=True, unique=True, max_length=255)
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    source_types: list = Field(
        default_factory=lambda: list(DEFAULT_SOURCE_TYPES),
        sa_column=Column("source_types", JSON, nullable=False, server_default='["conversation", "note", "interaction", "custom"]'),
    )
    created_at: datetime = Field(default_factory=_utcnow)

    owner: Optional[User] = Relationship(back_populates="workspaces")
    api_keys: list["ApiKey"] = Relationship(back_populates="workspace")


class ApiKey(SQLModel, table=True):
    """Scoped API key for programmatic access to a Workspace."""

    __tablename__ = "api_keys"

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(foreign_key="workspaces.id", index=True)
    name: str = Field(default="Default Key", max_length=255)
    key_prefix: str = Field(max_length=32, index=True)
    key_hash: str = Field(max_length=128, unique=True, index=True)
    is_active: bool = Field(default=True)
    last_used_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)

    workspace: Optional[Workspace] = Relationship(back_populates="api_keys")


# ──────────────────────────────────────────────
# Core Customer Intelligence Tables
# ──────────────────────────────────────────────

class Entity(SQLModel, table=True):
    """A person, organization, or any trackable subject within a workspace."""

    __tablename__ = "entities"
    __table_args__ = (
        UniqueConstraint("workspace_id", "external_id", name="uq_entity_workspace_external_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(default=1, foreign_key="workspaces.id", index=True)
    external_id: str = Field(index=True, max_length=255)
    name: str = Field(default="", max_length=500)
    entity_type: EntityType = Field(default=EntityType.PERSON)
    meta: dict = Field(default_factory=dict, sa_column=Column("meta", JSON, nullable=False, server_default="{}"))
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    memories: list["Memory"] = Relationship(back_populates="entity")
    episodes: list["Episode"] = Relationship(back_populates="entity")


class Topic(SQLModel, table=True):
    """A schema-defined attribute category to track (e.g., 'dietary_preference', 'budget')."""

    __tablename__ = "topics"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_topic_workspace_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(default=1, foreign_key="workspaces.id", index=True)
    name: str = Field(index=True, max_length=255)
    description: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    data_type: str = Field(default="text", max_length=50)  # text, number, boolean, enum, list
    cardinality: TopicCardinality = Field(default=TopicCardinality.MULTIPLE)
    update_policy: UpdatePolicy = Field(default=UpdatePolicy.APPEND)
    temporal: bool = Field(default=False)
    enum_values: list = Field(default_factory=list, sa_column=Column("enum_values", JSON, nullable=False, server_default="[]"))
    schema_version: int = Field(default=1)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)

    memories: list["Memory"] = Relationship(back_populates="topic")


class Episode(SQLModel, table=True):
    """A single source interaction or event with provenance and content hashing."""

    __tablename__ = "episodes"

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(default=1, foreign_key="workspaces.id", index=True)
    entity_id: int = Field(foreign_key="entities.id", index=True)
    source_type: str = Field(default="custom", max_length=50, sa_column=Column(String(50), index=True, nullable=False, server_default="custom"))
    source_record_id: Optional[str] = Field(default=None, index=True, max_length=255)
    idempotency_key: Optional[str] = Field(default=None, index=True, max_length=255)
    content: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    content_hash: str = Field(default="", max_length=64, index=True)
    source_description: str = Field(default="", max_length=500)
    meta: dict = Field(default_factory=dict, sa_column=Column("meta", JSON, nullable=False, server_default="{}"))
    occurred_at: datetime = Field(default_factory=_utcnow)
    created_at: datetime = Field(default_factory=_utcnow)

    entity: Optional[Entity] = Relationship(back_populates="episodes")
    evidence_links: list["Evidence"] = Relationship(back_populates="episode")


class Memory(SQLModel, table=True):
    """An atomic claim about an entity, with typed value, claim type, and temporal bounds."""

    __tablename__ = "memories"

    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(default=1, foreign_key="workspaces.id", index=True)
    entity_id: int = Field(foreign_key="entities.id", index=True)
    topic_id: Optional[int] = Field(default=None, foreign_key="topics.id", index=True)
    claim: str = Field(sa_column=Column(Text, nullable=False))
    value: str = Field(default="", max_length=2000)
    structured_value: Any = Field(default=None, sa_column=Column("structured_value", JSON, nullable=True))
    claim_type: ClaimType = Field(default=ClaimType.EXPLICIT)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    status: MemoryStatus = Field(default=MemoryStatus.ACTIVE)
    superseded_by_id: Optional[int] = Field(default=None, foreign_key="memories.id")
    valid_from: Optional[datetime] = Field(default=None)
    valid_to: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    entity: Optional[Entity] = Relationship(back_populates="memories")
    topic: Optional[Topic] = Relationship(back_populates="memories")
    evidence_links: list["Evidence"] = Relationship(back_populates="memory")


class Evidence(SQLModel, table=True):
    """Links a Memory to the Episode that supports it, with verified character offsets."""

    __tablename__ = "evidence"

    id: Optional[int] = Field(default=None, primary_key=True)
    memory_id: int = Field(foreign_key="memories.id", index=True)
    episode_id: int = Field(foreign_key="episodes.id", index=True)
    excerpt: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    is_verified: bool = Field(default=False)
    char_start: Optional[int] = Field(default=None)
    char_end: Optional[int] = Field(default=None)
    content_hash: str = Field(default="", max_length=64)
    created_at: datetime = Field(default_factory=_utcnow)

    memory: Optional[Memory] = Relationship(back_populates="evidence_links")
    episode: Optional[Episode] = Relationship(back_populates="evidence_links")
