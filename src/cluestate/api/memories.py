"""Memory management and entity intel endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..engine import format_entity_intel
from ..models import Entity, Episode, Evidence, Memory, MemoryStatus, Topic
from ..schemas import EvidenceRead, IntelResponse, MemoryRead, MemoryUpdate

router = APIRouter(tags=["Memories"])


# ──────────────────────────────────────────────
# Memory CRUD
# ──────────────────────────────────────────────

@router.get("/entities/{entity_id}/memories", response_model=list[MemoryRead], tags=["Memories"])
async def list_entity_memories(
    entity_id: int,
    status: MemoryStatus | None = Query(None, description="Filter by status"),
    topic_id: int | None = Query(None, description="Filter by topic"),
    session: AsyncSession = Depends(get_session),
):
    """List memories for an entity with optional filters."""
    entity = await session.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    query = select(Memory).where(Memory.entity_id == entity_id)
    if status:
        query = query.where(Memory.status == status)
    else:
        # Default: show active + confirmed
        query = query.where(Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]))
    if topic_id:
        query = query.where(Memory.topic_id == topic_id)

    query = query.order_by(Memory.confidence.desc())
    result = await session.execute(query)
    memories = result.scalars().all()

    # Fetch topic names and evidence
    response = []
    for m in memories:
        topic_name = None
        if m.topic_id:
            topic = await session.get(Topic, m.topic_id)
            if topic:
                topic_name = topic.name

        # Fetch evidence
        ev_result = await session.execute(
            select(Evidence).where(Evidence.memory_id == m.id)
        )
        evidence = [
            EvidenceRead(**e.model_dump())
            for e in ev_result.scalars().all()
        ]

        response.append(MemoryRead(
            **m.model_dump(),
            topic_name=topic_name,
            evidence=evidence,
        ))

    return response


@router.patch("/memories/{memory_id}", response_model=MemoryRead, tags=["Memories"])
async def update_memory(
    memory_id: int,
    body: MemoryUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Update a memory's status (confirm, reject) or confidence."""
    memory = await session.get(Memory, memory_id)
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(memory, key, value)

    await session.commit()
    await session.refresh(memory)

    topic_name = None
    if memory.topic_id:
        topic = await session.get(Topic, memory.topic_id)
        if topic:
            topic_name = topic.name

    return MemoryRead(**memory.model_dump(), topic_name=topic_name, evidence=[])


@router.delete("/memories/{memory_id}", status_code=204, tags=["Memories"])
async def delete_memory(memory_id: int, session: AsyncSession = Depends(get_session)):
    """Hard-delete a memory."""
    memory = await session.get(Memory, memory_id)
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    await session.delete(memory)
    await session.commit()


# ──────────────────────────────────────────────
# Entity Intel — Formatted for AI Prompts
# ──────────────────────────────────────────────

@router.get("/entities/{entity_id}/intel", response_model=IntelResponse, tags=["Intel"])
async def get_entity_intel(entity_id: int, session: AsyncSession = Depends(get_session)):
    """
    Get formatted entity intelligence ready to paste into AI system prompts.

    Returns a pre-formatted text block + structured memory data.
    """
    entity = await session.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    formatted = await format_entity_intel(session, entity)

    # Get counts
    mem_result = await session.execute(
        select(func.count()).where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
    )
    ep_result = await session.execute(
        select(func.count()).where(Episode.entity_id == entity.id)
    )

    # Get memory list
    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc())
    )
    memories = [MemoryRead(**m.model_dump(), evidence=[]) for m in result.scalars().all()]

    return IntelResponse(
        entity_id=entity.id,
        entity_name=entity.name,
        entity_type=entity.entity_type,
        formatted_prompt=formatted,
        memories=memories,
        total_memories=mem_result.scalar() or 0,
        total_episodes=ep_result.scalar() or 0,
    )


@router.get("/intel/by-external-id/{external_id}", response_model=IntelResponse, tags=["Intel"])
async def get_entity_intel_by_external_id(
    external_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get entity intel by your app's external ID (convenience endpoint)."""
    result = await session.execute(
        select(Entity).where(Entity.external_id == external_id)
    )
    entity = result.scalars().first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity with external_id '{external_id}' not found")

    return await get_entity_intel(entity.id, session)
