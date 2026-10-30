"""Entity CRUD endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Entity, Episode, Memory, MemoryStatus
from ..schemas import EntityCreate, EntityDetail, EntityRead, EpisodeRead, MemoryRead

router = APIRouter(prefix="/entities", tags=["Entities"])


@router.post("", response_model=EntityRead, status_code=201)
async def create_entity(body: EntityCreate, session: AsyncSession = Depends(get_session)):
    """Create a new entity to track."""
    # Check for duplicate external_id
    existing = await session.execute(
        select(Entity).where(Entity.external_id == body.external_id)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"Entity with external_id '{body.external_id}' already exists")

    entity = Entity(
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
    session: AsyncSession = Depends(get_session),
):
    """List all tracked entities."""
    query = select(Entity).offset(offset).limit(limit).order_by(Entity.created_at.desc())
    if search:
        query = query.where(
            Entity.name.ilike(f"%{search}%") | Entity.external_id.ilike(f"%{search}%")
        )

    result = await session.execute(query)
    entities = result.scalars().all()

    # Get memory counts
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
async def get_entity(entity_id: int, session: AsyncSession = Depends(get_session)):
    """Get entity details with all active memories."""
    entity = await session.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    # Fetch active memories
    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc())
    )
    memories = result.scalars().all()

    return EntityDetail(
        **entity.model_dump(),
        memory_count=len(memories),
        memories=[MemoryRead(**m.model_dump(), evidence=[]) for m in memories],
    )


@router.get("/{entity_id}/episodes", response_model=list[EpisodeRead])
async def get_entity_episodes(
    entity_id: int,
    limit: int = Query(50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Get chronological episodes (source interactions) for an entity."""
    entity = await session.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    result = await session.execute(
        select(Episode)
        .where(Episode.entity_id == entity_id)
        .order_by(Episode.created_at.desc())
        .limit(limit)
    )
    episodes = result.scalars().all()
    return [EpisodeRead(**e.model_dump()) for e in episodes]


@router.delete("/{entity_id}", status_code=204)
async def delete_entity(entity_id: int, session: AsyncSession = Depends(get_session)):
    """Delete an entity and all associated data."""
    entity = await session.get(Entity, entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    await session.delete(entity)
    await session.commit()

