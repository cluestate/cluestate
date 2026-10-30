"""System and dashboard overview statistics."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Entity, Episode, Memory, MemoryStatus, Topic

router = APIRouter(prefix="/stats", tags=["System"])


@router.get("")
async def get_dashboard_stats(session: AsyncSession = Depends(get_session)):
    """Return overview metrics and recent activity for the admin dashboard."""
    # Entity count
    res_entities = await session.execute(select(func.count(Entity.id)))
    total_entities = res_entities.scalar() or 0

    # Memory counts (total and active)
    res_total_mem = await session.execute(select(func.count(Memory.id)))
    total_memories = res_total_mem.scalar() or 0

    res_active_mem = await session.execute(
        select(func.count(Memory.id)).where(
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED])
        )
    )
    active_memories = res_active_mem.scalar() or 0

    # Episode count
    res_episodes = await session.execute(select(func.count(Episode.id)))
    total_episodes = res_episodes.scalar() or 0

    # Topic count
    res_topics = await session.execute(
        select(func.count(Topic.id)).where(Topic.is_active == True)
    )
    total_topics = res_topics.scalar() or 0

    # Status distribution
    status_counts = {}
    for st in MemoryStatus:
        res_st = await session.execute(
            select(func.count(Memory.id)).where(Memory.status == st)
        )
        status_counts[st.value] = res_st.scalar() or 0

    # Recent entities
    res_recent_entities = await session.execute(
        select(Entity).order_by(Entity.created_at.desc()).limit(5)
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

    # Recent memories with entity name and topic name
    res_recent_memories = await session.execute(
        select(Memory, Entity.name.label("entity_name"), Topic.name.label("topic_name"))
        .join(Entity, Memory.entity_id == Entity.id)
        .outerjoin(Topic, Memory.topic_id == Topic.id)
        .order_by(Memory.created_at.desc())
        .limit(6)
    )
    recent_memories = []
    for row in res_recent_memories.all():
        mem = row[0]
        recent_memories.append({
            "id": mem.id,
            "entity_id": mem.entity_id,
            "entity_name": row[1] or "Unknown",
            "topic_id": mem.topic_id,
            "topic_name": row[2] or "General",
            "claim": mem.claim,
            "value": mem.value,
            "confidence": mem.confidence,
            "status": mem.status.value if hasattr(mem.status, "value") else str(mem.status),
            "created_at": mem.created_at.isoformat() if mem.created_at else None,
        })

    # Topic distribution with memory counts
    res_topic_dist = await session.execute(
        select(Topic.name, func.count(Memory.id))
        .join(Memory, Topic.id == Memory.topic_id)
        .where(Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]))
        .group_by(Topic.name)
        .order_by(func.count(Memory.id).desc())
        .limit(8)
    )
    topic_distribution = [
        {"name": row[0], "count": row[1]} for row in res_topic_dist.all()
    ]

    return {
        "total_entities": total_entities,
        "total_memories": total_memories,
        "active_memories": active_memories,
        "total_episodes": total_episodes,
        "total_topics": total_topics,
        "status_counts": status_counts,
        "recent_entities": recent_entities,
        "recent_memories": recent_memories,
        "topic_distribution": topic_distribution,
    }
