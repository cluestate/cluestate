"""Tests for Topic API endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_list_topics(client: AsyncClient):
    # Create topic
    res = await client.post(
        "/api/topics",
        json={
            "name": "preferences",
            "description": "User likes and dislikes",
            "data_type": "list",
            "enum_values": [],
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "preferences"
    assert data["is_active"] is True

    # List active topics
    list_res = await client.get("/api/topics")
    assert list_res.status_code == 200
    topics = list_res.json()
    assert any(t["name"] == "preferences" for t in topics)


@pytest.mark.asyncio
async def test_duplicate_topic_rejected(client: AsyncClient):
    res1 = await client.post(
        "/api/topics",
        json={"name": "budget", "description": "Budget limits"},
    )
    assert res1.status_code == 201

    res2 = await client.post(
        "/api/topics",
        json={"name": "budget", "description": "Duplicate budget"},
    )
    assert res2.status_code == 409


@pytest.mark.asyncio
async def test_update_and_deactivate_topic(client: AsyncClient):
    res = await client.post(
        "/api/topics",
        json={"name": "pain_points", "description": "Old description"},
    )
    topic_id = res.json()["id"]

    # Update description
    update_res = await client.put(
        f"/api/topics/{topic_id}",
        json={"description": "Updated client challenges"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["description"] == "Updated client challenges"

    # Deactivate topic (soft delete)
    del_res = await client.delete(f"/api/topics/{topic_id}")
    assert del_res.status_code == 204

    # Active only list shouldn't include it
    active_res = await client.get("/api/topics?active_only=true")
    assert not any(t["id"] == topic_id for t in active_res.json())
