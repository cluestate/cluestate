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


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalize naive or timezone-aware datetimes to UTC for safe chronological comparison."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_locale_number(raw: str) -> Optional[float]:
    """
    Parse numbers supporting currency symbols/codes, k/m suffixes,
    US format ('25,000.50'), and European decimal format ('4,5' or '1.250,50').
    """
    cleaned = raw.strip()
    if not cleaned:
        return None

    # Strip common currency symbols and ISO currency codes
    cleaned = re.sub(r"(?i)\b(usd|eur|gbp|czk|cad|aud|chf|jpy)\b", "", cleaned)
    cleaned = re.sub(r"[$€£¥\s]", "", cleaned)
    if not cleaned:
        return None

    multiplier = 1.0
    lower = cleaned.lower()
    if lower.endswith("k"):
        multiplier = 1_000.0
        cleaned = cleaned[:-1]
    elif lower.endswith("m"):
        multiplier = 1_000_000.0
        cleaned = cleaned[:-1]
    elif lower.endswith("b"):
        multiplier = 1_000_000_000.0
        cleaned = cleaned[:-1]

    if not cleaned:
        return None

    if "," in cleaned and "." in cleaned:
        # Both separators present: whichever comes last is the decimal separator
        if cleaned.rfind(",") > cleaned.rfind("."):
            # European: 1.250,50 -> 1250.50
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            # US/UK: 1,250.50 -> 1250.50
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        # Only comma(s) present: check if thousands separator (e.g. 25,000 or 1,250,000) vs decimal comma (4,5 or 19,99)
        if re.fullmatch(r"[+-]?\d{1,3}(,\d{3})+", cleaned):
            cleaned = cleaned.replace(",", "")
        elif cleaned.count(",") == 1:
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")

    try:
        return float(cleaned) * multiplier
    except ValueError:
        return None


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
        num = _parse_locale_number(val_str)
        if num is None:
            return val_str, None, False
        if num.is_integer():
            num_int = int(num)
            return str(num_int), num_int, True
        return str(num), num, True

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

async def _attach_evidence_if_missing(
    session: AsyncSession,
    memory_id: int,
    episode_id: int,
    excerpt: str,
    is_verified: bool,
    char_start: Optional[int],
    char_end: Optional[int],
    content_hash: str,
) -> None:
    """Attach an Evidence link if this episode is not already linked to the memory."""
    existing_ev = await session.execute(
        select(Evidence).where(
            Evidence.memory_id == memory_id,
            Evidence.episode_id == episode_id,
        )
    )
    if existing_ev.scalars().first() is None:
        session.add(
            Evidence(
                memory_id=memory_id,
                episode_id=episode_id,
                excerpt=excerpt,
                is_verified=is_verified,
                char_start=char_start,
                char_end=char_end,
                content_hash=content_hash,
            )
        )


