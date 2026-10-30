"""LLM-powered memory extraction and conflict resolution engine."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import instructor
import litellm
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import Entity, Episode, Evidence, Memory, MemoryStatus, Topic

logger = logging.getLogger("cluestate.engine")


# ──────────────────────────────────────────────
# LLM Extraction Schemas (Pydantic → Instructor)
# ──────────────────────────────────────────────

class ExtractedClaim(BaseModel):
    """A single atomic claim extracted from text by the LLM."""

    claim: str = Field(description="A clear, atomic factual statement about the entity")
    topic_name: Optional[str] = Field(
        default=None,
        description="Name of the matching topic, if this claim fits a known category. Use exact topic name.",
    )
    value: str = Field(
        default="",
        description="Structured value if a topic applies (e.g., 'true', 'vegan', '42'). Empty if free-form.",
    )
    confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Your confidence that this claim is factually correct based on the source text",
    )
    evidence_excerpt: str = Field(
        default="",
        description="The exact phrase or sentence from the source text that supports this claim",
    )
    contradicts_existing: Optional[str] = Field(
        default=None,
        description="If this claim updates/contradicts an existing memory, state which one",
    )


class ExtractionResult(BaseModel):
    """Structured result from the LLM extraction."""

    claims: list[ExtractedClaim] = Field(default_factory=list)


# ──────────────────────────────────────────────
# Core Extraction Engine
# ──────────────────────────────────────────────

async def extract_memories_from_text(
    content: str,
    entity_name: str,
    existing_memories: list[Memory],
    topics: list[Topic],
) -> ExtractionResult:
    """Call the LLM to extract atomic claims from unstructured text."""
    settings = get_settings()

    # Build context for the LLM
    topics_block = "No specific topics defined — extract any relevant facts."
    if topics:
        topic_lines = []
        for t in topics:
            line = f"- **{t.name}** ({t.data_type}): {t.description}"
            if t.enum_values:
                line += f" [allowed values: {', '.join(str(v) for v in t.enum_values)}]"
            topic_lines.append(line)
        topics_block = "\n".join(topic_lines)

    existing_block = "No existing memories."
    if existing_memories:
        mem_lines = [
            f"- [{m.status.value}] {m.claim} (confidence: {m.confidence:.0%})"
            for m in existing_memories
            if m.status in (MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED)
        ]
        if mem_lines:
            existing_block = "\n".join(mem_lines)

    system_prompt = f"""You are a memory extraction engine. Your task is to extract atomic, factual claims about the entity "{entity_name}" from the provided text.

## Rules
1. Each claim MUST be a single, atomic fact — not a compound statement.
2. Include the exact excerpt from the source text as evidence.
3. Rate your confidence from 0.0 (pure guess) to 1.0 (explicitly stated).
4. If a claim relates to one of the known topics below, set topic_name to the EXACT topic name.
5. If a new claim contradicts or updates an existing memory, note which one in contradicts_existing.
6. Extract preferences, behaviors, demographics, opinions, and any stated facts.
7. Do NOT hallucinate — only extract what the text actually says or strongly implies.
8. Do NOT extract trivially obvious or useless information.

## Known Topics to Watch For
{topics_block}

