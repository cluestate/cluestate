"""Ingest endpoint — unstructured or structured interaction → verified customer state."""

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session
from ..engine import (
    ExtractionError,
    compile_entity_state,
    compute_content_hash,
    extract_memories_from_text,
    judge_extracted_claims,
    process_extracted_claims,
)
from ..models import (
    Entity,
    EntityType,
    Episode,
    Evidence,
    Memory,
    MemoryStatus,
    Topic,
    Workspace,
    ensure_workspace_source_type,
)
from ..schemas import EvidenceRead, IngestRequest, IngestResponse, JudgeRejectedItem, MemoryRead
from ..security import get_current_workspace

logger = logging.getLogger("cluestate.api.ingest")

router = APIRouter(prefix="/ingest", tags=["Ingest"])

# In-memory sliding-window rate limiter per workspace_id (timestamps in monotonic seconds)
_INGEST_RATE_BUCKETS: dict[int, deque[float]] = defaultdict(deque)


def _check_workspace_rate_limit(workspace_id: int, limit_per_min: int) -> None:
    if limit_per_min <= 0:
        return
    now_mono = time.monotonic()
    cutoff = now_mono - 60.0
    bucket = _INGEST_RATE_BUCKETS[workspace_id]
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= limit_per_min:
        retry_after = max(1, int(60 - (now_mono - bucket[0])))
        raise HTTPException(
            status_code=429,
            detail=f"Workspace ingestion rate limit exceeded ({limit_per_min}/min). Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    bucket.append(now_mono)


async def _check_workspace_monthly_quota(
    session: AsyncSession,
    workspace_id: int,
    monthly_limit: int,
) -> None:
    if monthly_limit <= 0:
        return
    now_utc = datetime.now(timezone.utc)
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    res = await session.execute(
        select(func.count(Episode.id)).where(
            Episode.workspace_id == workspace_id,
            Episode.created_at >= month_start,
        )
    )
    used = res.scalar() or 0
    if used >= monthly_limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Workspace monthly ingestion quota reached ({used}/{monthly_limit}). "
                "Upgrade your plan or increase MAX_INGESTS_PER_WORKSPACE_MONTH."
            ),
        )


