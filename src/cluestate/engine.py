"""LLM-powered customer state extraction, evidence verification, and state resolution engine."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import instructor
import litellm
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import (
    ClaimOperation,
    ClaimType,
    Entity,
    Episode,
    Evidence,
    Memory,
    MemoryStatus,
    Topic,
    TopicCardinality,
    UpdatePolicy,
)

logger = logging.getLogger("cluestate.engine")


class ExtractionError(Exception):
    """Raised when the LLM provider fails to extract claims from an episode."""


# ──────────────────────────────────────────────
# LLM Extraction Schemas (Pydantic → Instructor)
# ──────────────────────────────────────────────

class ExtractedClaim(BaseModel):
    """A single atomic claim extracted from source text by the LLM."""

    claim: str = Field(
        description="A clear, atomic statement about the entity without unsupported embellishments or modifiers."
    )
    topic_name: Optional[str] = Field(
        default=None,
        description="Exact name of the matching topic category, if applicable.",
    )
    value: str = Field(
        default="",
        description="Normalized value matching the topic's data_type (e.g., 'true', '50000', 'Nike').",
    )
    claim_type: ClaimType = Field(
        default=ClaimType.EXPLICIT,
        description="Whether this claim was explicitly stated ('explicit'), reasonably inferred ('inferred'), or observed behavior ('observed').",
    )
    operation: ClaimOperation = Field(
        default=ClaimOperation.ADD,
        description=(
            "State operation: 'add' (new fact that coexists), 'support' (re-confirms an existing memory), "
            "'supersede' / 'update' / 'contradict' (replaces an outdated or conflicting memory), or 'abstain'."
        ),
    )
    target_memory_id: Optional[int] = Field(
        default=None,
        description="If operation is 'support', 'update', 'supersede', or 'contradict', the integer ID of the existing memory.",
    )
    confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Model-estimated confidence score between 0.0 and 1.0 based on directness of evidence.",
    )
    evidence_excerpt: str = Field(
        default="",
        description="Verbatim substring quote from the input text that directly supports this claim.",
    )


class ExtractionResult(BaseModel):
    """Structured result from the LLM extraction."""

    claims: list[ExtractedClaim] = Field(default_factory=list)


# ──────────────────────────────────────────────
# Evidence Verification & Schema Validation
# ──────────────────────────────────────────────

def compute_content_hash(content: str) -> str:
    """Return SHA-256 hex digest of source text."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def verify_evidence_excerpt(source_text: str, excerpt: str) -> tuple[bool, Optional[int], Optional[int]]:
    """
    Programmatically verify whether `excerpt` appears in `source_text`.

    Returns: (is_verified, char_start, char_end)
    """
    if not source_text or not excerpt or not excerpt.strip():
        return False, None, None

    cleaned = excerpt.strip().strip('"\'“”‘’')
    if not cleaned:
        return False, None, None

    # 1. Exact substring match
    idx = source_text.find(cleaned)
    if idx != -1:
        return True, idx, idx + len(cleaned)

    # 2. Case-insensitive match
    idx_lower = source_text.lower().find(cleaned.lower())
    if idx_lower != -1:
        return True, idx_lower, idx_lower + len(cleaned)

    # 3. Whitespace-normalized match
    tokens = [re.escape(tok) for tok in cleaned.split() if tok]
    if len(tokens) >= 2:
        pattern = r"\s+".join(tokens)
        match = re.search(pattern, source_text, flags=re.IGNORECASE)
        if match:
            return True, match.start(), match.end()

    return False, None, None


def validate_and_coerce_value(
    raw_value: str,
    topic: Optional[Topic],
) -> tuple[str, Any, bool]:
    """
    Validate and coerce a raw string value against a Topic's declared data_type and enum_values.

    Returns: (normalized_str_value, structured_json_value, is_valid)
    """
    val_str = (raw_value or "").strip()
    if not topic:
        return val_str, (val_str if val_str else None), True

    dtype = (topic.data_type or "text").lower()

    if dtype == "boolean":
        lower = val_str.lower()
        if lower in ("true", "yes", "1", "enabled", "active"):
            return "true", True, True
        if lower in ("false", "no", "0", "disabled", "inactive"):
            return "false", False, True
        return val_str, None, False

    if dtype == "number":
        cleaned_num = re.sub(r"[,$\s]", "", val_str)
        multiplier = 1.0
        if cleaned_num.lower().endswith("k"):
            multiplier = 1_000.0
            cleaned_num = cleaned_num[:-1]
        elif cleaned_num.lower().endswith("m"):
            multiplier = 1_000_000.0
            cleaned_num = cleaned_num[:-1]
        try:
            num = float(cleaned_num) * multiplier
            if num.is_integer():
                num_int = int(num)
                return str(num_int), num_int, True
            return str(num), num, True
        except ValueError:
            return val_str, None, False

    if dtype == "enum":
        allowed = [str(v).strip() for v in (topic.enum_values or []) if str(v).strip()]
        if not allowed:
            return val_str, val_str, True
        for candidate in allowed:
            if val_str.lower() == candidate.lower():
                return candidate, candidate, True
        return val_str, None, False

    if dtype == "list":
        if not val_str:
            return "", [], True
        if val_str.startswith("[") and val_str.endswith("]"):
            try:
                parsed = json.loads(val_str)
                if isinstance(parsed, list):
                    items = [str(x).strip() for x in parsed if str(x).strip()]
                    return ", ".join(items), items, True
            except Exception:
                pass
        items = [item.strip() for item in val_str.split(",") if item.strip()]
        return ", ".join(items), items, True

    # Default: text
    return val_str, (val_str if val_str else None), True


