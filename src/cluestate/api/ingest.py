"""Ingest endpoint — unstructured or structured interaction → verified customer state."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..engine import (
    ExtractionError,
    compute_content_hash,
    extract_memories_from_text,
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
from ..schemas import EvidenceRead, IngestRequest, IngestResponse, MemoryRead
from ..security import get_current_workspace

logger = logging.getLogger("cluestate.api.ingest")

router = APIRouter(prefix="/ingest", tags=["Ingest"])


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
    3. Extract atomic claims via the configured LLM
    4. Verify evidence excerpts against source text and validate topic types
    5. Apply topic cardinality and update policies (add, support, supersede)
    """
    # ── 1. Idempotency Check ──
    if body.idempotency_key:
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
            topic_map = {t.id: t.name for t in t_res.scalars().all()}

            mem_reads = []
            for m in memories:
                m_ev = [EvidenceRead(**e.model_dump()) for e in ev_list if e.memory_id == m.id]
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
                memories=mem_reads,
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
    await ensure_workspace_source_type(workspace, body.source_type, session)

    now = datetime.now(timezone.utc)
    content_hash = compute_content_hash(body.content)
    episode = Episode(
        workspace_id=workspace.id,
        entity_id=entity.id,
        source_type=body.source_type,
        source_record_id=body.source_record_id,
        idempotency_key=body.idempotency_key,
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

    # ── 5. Extract Claims via LLM ──
    logger.info(
        f"Extracting state for entity '{entity.name}' (id={entity.id}, workspace={workspace.id}) "
        f"from {len(body.content)} chars"
    )

    try:
        extraction = await extract_memories_from_text(
            content=body.content,
            entity_name=entity.name or entity.external_id,
            existing_memories=existing_memories,
            topics=topics,
        )
    except ExtractionError as exc:
        await session.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    logger.info(f"LLM extracted {len(extraction.claims)} claims")

    # ── 6. Process and Persist State Transitions ──
    all_memories, new_count, updated_count = await process_extracted_claims(
        session=session,
        entity=entity,
        episode=episode,
        extraction=extraction,
        topics=topics,
    )

    await session.commit()

    # ── 7. Build Response with Verified Evidence ──
    topic_map = {t.id: t.name for t in topics}
    memory_reads = []
    for m in all_memories:
        ev_res = await session.execute(
            select(Evidence).where(Evidence.memory_id == m.id)
        )
        evidence_items = [EvidenceRead(**ev.model_dump()) for ev in ev_res.scalars().all()]
        memory_reads.append(
            MemoryRead(
                **m.model_dump(),
                topic_name=topic_map.get(m.topic_id) if m.topic_id else None,
                evidence=evidence_items,
            )
        )

    return IngestResponse(
        episode_id=episode.id,
        entity_id=entity.id,
        memories_extracted=len(all_memories),
        memories_updated=updated_count,
        memories_new=new_count,
        idempotent_replay=False,
        memories=memory_reads,
    )
