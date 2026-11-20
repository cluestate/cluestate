"""Memory management, global review queue, and entity intelligence endpoints scoped to the active workspace."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..engine import compile_entity_state, format_entity_intel, validate_and_coerce_value
from ..models import Entity, Episode, Evidence, Memory, MemoryStatus, Topic, Workspace
from ..schemas import EvidenceRead, IntelResponse, MemoryRead, MemoryUpdate
from ..security import get_current_workspace

router = APIRouter(tags=["Memories"])


async def hydrate_memory_reads(
    session: AsyncSession,
    memories: list[Memory],
    workspace_id: int,
) -> tuple[list[MemoryRead], dict[int, Topic]]:
    """
    Batch-load Topics, Entities, Evidence, and Episodes for a list of Memories
    with zero N+1 queries.
    """
    t_res = await session.execute(select(Topic).where(Topic.workspace_id == workspace_id))
    topics_all = list(t_res.scalars().all())
    topics_by_id: dict[int, Topic] = {t.id: t for t in topics_all if t.id is not None}

    if not memories:
        return [], topics_by_id

    entity_ids = list({m.entity_id for m in memories if m.entity_id is not None})
    entities_by_id: dict[int, Entity] = {}
    if entity_ids:
        e_res = await session.execute(select(Entity).where(Entity.id.in_(entity_ids)))
        entities_by_id = {e.id: e for e in e_res.scalars().all() if e.id is not None}

    mem_ids = [m.id for m in memories if m.id is not None]
    ev_list: list[Evidence] = []
    if mem_ids:
        ev_res = await session.execute(select(Evidence).where(Evidence.memory_id.in_(mem_ids)))
        ev_list = list(ev_res.scalars().all())

    ep_ids = list({ev.episode_id for ev in ev_list if ev.episode_id is not None})
    episodes_by_id: dict[int, Episode] = {}
    if ep_ids:
        ep_res = await session.execute(select(Episode).where(Episode.id.in_(ep_ids)))
        episodes_by_id = {ep.id: ep for ep in ep_res.scalars().all() if ep.id is not None}

    ev_by_mem: dict[int, list[EvidenceRead]] = {}
    for ev in ev_list:
        ep = episodes_by_id.get(ev.episode_id)
        ev_by_mem.setdefault(ev.memory_id, []).append(
            EvidenceRead(
                **ev.model_dump(),
                episode_content=ep.content if ep else None,
                episode_source_type=ep.source_type if ep else None,
                episode_description=ep.source_description if ep else None,
                episode_occurred_at=ep.occurred_at if ep else None,
            )
        )

    reads: list[MemoryRead] = []
    for m in memories:
        ent = entities_by_id.get(m.entity_id)
        top = topics_by_id.get(m.topic_id) if m.topic_id else None
        reads.append(
            MemoryRead(
                **m.model_dump(),
                entity_name=ent.name if ent else None,
                entity_external_id=ent.external_id if ent else None,
                topic_name=top.name if top else None,
                evidence=ev_by_mem.get(m.id, []) if m.id is not None else [],
            )
        )

    return reads, topics_by_id


# ──────────────────────────────────────────────
# Global Workspace Memories & Review Queue
# ──────────────────────────────────────────────

@router.get("/memories", response_model=list[MemoryRead], tags=["Memories"])
async def list_workspace_memories(
    status: MemoryStatus | None = Query(None, description="Filter by status (e.g. pending_review)"),
    topic_id: int | None = Query(None, description="Filter by topic ID"),
    entity_id: int | None = Query(None, description="Filter by entity ID"),
    search: str = Query("", description="Search claim or value text"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """List memories across the active workspace (powers the global Review Queue and ledger filter)."""
    query = select(Memory).where(Memory.workspace_id == workspace.id)
    if status:
        query = query.where(Memory.status == status)
    if topic_id is not None:
        if topic_id == 0:
            query = query.where(Memory.topic_id.is_(None))
        else:
            query = query.where(Memory.topic_id == topic_id)
    if entity_id is not None:
        query = query.where(Memory.entity_id == entity_id)
    if search:
        query = query.where(
            Memory.claim.ilike(f"%{search}%") | Memory.value.ilike(f"%{search}%")
        )

    query = query.order_by(Memory.created_at.desc()).offset(offset).limit(limit)
    result = await session.execute(query)
    memories = list(result.scalars().all())
    reads, _ = await hydrate_memory_reads(session, memories, workspace.id)
    return reads


# ──────────────────────────────────────────────
# Entity Memory CRUD
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

    query = query.order_by(Memory.confidence.desc(), Memory.created_at.desc())
    result = await session.execute(query)
    memories = list(result.scalars().all())

    reads, _ = await hydrate_memory_reads(session, memories, workspace.id)
    return reads


@router.patch("/memories/{memory_id}", response_model=MemoryRead, tags=["Memories"])
async def update_memory(
    memory_id: int,
    body: MemoryUpdate,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Update a memory's status (confirm, reject), confidence, claim text, value, or assigned topic."""
    memory = await session.get(Memory, memory_id)
    if not memory or memory.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Memory not found")

    update_data = body.model_dump(exclude_unset=True)

    if "topic_id" in update_data and update_data["topic_id"] is not None:
        target_topic = await session.get(Topic, update_data["topic_id"])
        if not target_topic or target_topic.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail="Target topic not found in this workspace")

    for key, value in update_data.items():
        setattr(memory, key, value)

    # Re-coerce structured_value when value or topic_id changes
    if "value" in update_data or "topic_id" in update_data:
        topic_obj = await session.get(Topic, memory.topic_id) if memory.topic_id else None
        norm_val, structured_val, is_valid = validate_and_coerce_value(memory.value, topic_obj)
        memory.value = norm_val
        if is_valid:
            memory.structured_value = structured_val

    memory.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(memory)

    reads, _ = await hydrate_memory_reads(session, [memory], workspace.id)
    return reads[0]


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

    ep_res = await session.execute(
        select(Evidence.episode_id).where(Evidence.memory_id == memory_id)
    )
    linked_episode_ids = {row[0] for row in ep_res.all()}

    await session.execute(
        update(Memory)
        .where(Memory.superseded_by_id == memory_id)
        .values(superseded_by_id=None)
    )
    await session.execute(delete(Evidence).where(Evidence.memory_id == memory_id))
    await session.delete(memory)
    await session.flush()

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
# Entity Intel — Structured State Block & Compiled Dict
# ──────────────────────────────────────────────

@router.get("/entities/{entity_id}/intel", response_model=IntelResponse, tags=["Intel"])
async def get_entity_intel(
    entity_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Get formatted entity state, compiled key-value state dictionary, and structured memory list."""
    entity = await session.get(Entity, entity_id)
    if not entity or entity.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Entity not found")

    formatted = await format_entity_intel(session, entity)

    ep_result = await session.execute(
        select(func.count()).where(Episode.entity_id == entity.id)
    )

    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc(), Memory.updated_at.desc())
    )
    raw_memories = list(result.scalars().all())
    mem_reads, topics_by_id = await hydrate_memory_reads(session, raw_memories, workspace.id)
    compiled_state = compile_entity_state(raw_memories, topics_by_id)

    return IntelResponse(
        entity_id=entity.id,
        entity_name=entity.name,
        entity_type=entity.entity_type,
        formatted_prompt=formatted,
        state=compiled_state,
        memories=mem_reads,
        total_memories=len(mem_reads),
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
