"""Tests for dynamic, workspace-defined source categories (source types)."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from cluestate.engine import ExtractedClaim, ExtractionResult
from cluestate.models import DEFAULT_SOURCE_TYPES, normalize_source_type


def test_normalize_source_type():
    assert normalize_source_type("reflection") == "reflection"
    assert normalize_source_type("Goal Reflection") == "goal_reflection"
    assert normalize_source_type("Sprint-Retro_1") == "sprint-retro_1"
    assert normalize_source_type("") == "conversation"
    assert normalize_source_type(None) == "conversation"


@pytest.mark.asyncio
async def test_list_default_source_types(client: AsyncClient):
    """Initial workspace should return standard core default categories."""
    res = await client.get("/api/source-types")
    assert res.status_code == 200
    data = res.json()
    assert "source_types" in data
    assert "defaults" in data
    for default_st in DEFAULT_SOURCE_TYPES:
        assert default_st in data["source_types"]


@pytest.mark.asyncio
async def test_ingest_with_arbitrary_source_type_auto_provisions(client: AsyncClient):
    """
    Ingesting with a custom source_type like 'reflection' should succeed without 422
    and automatically register 'reflection' in the workspace.
    """
    mock_extracted = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="User is focused on running a marathon",
                value="Marathon training",
                topic_name="goals",
                confidence=0.95,
                evidence_quote="training for a marathon",
            )
        ]
    )

    with patch("cluestate.api.ingest.extract_memories_from_text", new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = mock_extracted

        # Ingest with domain-specific 'reflection' source type (e.g. from Elevist)
        res = await client.post(
            "/api/ingest",
            json={
                "external_id": "elevist_user_42",
                "content": "Today's reflection: I am training for a marathon and hit 15km.",
                "source_type": "reflection",
                "source_description": "Elevist Goal Reflection Textarea",
            },
        )

        assert res.status_code == 200, res.text
        data = res.json()
        assert data["episode_id"] > 0
        assert data["memories_extracted"] == 1

        # Check that 'reflection' was automatically registered in workspace
        st_res = await client.get("/api/source-types")
        assert st_res.status_code == 200
        registered = st_res.json()["source_types"]
        assert "reflection" in registered


@pytest.mark.asyncio
async def test_manage_source_types_api(client: AsyncClient):
    """Test explicit CRUD operations for source categories."""
    # 1. Add a new source type
    add_res = await client.post("/api/source-types", json={"name": "standup_note"})
    assert add_res.status_code == 201
    assert "standup_note" in add_res.json()["source_types"]

    # 2. Cannot delete default core types
    del_default_res = await client.delete("/api/source-types/conversation")
    assert del_default_res.status_code == 400

    # 3. Can delete custom type
    del_res = await client.delete("/api/source-types/standup_note")
    assert del_res.status_code == 200
    assert "standup_note" not in del_res.json()["source_types"]