# ──────────────────────────────────────────────
# Core Extraction Engine
# ──────────────────────────────────────────────

async def extract_memories_from_text(
    content: str,
    entity_name: str,
    existing_memories: list[Memory],
    topics: list[Topic],
) -> ExtractionResult:
    """Call the LLM to extract structured claims and state operations from text."""
    settings = get_settings()

    # Build topic schema descriptions
    topics_block = "No predefined topics — extract relevant factual attributes."
    if topics:
        topic_lines = []
        for t in topics:
            cardinality = t.cardinality.value if hasattr(t.cardinality, "value") else str(t.cardinality)
            policy = t.update_policy.value if hasattr(t.update_policy, "value") else str(t.update_policy)
            line = (
                f"- **{t.name}** (type: {t.data_type}, cardinality: {cardinality}, "
                f"policy: {policy}): {t.description}"
            )
            if t.enum_values:
                line += f" [allowed enum values: {', '.join(str(v) for v in t.enum_values)}]"
            topic_lines.append(line)
        topics_block = "\n".join(topic_lines)

    # Bound existing memories passed into context
    bounded_memories = [
        m for m in existing_memories
        if m.status in (MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED)
    ][: settings.max_context_memories]

    topic_id_to_name = {t.id: t.name for t in topics if t.id is not None}

    existing_block = "No existing memories recorded for this entity."
    if bounded_memories:
        mem_lines = []
        for m in bounded_memories:
            t_label = f", topic: {topic_id_to_name[m.topic_id]}" if m.topic_id in topic_id_to_name else ""
            mem_lines.append(
                f"- [ID: {m.id}{t_label}, status: {m.status.value}] {m.claim} "
                f"(value: '{m.value}', confidence: {m.confidence:.0%})"
            )
        existing_block = "\n".join(mem_lines)

    system_prompt = f"""You are a customer state extraction engine. Extract atomic claims about the entity "{entity_name}" from the provided source text.

## Core Rules
1. Atomic Claims: Each claim must represent a single statement.
2. Strict Fidelity: Never add unsupported modifiers, severity levels, or assumptions that are not directly stated in the source text (e.g., if the text says "allergic to peanuts", do NOT output "severe peanut allergy").
3. Verbatim Evidence: `evidence_excerpt` MUST be an exact, verbatim substring copied directly from the input text.
4. Claim Type:
   - `explicit`: Directly stated by or about the entity.
   - `inferred`: Reasonably deduced from context.
   - `observed`: Recorded from an action, purchase, or event.
5. State Operations (`operation` & `target_memory_id`):
   - `add`: A new claim. Use `add` when the topic allows multiple values (e.g., multiple product or brand preferences that coexist) or no prior memory conflicts.
   - `support`: The source text re-confirms an existing memory. Set `target_memory_id` to that memory's ID.
   - `supersede` / `update` / `contradict`: The new claim replaces an outdated or conflicting existing memory (e.g., a changed budget, migrated tech stack, or reversed preference). Set `target_memory_id` to the outdated memory's ID.
   - `abstain`: Information is hypothetical or too vague to store.

## Defined Topic Schemas
{topics_block}

## Existing Active Memories for "{entity_name}"
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
        raise ExtractionError(f"LLM extraction failed: {e}") from e


# ──────────────────────────────────────────────
# State Persistence & Resolution Engine
# ──────────────────────────────────────────────

async def process_extracted_claims(
    session: AsyncSession,
    entity: Entity,
    episode: Episode,
    extraction: ExtractionResult,
    topics: list[Topic],
) -> tuple[list[Memory], int, int]:
    """
    Validate extracted claims, verify source evidence, and apply state transitions
    according to topic cardinality and update policies.

    Returns: (affected_memories, new_count, updated_count)
    """
    settings = get_settings()
    topic_map = {t.name.lower(): t for t in topics}
    now = datetime.now(timezone.utc)
    ep_hash = episode.content_hash or compute_content_hash(episode.content)

    # Load current active/confirmed memories for this entity
    existing_res = await session.execute(
        select(Memory).where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
    )
    active_memories = list(existing_res.scalars().all())
    active_by_id: dict[int, Memory] = {m.id: m for m in active_memories if m.id is not None}

    new_count = 0
    updated_count = 0
    affected_memories: list[Memory] = []

    for claim in extraction.claims:
        if claim.operation == ClaimOperation.ABSTAIN:
            continue

        # 1. Resolve Topic
        topic: Optional[Topic] = None
        if claim.topic_name:
            topic = topic_map.get(claim.topic_name.lower())

        # 2. Verify Evidence Excerpt against Episode content
        is_verified, char_start, char_end = verify_evidence_excerpt(
            episode.content, claim.evidence_excerpt
        )
        effective_confidence = claim.confidence
        if not is_verified:
            # Penalize unverified excerpts
            effective_confidence = min(effective_confidence, 0.45)

        # 3. Validate & Coerce Value against Topic Schema
        norm_val, structured_val, is_type_valid = validate_and_coerce_value(claim.value, topic)
        if not is_type_valid:
            effective_confidence = min(effective_confidence, 0.5)

        # 4. Check for exact duplicate claim text or explicit SUPPORT operation
        target_mem: Optional[Memory] = None
        if claim.target_memory_id and claim.target_memory_id in active_by_id:
            target_mem = active_by_id[claim.target_memory_id]

        if not target_mem:
            for existing in active_memories:
                if existing.claim.strip().lower() == claim.claim.strip().lower():
                    target_mem = existing
                    break

        if claim.operation == ClaimOperation.SUPPORT and target_mem:
            # Attach supporting evidence to the existing memory
            target_mem.confidence = min(1.0, round(max(target_mem.confidence, effective_confidence) + 0.05, 2))
            target_mem.updated_at = now
            evidence = Evidence(
                memory_id=target_mem.id,
                episode_id=episode.id,
                excerpt=claim.evidence_excerpt,
                is_verified=is_verified,
                char_start=char_start,
                char_end=char_end,
                content_hash=ep_hash,
            )
            session.add(evidence)
            updated_count += 1
            if target_mem not in affected_memories:
                affected_memories.append(target_mem)
            continue

        # If identical claim text was already active even if LLM said ADD, treat as support
        if target_mem and target_mem.claim.strip().lower() == claim.claim.strip().lower():
            target_mem.confidence = min(1.0, round(max(target_mem.confidence, effective_confidence) + 0.03, 2))
            target_mem.updated_at = now
            evidence = Evidence(
                memory_id=target_mem.id,
                episode_id=episode.id,
                excerpt=claim.evidence_excerpt,
                is_verified=is_verified,
                char_start=char_start,
                char_end=char_end,
                content_hash=ep_hash,
            )
            session.add(evidence)
            updated_count += 1
            if target_mem not in affected_memories:
                affected_memories.append(target_mem)
            continue

        # 5. Determine whether to supersede an existing memory
        memory_to_supersede: Optional[Memory] = None

        if claim.operation in (ClaimOperation.SUPERSEDE, ClaimOperation.UPDATE, ClaimOperation.CONTRADICT):
            if target_mem:
                memory_to_supersede = target_mem
            elif topic:
                # Fallback: if topic is single-valued, find active memory for this topic
                for m in active_memories:
                    if m.topic_id == topic.id and m.status in (MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED):
                        memory_to_supersede = m
                        break
        elif topic and (
            topic.cardinality == TopicCardinality.SINGLE
            or topic.update_policy == UpdatePolicy.REPLACE
        ):
            # Single-cardinality topic enforces a single active value per entity
            for m in active_memories:
                if m.topic_id == topic.id and m.status in (MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED):
                    memory_to_supersede = m
                    break

        # 6. Apply Update Policy & Persist Memory
        if (
            memory_to_supersede
            and effective_confidence >= settings.conflict_threshold
            and (not topic or topic.update_policy != UpdatePolicy.APPEND)
        ):
            # If topic policy is REVIEW and existing memory was human-CONFIRMED, keep existing and add new as active
            if topic and topic.update_policy == UpdatePolicy.REVIEW and memory_to_supersede.status == MemoryStatus.CONFIRMED:
                new_memory = Memory(
                    workspace_id=entity.workspace_id,
                    entity_id=entity.id,
                    topic_id=topic.id if topic else None,
                    claim=claim.claim,
                    value=norm_val,
                    structured_value=structured_val,
                    claim_type=claim.claim_type,
                    confidence=effective_confidence,
                    status=MemoryStatus.ACTIVE,
                    valid_from=episode.occurred_at or now,
                )
                session.add(new_memory)
                await session.flush()
                new_count += 1
            else:
                # Supersede old memory
                memory_to_supersede.status = MemoryStatus.SUPERSEDED
                memory_to_supersede.valid_to = episode.occurred_at or now
                memory_to_supersede.updated_at = now

                new_memory = Memory(
                    workspace_id=entity.workspace_id,
                    entity_id=entity.id,
                    topic_id=topic.id if topic else None,
                    claim=claim.claim,
                    value=norm_val,
                    structured_value=structured_val,
                    claim_type=claim.claim_type,
                    confidence=effective_confidence,
                    status=MemoryStatus.ACTIVE,
                    valid_from=episode.occurred_at or now,
                )
                session.add(new_memory)
                await session.flush()

                memory_to_supersede.superseded_by_id = new_memory.id
                active_memories = [m for m in active_memories if m.id != memory_to_supersede.id]
                active_memories.append(new_memory)
                if new_memory.id is not None:
                    active_by_id[new_memory.id] = new_memory
                updated_count += 1
        else:
            # Coexisting / New Memory
            new_memory = Memory(
                workspace_id=entity.workspace_id,
                entity_id=entity.id,
                topic_id=topic.id if topic else None,
                claim=claim.claim,
                value=norm_val,
                structured_value=structured_val,
                claim_type=claim.claim_type,
                confidence=effective_confidence,
                status=MemoryStatus.ACTIVE,
                valid_from=episode.occurred_at or now,
            )
            session.add(new_memory)
            await session.flush()
            active_memories.append(new_memory)
            if new_memory.id is not None:
                active_by_id[new_memory.id] = new_memory
            new_count += 1

        # Create verified evidence link
        evidence = Evidence(
            memory_id=new_memory.id,
            episode_id=episode.id,
            excerpt=claim.evidence_excerpt,
            is_verified=is_verified,
            char_start=char_start,
            char_end=char_end,
            content_hash=ep_hash,
        )
        session.add(evidence)
        affected_memories.append(new_memory)

    entity.updated_at = now
    await session.flush()
    return affected_memories, new_count, updated_count


# ──────────────────────────────────────────────
# Intel Formatter
# ──────────────────────────────────────────────

async def format_entity_intel(
    session: AsyncSession,
    entity: Entity,
) -> str:
    """Format all active memories into a structured markdown block."""

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

    topic_ids = {m.topic_id for m in memories if m.topic_id}
    topic_map: dict[int, str] = {}
    if topic_ids:
        result = await session.execute(select(Topic).where(Topic.id.in_(topic_ids)))
        for t in result.scalars().all():
            topic_map[t.id] = t.name

    episode_count_result = await session.execute(
        select(func.count()).where(Episode.entity_id == entity.id)
    )
    episode_count = episode_count_result.scalar() or 0

    categorized: dict[str, list[Memory]] = {}
    uncategorized: list[Memory] = []
    for m in memories:
        if m.topic_id and m.topic_id in topic_map:
            cat = topic_map[m.topic_id]
            categorized.setdefault(cat, []).append(m)
        else:
            uncategorized.append(m)

    lines = [
        f"=== CUSTOMER STATE: {entity.name or entity.external_id} ===",
        f"Entity type: {entity.entity_type.value}",
        f"Based on {episode_count} interaction(s), {len(memories)} active claim(s).",
        "",
    ]

    for cat_name, cat_memories in sorted(categorized.items()):
        lines.append(f"## {cat_name.replace('_', ' ').title()}")
        for m in cat_memories:
            conf = f" ({m.confidence:.0%} confidence)" if m.confidence < 0.9 else ""
            status_marker = " [Confirmed]" if m.status == MemoryStatus.CONFIRMED else ""
            lines.append(f"- {m.claim}{conf}{status_marker}")
        lines.append("")

    if uncategorized:
        lines.append("## General")
        for m in uncategorized:
            conf = f" ({m.confidence:.0%} confidence)" if m.confidence < 0.9 else ""
            status_marker = " [Confirmed]" if m.status == MemoryStatus.CONFIRMED else ""
            lines.append(f"- {m.claim}{conf}{status_marker}")
        lines.append("")

    return "\n".join(lines)
