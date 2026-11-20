"""System and dashboard overview statistics scoped to the active workspace."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import __version__
from ..config import get_settings
from ..database import get_session
from ..models import (
    Entity,
    Episode,
    Evidence,
    Memory,
    MemoryStatus,
    Topic,
    Workspace,
    normalize_extraction_policy,
)
from ..security import get_current_workspace

router = APIRouter(prefix="/stats", tags=["System"])


@router.get("")
async def get_dashboard_stats(
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Return overview metrics, recent activity, and authenticated runtime specs for the workspace dashboard."""
    settings = get_settings()

    res_entities = await session.execute(
        select(func.count(Entity.id)).where(Entity.workspace_id == workspace.id)
    )
    total_entities = res_entities.scalar() or 0

    res_total_mem = await session.execute(
        select(func.count(Memory.id)).where(Memory.workspace_id == workspace.id)
    )
    total_memories = res_total_mem.scalar() or 0

    res_active_mem = await session.execute(
        select(func.count(Memory.id)).where(
            Memory.workspace_id == workspace.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
    )
    active_memories = res_active_mem.scalar() or 0

    res_episodes = await session.execute(
        select(func.count(Episode.id)).where(Episode.workspace_id == workspace.id)
    )
    total_episodes = res_episodes.scalar() or 0

    res_topics = await session.execute(
        select(func.count(Topic.id)).where(
            Topic.workspace_id == workspace.id,
            Topic.is_active == True,
        )
    )
    total_topics = res_topics.scalar() or 0

    status_counts = {st.value: 0 for st in MemoryStatus}
    res_st = await session.execute(
        select(Memory.status, func.count(Memory.id))
        .where(Memory.workspace_id == workspace.id)
        .group_by(Memory.status)
    )
    for st_val, cnt in res_st.all():
        key = st_val.value if hasattr(st_val, "value") else str(st_val)
        status_counts[key] = cnt

    res_recent_entities = await session.execute(
        select(Entity)
        .where(Entity.workspace_id == workspace.id)
        .order_by(Entity.created_at.desc())
        .limit(6)
    )
    recent_entities = [
        {
            "id": e.id,
            "external_id": e.external_id,
            "name": e.name,
            "entity_type": e.entity_type.value if hasattr(e.entity_type, "value") else str(e.entity_type),
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in res_recent_entities.scalars().all()
    ]

    res_recent_memories = await session.execute(
        select(
            Memory,
            Entity.name.label("entity_name"),
            Entity.external_id.label("entity_external_id"),
            Topic.name.label("topic_name"),
        )
        .join(Entity, Memory.entity_id == Entity.id)
        .outerjoin(Topic, Memory.topic_id == Topic.id)
        .where(Memory.workspace_id == workspace.id)
        .order_by(Memory.created_at.desc())
        .limit(8)
    )
    recent_rows = res_recent_memories.all()
    recent_mem_ids = [r[0].id for r in recent_rows if r[0].id is not None]
    ev_by_mem: dict[int, Evidence] = {}
    if recent_mem_ids:
        ev_res = await session.execute(
            select(Evidence).where(Evidence.memory_id.in_(recent_mem_ids))
        )
        for ev in ev_res.scalars().all():
            if ev.memory_id not in ev_by_mem or ev.is_verified:
                ev_by_mem[ev.memory_id] = ev

    recent_memories = []
    for row in recent_rows:
        mem = row[0]
        ev = ev_by_mem.get(mem.id) if mem.id is not None else None
        recent_memories.append({
            "id": mem.id,
            "entity_id": mem.entity_id,
            "entity_name": row[1] or row[2] or "Unknown",
            "entity_external_id": row[2] or "",
            "topic_id": mem.topic_id,
            "topic_name": row[3] or "General",
            "claim": mem.claim,
            "value": mem.value,
            "structured_value": mem.structured_value,
            "claim_type": mem.claim_type.value if hasattr(mem.claim_type, "value") else str(mem.claim_type),
            "confidence": mem.confidence,
            "status": mem.status.value if hasattr(mem.status, "value") else str(mem.status),
            "is_verified": bool(ev.is_verified) if ev else False,
            "char_start": ev.char_start if ev else None,
            "char_end": ev.char_end if ev else None,
            "excerpt": ev.excerpt if ev else "",
            "created_at": mem.created_at.isoformat() if mem.created_at else None,
        })

    res_topic_dist = await session.execute(
        select(Topic.name, Topic.label, Topic.data_type, func.count(Memory.id))
        .join(Memory, Topic.id == Memory.topic_id)
        .where(
            Topic.workspace_id == workspace.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .group_by(Topic.id, Topic.name, Topic.label, Topic.data_type)
        .order_by(func.count(Memory.id).desc())
        .limit(8)
    )
    topic_distribution = [
        {
            "name": row[0],
            "label": row[1] or "",
            "data_type": row[2] or "text",
            "count": row[3],
        }
        for row in res_topic_dist.all()
    ]

    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    res_month_ep = await session.execute(
        select(func.count(Episode.id)).where(
            Episode.workspace_id == workspace.id,
            Episode.created_at >= month_start,
        )
    )
    ingests_this_month = res_month_ep.scalar() or 0

    return {
        "total_entities": total_entities,
        "total_memories": total_memories,
        "active_memories": active_memories,
        "pending_review_memories": status_counts.get("pending_review", 0),
        "total_episodes": total_episodes,
        "total_topics": total_topics,
        "status_counts": status_counts,
        "recent_entities": recent_entities,
        "recent_memories": recent_memories,
        "topic_distribution": topic_distribution,
        "extraction_policy": normalize_extraction_policy(workspace.extraction_policy),
        "usage": {
            "ingests_this_month": ingests_this_month,
            "monthly_ingest_limit": settings.max_ingests_per_workspace_month,
            "rate_limit_per_min": settings.rate_limit_ingest_per_min,
        },
        "system_info": {
            "version": __version__,
            "llm_model": settings.resolved_llm_model,
            "judge_model": settings.resolved_judge_model,
            "database": "sqlite" if settings.is_sqlite else "postgresql",
        },
    }
