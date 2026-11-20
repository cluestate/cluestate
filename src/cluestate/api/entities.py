"""Entity CRUD endpoints scoped to the active workspace."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..engine import compile_entity_state
from ..models import Entity, Episode, Evidence, Memory, MemoryStatus, Workspace
from ..schemas import EntityCreate, EntityDetail, EntityRead, EpisodeRead
from ..security import get_current_workspace
from .memories import hydrate_memory_reads

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
    """List tracked entities in the active workspace with batched memory counts (zero N+1)."""
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
    entities = list(result.scalars().all())
    if not entities:
        return []

    entity_ids = [e.id for e in entities if e.id is not None]
    counts_by_entity: dict[int, int] = {}
    if entity_ids:
        cnt_res = await session.execute(
            select(Memory.entity_id, func.count(Memory.id))
            .where(
                Memory.entity_id.in_(entity_ids),
                Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
            )
            .group_by(Memory.entity_id)
        )
        counts_by_entity = {row[0]: row[1] for row in cnt_res.all()}

    return [
        EntityRead(**entity.model_dump(), memory_count=counts_by_entity.get(entity.id, 0) if entity.id else 0)
        for entity in entities
    ]


@router.get("/{entity_id}", response_model=EntityDetail)
async def get_entity(
    entity_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Get entity details with all active memories, evidence, and compiled state."""
    entity = await session.get(Entity, entity_id)
    if not entity or entity.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Entity not found")

    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc(), Memory.updated_at.desc())
    )
    memories = list(result.scalars().all())
    mem_reads, topics_by_id = await hydrate_memory_reads(session, memories, workspace.id)
    compiled_state = compile_entity_state(memories, topics_by_id)

    return EntityDetail(
        **entity.model_dump(),
        memory_count=len(memories),
        memories=mem_reads,
        state=compiled_state,
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

    mem_ids_res = await session.execute(select(Memory.id).where(Memory.entity_id == entity_id))
    mem_ids = [row[0] for row in mem_ids_res.all()]

    ep_ids_res = await session.execute(select(Episode.id).where(Episode.entity_id == entity_id))
    ep_ids = [row[0] for row in ep_ids_res.all()]

    if mem_ids:
        await session.execute(delete(Evidence).where(Evidence.memory_id.in_(mem_ids)))
        await session.execute(
            update(Memory).where(Memory.entity_id == entity_id).values(superseded_by_id=None)
        )
    if ep_ids:
        await session.execute(delete(Evidence).where(Evidence.episode_id.in_(ep_ids)))

    await session.execute(delete(Memory).where(Memory.entity_id == entity_id))
    await session.execute(delete(Episode).where(Episode.entity_id == entity_id))
    await session.delete(entity)
    await session.commit()
