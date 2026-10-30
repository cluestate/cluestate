"""Ingest endpoint — the core operation: unstructured text → structured memories."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..engine import extract_memories_from_text, process_extracted_claims
from ..models import Entity, EntityType, Episode, Memory, MemoryStatus, Topic
from ..schemas import IngestRequest, IngestResponse, MemoryRead

logger = logging.getLogger("cluestate.api.ingest")

router = APIRouter(prefix="/ingest", tags=["Ingest"])


@router.post("", response_model=IngestResponse)
async def ingest(body: IngestRequest, session: AsyncSession = Depends(get_session)):
    """
    Ingest unstructured data about an entity.

    The engine will:
    1. Record the interaction as an Episode
    2. Call the LLM to extract atomic claims
    3. Resolve conflicts with existing memories
    4. Return the extracted memories with confidence scores and evidence
    """
    # ── Resolve entity ──
    entity = None

    if body.entity_id:
        entity = await session.get(Entity, body.entity_id)
        if not entity:
            raise HTTPException(status_code=404, detail=f"Entity with id {body.entity_id} not found")

    elif body.external_id:
        result = await session.execute(
            select(Entity).where(Entity.external_id == body.external_id)
        )
        entity = result.scalars().first()

        if not entity and body.auto_create_entity:
            entity = Entity(
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

    # ── Create episode ──
    episode = Episode(
        entity_id=entity.id,
        source_type=body.source_type,
        content=body.content,
        source_description=body.source_description,
        meta=body.meta,
    )
    session.add(episode)
    await session.flush()

    # ── Fetch context ──
    # Existing memories for this entity
    result = await session.execute(
        select(Memory).where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
    )
    existing_memories = list(result.scalars().all())

    # Active topics
    result = await session.execute(select(Topic).where(Topic.is_active == True))
    topics = list(result.scalars().all())

    # ── Extract memories via LLM ──
    logger.info(f"Extracting memories for entity '{entity.name}' (id={entity.id}) from {len(body.content)} chars")

    extraction = await extract_memories_from_text(
        content=body.content,
        entity_name=entity.name or entity.external_id,
        existing_memories=existing_memories,
        topics=topics,
    )

    logger.info(f"LLM extracted {len(extraction.claims)} claims")

    # ── Process and persist ──
    all_memories, new_count, updated_count = await process_extracted_claims(
        session=session,
        entity=entity,
        episode=episode,
        extraction=extraction,
        topics=topics,
    )

    await session.commit()

    # ── Build response ──
    memory_reads = []
    for m in all_memories:
        topic_name = None
        if m.topic_id:
            for t in topics:
                if t.id == m.topic_id:
                    topic_name = t.name
                    break
        memory_reads.append(MemoryRead(
            **m.model_dump(),
            topic_name=topic_name,
            evidence=[],
        ))

    return IngestResponse(
        episode_id=episode.id,
        entity_id=entity.id,
        memories_extracted=len(all_memories),
        memories_updated=updated_count,
        memories_new=new_count,
        memories=memory_reads,
    )
