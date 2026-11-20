"""Entity CRUD endpoints scoped to the active workspace."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..engine import compile_entity_state, matches_state_filters
from ..media import delete_upload_file
from ..models import (
    Entity,
    Episode,
    EpisodeAttachment,
    Evidence,
    IngestJob,
    Memory,
    MemoryStatus,
    Topic,
    Workspace,
)
from ..schemas import AttachmentRead, EntityCreate, EntityDetail, EntityRead, EpisodeRead
from ..security import get_current_workspace
from .memories import hydrate_memory_reads, to_attachment_read

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
    where: list[str] = Query(
        default=[],
        description="Filter profiles by compiled state (e.g. where=is_vegan:true&where=annual_budget>=25000)",
    ),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """List tracked entities in the active workspace with batched compiled state and optional state filtering."""
    base_query = (
        select(Entity)
        .where(Entity.workspace_id == workspace.id)
        .order_by(Entity.created_at.desc())
    )
    if search:
        base_query = base_query.where(
            Entity.name.ilike(f"%{search}%") | Entity.external_id.ilike(f"%{search}%")
        )

    clean_where = [w.strip() for w in where if w and w.strip()]
    if not clean_where:
        base_query = base_query.offset(offset).limit(limit)

    result = await session.execute(base_query)
    entities = list(result.scalars().all())
    if not entities:
        return []

    entity_ids = [e.id for e in entities if e.id is not None]

    # Batch-load active/confirmed memories and workspace topics (zero N+1)
    topics_res = await session.execute(
        select(Topic).where(Topic.workspace_id == workspace.id)
    )
    topics_by_id = {t.id: t for t in topics_res.scalars().all() if t.id is not None}

    memories_by_entity: dict[int, list[Memory]] = {}
    if entity_ids:
        mem_res = await session.execute(
            select(Memory)
            .where(
                Memory.entity_id.in_(entity_ids),
                Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
            )
            .order_by(Memory.confidence.desc(), Memory.updated_at.desc())
        )
        for mem in mem_res.scalars().all():
            memories_by_entity.setdefault(mem.entity_id, []).append(mem)

    items: list[EntityRead] = []
    for entity in entities:
        ent_mems = memories_by_entity.get(entity.id, []) if entity.id else []
        compiled = compile_entity_state(ent_mems, topics_by_id)
        if clean_where and not matches_state_filters(compiled, clean_where):
            continue
        items.append(
            EntityRead(
                **entity.model_dump(),
                memory_count=len(ent_mems),
                state=compiled,
            )
        )

    if clean_where:
        return items[offset : offset + limit]
    return items


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
    episodes = list(result.scalars().all())
    ep_ids = [e.id for e in episodes if e.id is not None]
    atts_by_ep: dict[int, list[AttachmentRead]] = {}
    if ep_ids:
        att_res = await session.execute(
            select(EpisodeAttachment)
            .where(EpisodeAttachment.episode_id.in_(ep_ids))
            .order_by(EpisodeAttachment.id.asc())
        )
        for att in att_res.scalars().all():
            atts_by_ep.setdefault(att.episode_id, []).append(to_attachment_read(att))

    return [
        EpisodeRead(**e.model_dump(), attachments=atts_by_ep.get(e.id, []) if e.id else [])
        for e in episodes
    ]


@router.delete("/{entity_id}", status_code=204)
async def delete_entity(
    entity_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Transactionally delete an entity and all associated memories, episodes, attachments, jobs, and evidence."""
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
        att_res = await session.execute(
            select(EpisodeAttachment).where(EpisodeAttachment.episode_id.in_(ep_ids))
        )
        for att in att_res.scalars().all():
            delete_upload_file(att.storage_path)
        await session.execute(delete(EpisodeAttachment).where(EpisodeAttachment.episode_id.in_(ep_ids)))
        await session.execute(delete(Evidence).where(Evidence.episode_id.in_(ep_ids)))

    await session.execute(delete(IngestJob).where(IngestJob.entity_id == entity_id))
    await session.execute(delete(Memory).where(Memory.entity_id == entity_id))
    await session.execute(delete(Episode).where(Episode.entity_id == entity_id))
    await session.delete(entity)
    await session.commit()
