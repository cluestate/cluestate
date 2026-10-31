"""Entity CRUD endpoints scoped to the active workspace."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Entity, Episode, Evidence, Memory, MemoryStatus, Topic, Workspace
from ..schemas import EntityCreate, EntityDetail, EntityRead, EpisodeRead, EvidenceRead, MemoryRead
from ..security import get_current_workspace

router = APIRouter(prefix="/entities", tags=["Entities"])


@router.post("", response_model=EntityRead, status_code=201)
async def create_entity(
    body: EntityCreate,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Create a new entity within the active workspace."""
    existing = await session.execute(
        select(Entity).where(
            Entity.workspace_id == workspace.id,
            Entity.external_id == body.external_id,
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=409,
            detail=f"Entity with external_id '{body.external_id}' already exists in this workspace",
        )

    entity = Entity(
        workspace_id=workspace.id,
        external_id=body.external_id,
        name=body.name,
        entity_type=body.entity_type,
        meta=body.meta,
    )
    session.add(entity)
    await session.commit()
    await session.refresh(entity)

    return EntityRead(
        **entity.model_dump(),
        memory_count=0,
    )


@router.get("", response_model=list[EntityRead])
async def list_entities(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str = Query("", description="Search by name or external_id"),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """List tracked entities in the active workspace."""
    query = (
        select(Entity)
        .where(Entity.workspace_id == workspace.id)
        .offset(offset)
        .limit(limit)
        .order_by(Entity.created_at.desc())
    )
    if search:
        query = query.where(
            Entity.name.ilike(f"%{search}%") | Entity.external_id.ilike(f"%{search}%")
        )

    result = await session.execute(query)
    entities = result.scalars().all()

    response = []
    for entity in entities:
        count_result = await session.execute(
            select(func.count()).where(
                Memory.entity_id == entity.id,
                Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
            )
        )
        count = count_result.scalar() or 0
        response.append(EntityRead(**entity.model_dump(), memory_count=count))

    return response


@router.get("/{entity_id}", response_model=EntityDetail)
async def get_entity(
    entity_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Get entity details with all active memories and evidence."""
    entity = await session.get(Entity, entity_id)
    if not entity or entity.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Entity not found")

    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc())
    )
    memories = result.scalars().all()

    topic_ids = {m.topic_id for m in memories if m.topic_id}
    topic_map: dict[int, str] = {}
    if topic_ids:
        t_res = await session.execute(select(Topic).where(Topic.id.in_(topic_ids)))
        for t in t_res.scalars().all():
            topic_map[t.id] = t.name

    mem_reads = []
    for m in memories:
        ev_res = await session.execute(select(Evidence).where(Evidence.memory_id == m.id))
        evidence = [EvidenceRead(**ev.model_dump()) for ev in ev_res.scalars().all()]
        mem_reads.append(
            MemoryRead(
                **m.model_dump(),
                topic_name=topic_map.get(m.topic_id) if m.topic_id else None,
                evidence=evidence,
            )
        )

    return EntityDetail(
        **entity.model_dump(),
        memory_count=len(memories),
        memories=mem_reads,
    )


@router.get("/{entity_id}/episodes", response_model=list[EpisodeRead])
async def get_entity_episodes(
    entity_id: int,
    limit: int = Query(50, ge=1, le=100),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Get chronological episodes (source interactions) for an entity."""
    entity = await session.get(Entity, entity_id)
    if not entity or entity.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Entity not found")

    result = await session.execute(
        select(Episode)
        .where(Episode.entity_id == entity_id)
        .order_by(Episode.occurred_at.desc(), Episode.created_at.desc())
        .limit(limit)
    )
    episodes = result.scalars().all()
    return [EpisodeRead(**e.model_dump()) for e in episodes]


@router.delete("/{entity_id}", status_code=204)
async def delete_entity(
    entity_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Transactionally delete an entity and all associated memories, episodes, and evidence."""
    entity = await session.get(Entity, entity_id)
    if not entity or entity.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Entity not found")

    # 1. Find all memory IDs and episode IDs for this entity
    mem_ids_res = await session.execute(select(Memory.id).where(Memory.entity_id == entity_id))
    mem_ids = [row[0] for row in mem_ids_res.all()]

    ep_ids_res = await session.execute(select(Episode.id).where(Episode.entity_id == entity_id))
    ep_ids = [row[0] for row in ep_ids_res.all()]

    # 2. Delete all evidence linked to these memories or episodes
    if mem_ids:
        await session.execute(delete(Evidence).where(Evidence.memory_id.in_(mem_ids)))
        # Clear self-referential superseded_by_id foreign keys before deleting memories
        await session.execute(
            update(Memory).where(Memory.entity_id == entity_id).values(superseded_by_id=None)
        )
    if ep_ids:
        await session.execute(delete(Evidence).where(Evidence.episode_id.in_(ep_ids)))

    # 3. Delete memories and episodes
    await session.execute(delete(Memory).where(Memory.entity_id == entity_id))
    await session.execute(delete(Episode).where(Episode.entity_id == entity_id))

    # 4. Delete the entity itself
    await session.delete(entity)
    await session.commit()
