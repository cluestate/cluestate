"""Memory management and entity intelligence endpoints scoped to the active workspace."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..engine import format_entity_intel
from ..models import Entity, Episode, Evidence, Memory, MemoryStatus, Topic, Workspace
from ..schemas import EvidenceRead, IntelResponse, MemoryRead, MemoryUpdate
from ..security import get_current_workspace

router = APIRouter(tags=["Memories"])


# ──────────────────────────────────────────────
# Memory CRUD
# ──────────────────────────────────────────────

@router.get("/entities/{entity_id}/memories", response_model=list[MemoryRead], tags=["Memories"])
async def list_entity_memories(
    entity_id: int,
    status: MemoryStatus | None = Query(None, description="Filter by status"),
    topic_id: int | None = Query(None, description="Filter by topic"),
    include_all: bool = Query(False, description="Include pending_review, superseded, and rejected memories"),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """List memories for an entity with optional status and topic filters."""
    entity = await session.get(Entity, entity_id)
    if not entity or entity.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Entity not found")

    query = select(Memory).where(Memory.entity_id == entity_id, Memory.workspace_id == workspace.id)
    if status:
        query = query.where(Memory.status == status)
    elif not include_all:
        query = query.where(Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]))
    if topic_id:
        query = query.where(Memory.topic_id == topic_id)

    query = query.order_by(Memory.confidence.desc())
    result = await session.execute(query)
    memories = result.scalars().all()

    response = []
    for m in memories:
        topic_name = None
        if m.topic_id:
            topic = await session.get(Topic, m.topic_id)
            if topic:
                topic_name = topic.name

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
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Update a memory's status (confirm, reject) or confidence."""
    memory = await session.get(Memory, memory_id)
    if not memory or memory.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Memory not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(memory, key, value)
    memory.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(memory)

    topic_name = None
    if memory.topic_id:
        topic = await session.get(Topic, memory.topic_id)
        if topic:
            topic_name = topic.name

    ev_result = await session.execute(select(Evidence).where(Evidence.memory_id == memory.id))
    evidence = [EvidenceRead(**e.model_dump()) for e in ev_result.scalars().all()]

    return MemoryRead(**memory.model_dump(), topic_name=topic_name, evidence=evidence)


@router.delete("/memories/{memory_id}", status_code=204, tags=["Memories"])
async def delete_memory(
    memory_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Transactionally delete a memory, its linked evidence, and any episodes orphaned by the deletion."""
    memory = await session.get(Memory, memory_id)
    if not memory or memory.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Memory not found")

    # Find episodes linked to this memory before deleting its evidence
    ep_res = await session.execute(
        select(Evidence.episode_id).where(Evidence.memory_id == memory_id)
    )
    linked_episode_ids = {row[0] for row in ep_res.all()}

    # Clear any foreign key reference from superseded memories
    await session.execute(
        update(Memory)
        .where(Memory.superseded_by_id == memory_id)
        .values(superseded_by_id=None)
    )
    # Delete linked evidence rows
    await session.execute(delete(Evidence).where(Evidence.memory_id == memory_id))
    await session.delete(memory)
    await session.flush()

    # Clean up any episodes that no longer back any remaining memory evidence
    for ep_id in linked_episode_ids:
        remaining = (
            await session.execute(
                select(func.count()).select_from(Evidence).where(Evidence.episode_id == ep_id)
            )
        ).scalar() or 0
        if remaining == 0:
            await session.execute(
                delete(Episode).where(
                    Episode.id == ep_id,
                    Episode.workspace_id == workspace.id,
                )
            )

    await session.commit()


@router.delete("/episodes/{episode_id}", status_code=204, tags=["Memories"])
async def delete_episode(
    episode_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Transactionally delete a source episode, its evidence, and any memories backed solely by this episode."""
    episode = await session.get(Episode, episode_id)
    if not episode or episode.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Episode not found")

    mem_res = await session.execute(
        select(Evidence.memory_id).where(Evidence.episode_id == episode_id)
    )
    linked_memory_ids = {row[0] for row in mem_res.all()}

    await session.execute(delete(Evidence).where(Evidence.episode_id == episode_id))
    await session.flush()

    for mem_id in linked_memory_ids:
        remaining = (
            await session.execute(
                select(func.count()).select_from(Evidence).where(Evidence.memory_id == mem_id)
            )
        ).scalar() or 0
        if remaining == 0:
            await session.execute(
                update(Memory)
                .where(Memory.superseded_by_id == mem_id)
                .values(superseded_by_id=None)
            )
            await session.execute(
                delete(Memory).where(
                    Memory.id == mem_id,
                    Memory.workspace_id == workspace.id,
                )
            )

    await session.delete(episode)
    await session.commit()


# ──────────────────────────────────────────────
# Entity Intel — Structured State Block
# ──────────────────────────────────────────────

@router.get("/entities/{entity_id}/intel", response_model=IntelResponse, tags=["Intel"])
async def get_entity_intel(
    entity_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Get formatted entity state and structured memory list."""
    entity = await session.get(Entity, entity_id)
    if not entity or entity.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Entity not found")

    formatted = await format_entity_intel(session, entity)

    mem_result = await session.execute(
        select(func.count()).where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
    )
    ep_result = await session.execute(
        select(func.count()).where(Episode.entity_id == entity.id)
    )

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
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Get entity intelligence by your application's external ID within the active workspace."""
    result = await session.execute(
        select(Entity).where(
            Entity.workspace_id == workspace.id,
            Entity.external_id == external_id,
        )
    )
    entity = result.scalars().first()
    if not entity:
        raise HTTPException(
            status_code=404,
            detail=f"Entity with external_id '{external_id}' not found in this workspace",
        )

    return await get_entity_intel(entity.id, workspace, session)