async def process_extracted_claims(
    session: AsyncSession,
    entity: Entity,
    episode: Episode,
    extraction: ExtractionResult,
    topics: list[Topic],
) -> tuple[list[Memory], int, int]:
    """
    Validate extracted claims, verify source evidence, and apply event-time-aware
    state transitions according to topic cardinality and update policies.

    Returns: (affected_memories, new_count, updated_count)
    """
    settings = get_settings()
    topic_map = {t.name.lower(): t for t in topics}
    now = datetime.now(timezone.utc)
    event_time = _ensure_utc(episode.occurred_at) or now
    ep_hash = episode.content_hash or compute_content_hash(episode.content)

    # Load current active/confirmed memories strictly scoped to this entity and workspace
    existing_res = await session.execute(
        select(Memory).where(
            Memory.workspace_id == entity.workspace_id,
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
    )
    active_memories = list(existing_res.scalars().all())
    active_by_id: dict[int, Memory] = {
        m.id: m
        for m in active_memories
        if m.id is not None and m.entity_id == entity.id and m.workspace_id == entity.workspace_id
    }

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
            effective_confidence = min(effective_confidence, 0.45)

        # 3. Enforce Topic Schema as a Strict Contract
        norm_val, structured_val, is_type_valid = validate_and_coerce_value(claim.value, topic)
        if not is_type_valid:
            # Quarantine schema-invalid values so they never pollute active state
            quarantined = Memory(
                workspace_id=entity.workspace_id,
                entity_id=entity.id,
                topic_id=topic.id if topic else None,
                claim=claim.claim,
                value=norm_val,
                structured_value=None,
                claim_type=claim.claim_type,
                confidence=effective_confidence,
                status=MemoryStatus.PENDING_REVIEW,
                valid_from=event_time,
            )
            session.add(quarantined)
            await session.flush()
            await _attach_evidence_if_missing(
                session, quarantined.id, episode.id, claim.evidence_excerpt,
                is_verified, char_start, char_end, ep_hash,
            )
            new_count += 1
            affected_memories.append(quarantined)
            continue

        # 4. Resolve Explicit Target Memory & Exact Duplicate Check
        explicit_target: Optional[Memory] = None
        if claim.target_memory_id and claim.target_memory_id in active_by_id:
            candidate = active_by_id[claim.target_memory_id]
            if candidate.entity_id == entity.id and candidate.workspace_id == entity.workspace_id:
                explicit_target = candidate

        exact_claim_match: Optional[Memory] = None
        for existing in active_memories:
            if existing.claim.strip().lower() == claim.claim.strip().lower():
                exact_claim_match = existing
                break

        support_target = explicit_target if claim.operation == ClaimOperation.SUPPORT else None
        if not support_target and exact_claim_match:
            if claim.operation in (ClaimOperation.ADD, ClaimOperation.SUPPORT):
                support_target = exact_claim_match

        if support_target:
            # Keep confidence calibrated (no arbitrary increments); track corroborating evidence separately
            if is_verified:
                support_target.confidence = max(support_target.confidence, effective_confidence)
            support_target.updated_at = now
            await _attach_evidence_if_missing(
                session, support_target.id, episode.id, claim.evidence_excerpt,
                is_verified, char_start, char_end, ep_hash,
            )
            updated_count += 1
            if support_target not in affected_memories:
                affected_memories.append(support_target)
            continue

        # 5. Determine Target to Supersede vs. Ambiguous Multi-Valued Conflict
        memory_to_supersede: Optional[Memory] = None
        quarantine_for_review = False
        is_single_topic = bool(
            topic and (
                topic.cardinality == TopicCardinality.SINGLE
                or topic.update_policy == UpdatePolicy.REPLACE
            )
        )

        if claim.operation in (ClaimOperation.SUPERSEDE, ClaimOperation.UPDATE, ClaimOperation.CONTRADICT):
            if explicit_target:
                memory_to_supersede = explicit_target
            elif is_single_topic and topic:
                # Safe automatic target resolution ONLY for single-valued topics
                for m in active_memories:
                    if m.topic_id == topic.id and m.status in (MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED):
                        memory_to_supersede = m
                        break
            else:
                # Multi-valued or untopiced conflict without an explicit valid target_memory_id:
                # Never overwrite an arbitrary preference; quarantine for review.
                quarantine_for_review = True
        elif is_single_topic and topic:
            # Single-cardinality topic enforces one active value per entity
            for m in active_memories:
                if m.topic_id == topic.id and m.status in (MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED):
                    memory_to_supersede = m
                    break

        # 6. Apply Update Policy & Event-Time Temporal Reconciliation
        if quarantine_for_review:
            new_memory = Memory(
                workspace_id=entity.workspace_id,
                entity_id=entity.id,
                topic_id=topic.id if topic else None,
                claim=claim.claim,
                value=norm_val,
                structured_value=structured_val,
                claim_type=claim.claim_type,
                confidence=effective_confidence,
                status=MemoryStatus.PENDING_REVIEW,
                valid_from=event_time,
            )
            session.add(new_memory)
            await session.flush()
            new_count += 1
        elif memory_to_supersede:
            # Policy check: REVIEW policy or below-threshold confidence routes candidate to PENDING_REVIEW
            if (
                (topic and topic.update_policy == UpdatePolicy.REVIEW)
                or effective_confidence < settings.conflict_threshold
            ):
                new_memory = Memory(
                    workspace_id=entity.workspace_id,
                    entity_id=entity.id,
                    topic_id=topic.id if topic else None,
                    claim=claim.claim,
                    value=norm_val,
                    structured_value=structured_val,
                    claim_type=claim.claim_type,
                    confidence=effective_confidence,
                    status=MemoryStatus.PENDING_REVIEW,
                    valid_from=event_time,
                )
                session.add(new_memory)
                await session.flush()
                new_count += 1
            else:
                existing_from = _ensure_utc(
                    memory_to_supersede.valid_from or memory_to_supersede.created_at
                ) or now

                if event_time < existing_from:
                    # Out-of-order / late-arriving historical event:
                    # Preserve the newer active memory and record this older claim as historical SUPERSEDED
                    new_memory = Memory(
                        workspace_id=entity.workspace_id,
                        entity_id=entity.id,
                        topic_id=topic.id if topic else None,
                        claim=claim.claim,
                        value=norm_val,
                        structured_value=structured_val,
                        claim_type=claim.claim_type,
                        confidence=effective_confidence,
                        status=MemoryStatus.SUPERSEDED,
                        superseded_by_id=memory_to_supersede.id,
                        valid_from=event_time,
                        valid_to=existing_from,
                    )
                    session.add(new_memory)
                    await session.flush()
                    new_count += 1
                else:
                    # Chronological update: supersede the older active memory
                    old_id = memory_to_supersede.id
                    memory_to_supersede.status = MemoryStatus.SUPERSEDED
                    memory_to_supersede.valid_to = event_time
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
                        valid_from=event_time,
                    )
                    session.add(new_memory)
                    await session.flush()

                    memory_to_supersede.superseded_by_id = new_memory.id
                    active_memories = [m for m in active_memories if m.id != old_id]
                    if old_id is not None:
                        active_by_id.pop(old_id, None)
                    active_memories.append(new_memory)
                    if new_memory.id is not None:
                        active_by_id[new_memory.id] = new_memory
                    updated_count += 1
        else:
            # Coexisting / New Active Memory
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
                valid_from=event_time,
            )
            session.add(new_memory)
            await session.flush()
            active_memories.append(new_memory)
            if new_memory.id is not None:
                active_by_id[new_memory.id] = new_memory
            new_count += 1

        # Create verified evidence link
        await _attach_evidence_if_missing(
            session, new_memory.id, episode.id, claim.evidence_excerpt,
            is_verified, char_start, char_end, ep_hash,
        )
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
