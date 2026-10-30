"""Tests for Memories and Stats API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from cluestate.models import Entity, EntityType, Memory, MemoryStatus, Topic


@pytest.mark.asyncio
async def test_stats_endpoint(client: AsyncClient, db_session: AsyncSession):
    # Seed an entity and memory directly
    entity = Entity(external_id="stats_user", name="Stats User", entity_type=EntityType.PERSON)
    db_session.add(entity)
    await db_session.flush()

    topic = Topic(name="preferences", description="Preferences")
    db_session.add(topic)
    await db_session.flush()

    memory = Memory(
        entity_id=entity.id,
        topic_id=topic.id,
        claim="Prefers dark theme",
        value="dark theme",
        confidence=0.92,
        status=MemoryStatus.ACTIVE,
    )
    db_session.add(memory)
    await db_session.commit()

    # Call stats API
    res = await client.get("/api/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["total_entities"] >= 1
    assert data["active_memories"] >= 1
    assert len(data["recent_entities"]) >= 1
    assert len(data["recent_memories"]) >= 1
    assert data["recent_memories"][0]["claim"] == "Prefers dark theme"


@pytest.mark.asyncio
async def test_memory_status_and_confidence_update(client: AsyncClient, db_session: AsyncSession):
    entity = Entity(external_id="mem_user", name="Memory User", entity_type=EntityType.PERSON)
    db_session.add(entity)
    await db_session.flush()

    memory = Memory(
        entity_id=entity.id,
        claim="Enjoys espresso",
        value="espresso",
        confidence=0.6,
        status=MemoryStatus.ACTIVE,
    )
    db_session.add(memory)
    await db_session.commit()
    await db_session.refresh(memory)

    # Confirm memory and boost confidence
    update_res = await client.patch(
        f"/api/memories/{memory.id}",
        json={"status": "confirmed", "confidence": 0.98},
    )
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["status"] == "confirmed"
    assert data["confidence"] == 0.98

    # List memories for entity
    list_res = await client.get(f"/api/entities/{entity.id}/memories")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1
