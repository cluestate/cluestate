"""Pydantic schemas for API requests and responses (separate from DB models)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .models import EntityType, MemoryStatus, SourceType


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
    enum_values: list[str] = []


class TopicUpdate(BaseModel):
    description: Optional[str] = None
    data_type: Optional[str] = None
    enum_values: Optional[list[str]] = None
    is_active: Optional[bool] = None


class TopicRead(BaseModel):
    id: int
    name: str
    description: str
    data_type: str
    enum_values: list
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
    confidence: float
    status: MemoryStatus
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
    content: str
    source_description: str
    meta: dict
    created_at: datetime


class EvidenceRead(BaseModel):
    id: int
    episode_id: int
    excerpt: str
    created_at: datetime


# ──────────────────────────────────────────────
# Ingest Schemas
# ──────────────────────────────────────────────

class IngestRequest(BaseModel):
    """Ingest unstructured data about an entity and extract memories."""
    entity_id: Optional[int] = Field(default=None, description="Internal entity ID (use this OR external_id)")
    external_id: Optional[str] = Field(default=None, description="Your app's entity ID (use this OR entity_id)")
    content: str = Field(..., min_length=1, description="The unstructured text to extract memories from")
    source_type: SourceType = SourceType.CUSTOM
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
    memories: list[MemoryRead]


# ──────────────────────────────────────────────
# Intel Schemas
# ──────────────────────────────────────────────

class IntelResponse(BaseModel):
    """Formatted entity intelligence ready for AI prompts."""
    entity_id: int
    entity_name: str
    entity_type: EntityType
    formatted_prompt: str = Field(description="Ready-to-use text block for AI system prompts")
    memories: list[MemoryRead] = []
    total_memories: int = 0
    total_episodes: int = 0
