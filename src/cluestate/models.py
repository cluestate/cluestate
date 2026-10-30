"""SQLModel definitions — single source of truth for DB schema, API contracts, and LLM extraction."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Column, Text
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
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class SourceType(str, Enum):
    CONVERSATION = "conversation"
    EMAIL = "email"
    SURVEY = "survey"
    PURCHASE = "purchase"
    SUPPORT_TICKET = "support_ticket"
    CALL_TRANSCRIPT = "call_transcript"
    APP_INTERACTION = "app_interaction"
    REVIEW = "review"
    SOCIAL_MEDIA = "social_media"
    NOTE = "note"
    CUSTOM = "custom"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ──────────────────────────────────────────────
# Core Tables
# ──────────────────────────────────────────────

class Entity(SQLModel, table=True):
    """A person, organization, or any trackable entity."""

    __tablename__ = "entities"

    id: Optional[int] = Field(default=None, primary_key=True)
    external_id: str = Field(index=True, unique=True, max_length=255)
    name: str = Field(default="", max_length=500)
    entity_type: EntityType = Field(default=EntityType.PERSON)
    meta: dict = Field(default_factory=dict, sa_column=Column("meta", JSON, nullable=False, server_default="{}"))
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    # Relationships
    memories: list["Memory"] = Relationship(back_populates="entity")
    episodes: list["Episode"] = Relationship(back_populates="entity")


class Topic(SQLModel, table=True):
    """A category or attribute to track (e.g., 'dietary_preference', 'favorite_product')."""

    __tablename__ = "topics"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True, max_length=255)
    description: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    data_type: str = Field(default="text", max_length=50)  # text, number, boolean, enum, list
    enum_values: list = Field(default_factory=list, sa_column=Column("enum_values", JSON, nullable=False, server_default="[]"))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)

    # Relationships
    memories: list["Memory"] = Relationship(back_populates="topic")


class Episode(SQLModel, table=True):
    """A single interaction or data ingestion event."""

    __tablename__ = "episodes"

    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: int = Field(foreign_key="entities.id", index=True)
    source_type: SourceType = Field(default=SourceType.CUSTOM)
    content: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    source_description: str = Field(default="", max_length=500)
    meta: dict = Field(default_factory=dict, sa_column=Column("meta", JSON, nullable=False, server_default="{}"))
    created_at: datetime = Field(default_factory=_utcnow)

    # Relationships
    entity: Optional[Entity] = Relationship(back_populates="episodes")
    evidence_links: list["Evidence"] = Relationship(back_populates="episode")


class Memory(SQLModel, table=True):
    """An atomic factual claim about an entity, with confidence and evidence."""

    __tablename__ = "memories"

    id: Optional[int] = Field(default=None, primary_key=True)
    entity_id: int = Field(foreign_key="entities.id", index=True)
    topic_id: Optional[int] = Field(default=None, foreign_key="topics.id", index=True)
    claim: str = Field(sa_column=Column(Text, nullable=False))
    value: str = Field(default="", max_length=2000)  # Structured value when topic has data_type
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    status: MemoryStatus = Field(default=MemoryStatus.ACTIVE)
    superseded_by_id: Optional[int] = Field(default=None, foreign_key="memories.id")
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    # Relationships
    entity: Optional[Entity] = Relationship(back_populates="memories")
    topic: Optional[Topic] = Relationship(back_populates="memories")
    evidence_links: list["Evidence"] = Relationship(back_populates="memory")


class Evidence(SQLModel, table=True):
    """Links a Memory to the Episode (source data) that supports it, with the relevant excerpt."""

    __tablename__ = "evidence"

    id: Optional[int] = Field(default=None, primary_key=True)
    memory_id: int = Field(foreign_key="memories.id", index=True)
    episode_id: int = Field(foreign_key="episodes.id", index=True)
    excerpt: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    created_at: datetime = Field(default_factory=_utcnow)

    # Relationships
    memory: Optional[Memory] = Relationship(back_populates="evidence_links")
    episode: Optional[Episode] = Relationship(back_populates="evidence_links")