## Existing Memories About This Entity
{existing_block}"""

    client = instructor.from_litellm(litellm.acompletion)

    try:
        result = await client.chat.completions.create(
            model=settings.llm_model,
            response_model=ExtractionResult,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content},
            ],
            max_retries=settings.max_retries,
        )
        return result
    except Exception as e:
        logger.error(f"LLM extraction failed: {e}")
        return ExtractionResult(claims=[])


# ──────────────────────────────────────────────
# Memory Persistence & Conflict Resolution
# ──────────────────────────────────────────────

async def process_extracted_claims(
    session: AsyncSession,
    entity: Entity,
    episode: Episode,
    extraction: ExtractionResult,
    topics: list[Topic],
) -> tuple[list[Memory], int, int]:
    """
    Save extracted claims as Memory rows, handling conflicts.

    Returns: (all_memories, new_count, updated_count)
    """
    settings = get_settings()
    topic_map = {t.name.lower(): t for t in topics}

    new_count = 0
    updated_count = 0
    all_memories: list[Memory] = []

    for claim in extraction.claims:
        # Resolve topic
        topic: Optional[Topic] = None
        if claim.topic_name:
            topic = topic_map.get(claim.topic_name.lower())

        # Check for conflict with existing memories on the same topic
        existing_memory: Optional[Memory] = None
        if topic:
            result = await session.execute(
                select(Memory).where(
                    Memory.entity_id == entity.id,
                    Memory.topic_id == topic.id,
                    Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
                )
            )
            existing_memory = result.scalars().first()

        if existing_memory and claim.confidence >= settings.conflict_threshold:
            # Supersede the old memory
            existing_memory.status = MemoryStatus.SUPERSEDED
            existing_memory.updated_at = datetime.now(timezone.utc)

            new_memory = Memory(
                entity_id=entity.id,
                topic_id=topic.id if topic else None,
                claim=claim.claim,
                value=claim.value,
                confidence=claim.confidence,
                status=MemoryStatus.ACTIVE,
            )
            existing_memory.superseded_by_id = None  # Will be set after flush
            session.add(new_memory)
            await session.flush()

            existing_memory.superseded_by_id = new_memory.id
            updated_count += 1
        else:
            # New memory (no conflict or low confidence)
            new_memory = Memory(
                entity_id=entity.id,
                topic_id=topic.id if topic else None,
                claim=claim.claim,
                value=claim.value,
                confidence=claim.confidence,
                status=MemoryStatus.ACTIVE,
            )
            session.add(new_memory)
            await session.flush()
            new_count += 1

        # Create evidence link
        evidence = Evidence(
            memory_id=new_memory.id,
            episode_id=episode.id,
            excerpt=claim.evidence_excerpt,
        )
        session.add(evidence)
        all_memories.append(new_memory)

    await session.flush()
    return all_memories, new_count, updated_count


# ──────────────────────────────────────────────
# Intel Formatter — Ready for AI Prompts
# ──────────────────────────────────────────────

async def format_entity_intel(
    session: AsyncSession,
    entity: Entity,
) -> str:
    """Format all active memories into a text block suitable for AI system prompts."""

    # Fetch active/confirmed memories
    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc())
    )
    memories = result.scalars().all()

    if not memories:
        return f"No known information about {entity.name or entity.external_id}."

    # Fetch topics for labeling
    topic_ids = {m.topic_id for m in memories if m.topic_id}
    topic_map: dict[int, str] = {}
    if topic_ids:
        result = await session.execute(select(Topic).where(Topic.id.in_(topic_ids)))
        for t in result.scalars().all():
            topic_map[t.id] = t.name

    # Count episodes
    episode_count_result = await session.execute(
        select(func.count()).where(Episode.entity_id == entity.id)
    )
    episode_count = episode_count_result.scalar() or 0

    # Group by topic
    categorized: dict[str, list[Memory]] = {}
    uncategorized: list[Memory] = []
    for m in memories:
        if m.topic_id and m.topic_id in topic_map:
            cat = topic_map[m.topic_id]
            categorized.setdefault(cat, []).append(m)
        else:
            uncategorized.append(m)

    # Build formatted text
    lines = [
        f"=== KNOWN INFORMATION: {entity.name or entity.external_id} ===",
        f"Entity type: {entity.entity_type.value}",
        f"Based on {episode_count} interaction(s), {len(memories)} known fact(s).",
        "",
    ]

    for cat_name, cat_memories in sorted(categorized.items()):
        lines.append(f"## {cat_name.replace('_', ' ').title()}")
        for m in cat_memories:
            conf = f" ({m.confidence:.0%} confidence)" if m.confidence < 0.9 else ""
            status_marker = " ✓" if m.status == MemoryStatus.CONFIRMED else ""
            lines.append(f"- {m.claim}{conf}{status_marker}")
        lines.append("")

    if uncategorized:
        lines.append("## Other Facts")
        for m in uncategorized:
            conf = f" ({m.confidence:.0%} confidence)" if m.confidence < 0.9 else ""
            status_marker = " ✓" if m.status == MemoryStatus.CONFIRMED else ""
            lines.append(f"- {m.claim}{conf}{status_marker}")
        lines.append("")

    return "\n".join(lines)
