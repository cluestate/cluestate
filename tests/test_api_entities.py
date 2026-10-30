"""Tests for Entity API endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_get_entity(client: AsyncClient):
    # Create entity
    res = await client.post(
        "/api/entities",
        json={
            "external_id": "cust_101",
            "name": "Alex Mercer",
            "entity_type": "person",
            "meta": {"tier": "gold"},
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["external_id"] == "cust_101"
    assert data["name"] == "Alex Mercer"
    assert data["entity_type"] == "person"
    entity_id = data["id"]

    # Get entity detail
    res_get = await client.get(f"/api/entities/{entity_id}")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == entity_id
    assert res_get.json()["memory_count"] == 0


@pytest.mark.asyncio
async def test_duplicate_external_id_rejected(client: AsyncClient):
    # First creation
    res1 = await client.post(
        "/api/entities",
        json={"external_id": "cust_unique", "name": "User 1"},
    )
    assert res1.status_code == 201

    # Duplicate should fail with 409
    res2 = await client.post(
        "/api/entities",
        json={"external_id": "cust_unique", "name": "User 2"},
    )
    assert res2.status_code == 409


@pytest.mark.asyncio
async def test_list_entities_with_search(client: AsyncClient):
    await client.post(
        "/api/entities",
        json={"external_id": "alice_01", "name": "Alice Cooper"},
    )
    await client.post(
        "/api/entities",
        json={"external_id": "bob_02", "name": "Bob Dylan"},
    )

    # Search for Alice
    res = await client.get("/api/entities?search=Alice")
    assert res.status_code == 200
    results = res.json()
    assert len(results) == 1
    assert results[0]["name"] == "Alice Cooper"


@pytest.mark.asyncio
async def test_delete_entity(client: AsyncClient):
    res = await client.post(
        "/api/entities",
        json={"external_id": "to_delete", "name": "Ephemeral"},
    )
    ent_id = res.json()["id"]

    del_res = await client.delete(f"/api/entities/{ent_id}")
    assert del_res.status_code == 204

    # Verify not found
    get_res = await client.get(f"/api/entities/{ent_id}")
    assert get_res.status_code == 404