@router.post("", response_model=IngestResponse)
async def ingest(
    body: IngestRequest,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """
    Ingest customer interaction data into the workspace.

    The engine will:
    1. Check idempotency key to prevent duplicate ingestion on retries
    2. Record the interaction as an Episode with source timestamp and content hash
    3. Extract atomic claims via the configured LLM guided by workspace Memory Tags & Discovery Policy
    4. Verify evidence excerpts against source text and validate topic types/constraints
    5. Apply topic cardinality and update policies (add, support, supersede)
    6. If `dry_run=True`, rollback transaction after simulating state resolution
    """
    # ── 1. Idempotency Check (skip if dry_run) ──
    if body.idempotency_key and not body.dry_run:
        existing_ep_res = await session.execute(
            select(Episode).where(
                Episode.workspace_id == workspace.id,
                Episode.idempotency_key == body.idempotency_key,
            )
        )
        existing_ep = existing_ep_res.scalars().first()
        if existing_ep:
            ev_res = await session.execute(
                select(Evidence).where(Evidence.episode_id == existing_ep.id)
            )
            ev_list = ev_res.scalars().all()
            mem_ids = list({ev.memory_id for ev in ev_list})
            memories = []
            if mem_ids:
                m_res = await session.execute(select(Memory).where(Memory.id.in_(mem_ids)))
                memories = list(m_res.scalars().all())

            t_res = await session.execute(
                select(Topic).where(Topic.workspace_id == workspace.id)
            )
            topics_all = list(t_res.scalars().all())
            topic_map = {t.id: t.name for t in topics_all if t.id is not None}
            topics_by_id = {t.id: t for t in topics_all if t.id is not None}

            mem_reads = []
            for m in memories:
                m_ev = [
                    EvidenceRead(
                        **e.model_dump(),
                        episode_content=existing_ep.content,
                        episode_source_type=existing_ep.source_type,
                        episode_description=existing_ep.source_description,
                        episode_occurred_at=existing_ep.occurred_at,
                    )
                    for e in ev_list
                    if e.memory_id == m.id
                ]
                mem_reads.append(
                    MemoryRead(
                        **m.model_dump(),
                        topic_name=topic_map.get(m.topic_id) if m.topic_id else None,
                        evidence=m_ev,
                    )
                )

            return IngestResponse(
                episode_id=existing_ep.id,
                entity_id=existing_ep.entity_id,
                memories_extracted=len(mem_reads),
                memories_updated=0,
                memories_new=0,
                idempotent_replay=True,
                dry_run=False,
                judge_applied=False,
                judge_rejected=[],
                state=compile_entity_state(memories, topics_by_id),
                memories=mem_reads,
            )

    # ── 1b. Hosted Rate Limit & Monthly Quota Guardrails ──
    settings = get_settings()
    if workspace.id is not None:
        _check_workspace_rate_limit(workspace.id, settings.rate_limit_ingest_per_min)
        if not body.dry_run:
            await _check_workspace_monthly_quota(
                session, workspace.id, settings.max_ingests_per_workspace_month
            )

    # ── 2. Resolve Entity ──
    entity = None

    if body.entity_id:
        entity = await session.get(Entity, body.entity_id)
        if not entity or entity.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail=f"Entity with id {body.entity_id} not found")

    elif body.external_id:
        result = await session.execute(
            select(Entity).where(
                Entity.workspace_id == workspace.id,
                Entity.external_id == body.external_id,
            )
        )
        entity = result.scalars().first()

        if not entity and body.auto_create_entity:
            entity = Entity(
                workspace_id=workspace.id,
                external_id=body.external_id,
                name=body.entity_name or body.external_id,
                entity_type=EntityType.PERSON,
            )
            session.add(entity)
            await session.flush()
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either entity_id or external_id",
        )

    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found and auto_create_entity is disabled")

    # ── 3. Create Episode with Auto-Registered Source Type ──
    if not body.dry_run:
        await ensure_workspace_source_type(workspace, body.source_type, session)

    now = datetime.now(timezone.utc)
    content_hash = compute_content_hash(body.content)
    episode = Episode(
        workspace_id=workspace.id,
        entity_id=entity.id,
        source_type=body.source_type,
        source_record_id=body.source_record_id,
        idempotency_key=None if body.dry_run else body.idempotency_key,
        content=body.content,
        content_hash=content_hash,
        source_description=body.source_description,
        meta=body.meta,
        occurred_at=body.occurred_at or now,
        created_at=now,
    )
    session.add(episode)
    await session.flush()

    # ── 4. Fetch Context ──
    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.updated_at.desc())
    )
    existing_memories = list(result.scalars().all())

    result = await session.execute(
        select(Topic).where(
            Topic.workspace_id == workspace.id,
            Topic.is_active == True,
        )
    )
    topics = list(result.scalars().all())
    entity_type_str = entity.entity_type.value if hasattr(entity.entity_type, "value") else str(entity.entity_type)

    # ── 5. Extract Claims via LLM ──
    logger.info(
        f"Extracting state for entity '{entity.name}' (id={entity.id}, workspace={workspace.id}, dry_run={body.dry_run}) "
        f"from {len(body.content)} chars"
    )

    try:
        extraction = await extract_memories_from_text(
            content=body.content,
            entity_name=entity.name or entity.external_id,
            existing_memories=existing_memories,
            topics=topics,
            entity_type=entity_type_str,
            extraction_policy=workspace.extraction_policy,
        )
    except ExtractionError as exc:
        await session.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    logger.info(f"LLM extracted {len(extraction.claims)} claims")

    # ── 5b. Stage 3 Adversarial Critic / Judge (off | smart | always) ──
    filtered_extraction, judge_decisions, judge_rejected, judge_applied = await judge_extracted_claims(
        content=body.content,
        entity_name=entity.name or entity.external_id,
        extraction=extraction,
        existing_memories=existing_memories,
        topics=topics,
        extraction_policy=workspace.extraction_policy,
    )

    # ── 6. Process and Persist State Transitions ──
    all_memories, new_count, updated_count = await process_extracted_claims(
        session=session,
        entity=entity,
        episode=episode,
        extraction=filtered_extraction,
        topics=topics,
        extraction_policy=workspace.extraction_policy,
        judge_decisions=judge_decisions,
    )

    # ── 7. Build Response with Batched Verified Evidence & Compiled State ──
    topic_map = {t.id: t.name for t in topics if t.id is not None}
    topics_by_id = {t.id: t for t in topics if t.id is not None}

    mem_ids = [m.id for m in all_memories if m.id is not None]
    ev_by_mem: dict[int, list[EvidenceRead]] = {}
    if mem_ids:
        ev_res = await session.execute(select(Evidence).where(Evidence.memory_id.in_(mem_ids)))
        for ev in ev_res.scalars().all():
            ev_by_mem.setdefault(ev.memory_id, []).append(
                EvidenceRead(
                    **ev.model_dump(),
                    episode_content=episode.content if ev.episode_id == episode.id else None,
                    episode_source_type=episode.source_type if ev.episode_id == episode.id else None,
                    episode_description=episode.source_description if ev.episode_id == episode.id else None,
                    episode_occurred_at=episode.occurred_at if ev.episode_id == episode.id else None,
                )
            )

    memory_reads = [
        MemoryRead(
            **m.model_dump(),
            entity_name=entity.name,
            entity_external_id=entity.external_id,
            topic_name=topic_map.get(m.topic_id) if m.topic_id else None,
            evidence=ev_by_mem.get(m.id, []) if m.id is not None else [],
        )
        for m in all_memories
    ]

    # Compile full entity state post-extraction
    active_res = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc())
    )
    compiled_state = compile_entity_state(list(active_res.scalars().all()), topics_by_id)

    ep_id = episode.id or 0
    ent_id = entity.id or 0

    if body.dry_run:
        await session.rollback()
    else:
        await session.commit()

    return IngestResponse(
        episode_id=ep_id,
        entity_id=ent_id,
        memories_extracted=len(all_memories),
        memories_updated=updated_count,
        memories_new=new_count,
        idempotent_replay=False,
        dry_run=body.dry_run,
        judge_applied=judge_applied,
        judge_rejected=[JudgeRejectedItem(**r) for r in judge_rejected],
        state=compiled_state,
        memories=memory_reads,
    )
