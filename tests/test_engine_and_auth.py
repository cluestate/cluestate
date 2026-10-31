"""Tests for Authentication, Multi-Tenancy, Evidence Verification, and State Resolution."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cluestate.database import get_session
from cluestate.engine import (
    ExtractedClaim,
    ExtractionResult,
    process_extracted_claims,
    validate_and_coerce_value,
    verify_evidence_excerpt,
)
from cluestate.main import create_app
from cluestate.models import (
    ClaimOperation,
    Entity,
    Episode,
    Memory,
    MemoryStatus,
    Topic,
    TopicCardinality,
    UpdatePolicy,
)


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected(db_session: AsyncSession):
    """Requests without Authorization header must be rejected with 401."""
    app = create_app()

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as unauth_client:
        res = await unauth_client.get("/api/entities")
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_signup_login_and_scoped_api_key(db_session: AsyncSession):
    """Test user signup, workspace creation, and authenticating with a generated cs_live_ API key."""
    app = create_app()

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        # 1. Sign up
        signup_res = await ac.post(
            "/api/auth/signup",
            json={
                "email": "founder@acme.io",
                "password": "StrongPassword123!",
                "full_name": "Elena Vance",
                "workspace_name": "Acme Corp",
            },
        )
        assert signup_res.status_code == 201
        data = signup_res.json()
        assert data["user"]["email"] == "founder@acme.io"
        assert data["workspace"]["name"] == "Acme Corp"
        assert data["initial_api_key"].startswith("cs_live_")

        api_key = data["initial_api_key"]

        # 2. Use the initial_api_key to create an entity in Acme Corp's workspace
        ent_res = await ac.post(
            "/api/entities",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"external_id": "acme_cust_1", "name": "Acme Customer"},
        )
        assert ent_res.status_code == 201


def test_evidence_verification():
    """Verify exact match, normalized match, and unverified fallback."""
    source = "I have recently started buying Salomon trail shoes for mountain races."

    # Exact match
    verified, start, end = verify_evidence_excerpt(
        source, "recently started buying Salomon trail shoes"
    )
    assert verified is True
    assert source[start:end] == "recently started buying Salomon trail shoes"

    # Normalized whitespace / case match
    verified_norm, s_norm, e_norm = verify_evidence_excerpt(
        source, "started buying   SALOMON trail shoes"
    )
    assert verified_norm is True
    assert s_norm is not None and e_norm is not None

    # Fabricated quote not in source
    verified_bad, s_bad, e_bad = verify_evidence_excerpt(
        source, "Customer exclusively wears carbon-plated track spikes"
    )
    assert verified_bad is False
    assert s_bad is None and e_bad is None


def test_topic_value_validation():
    """Test schema enforcement for number, boolean, enum, and list types."""
    num_topic = Topic(name="budget", data_type="number")
    norm, val, ok = validate_and_coerce_value("$50,000", num_topic)
    assert ok is True
    assert val == 50000

    enum_topic = Topic(name="tier", data_type="enum", enum_values=["starter", "growth", "enterprise"])
    norm_e, val_e, ok_e = validate_and_coerce_value("Enterprise", enum_topic)
    assert ok_e is True
    assert val_e == "enterprise"

    _, _, ok_bad = validate_and_coerce_value("invalid_tier", enum_topic)
    assert ok_bad is False


@pytest.mark.asyncio
async def test_multi_cardinality_coexistence_vs_single_cardinality_supersede(db_session: AsyncSession):
    """
    Verify that multiple-cardinality topics (e.g. sports_preferences) coexist when new preferences
    are added, whereas single-cardinality topics (e.g. budget) supersede older claims.
    """
    entity = Entity(workspace_id=1, external_id="runner_01", name="Marcus")
    db_session.add(entity)

    sports_topic = Topic(
        workspace_id=1,
        name="sports_preferences",
        data_type="list",
        cardinality=TopicCardinality.MULTIPLE,
        update_policy=UpdatePolicy.APPEND,
    )
    budget_topic = Topic(
        workspace_id=1,
        name="annual_budget",
        data_type="number",
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
    )
    db_session.add_all([sports_topic, budget_topic])
    await db_session.flush()

    # Episode 1: Likes Nike and Adidas, budget $1,000
    ep1 = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="I run in Nike Pegasus and Adidas Boston shoes. My gear budget is $1,000.",
    )
    db_session.add(ep1)
    await db_session.flush()

    extraction1 = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Likes Nike Pegasus running shoes",
                topic_name="sports_preferences",
                value="Nike Pegasus",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="run in Nike Pegasus",
            ),
            ExtractedClaim(
                claim="Likes Adidas Boston running shoes",
                topic_name="sports_preferences",
                value="Adidas Boston",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="Adidas Boston shoes",
            ),
            ExtractedClaim(
                claim="Gear budget is $1,000",
                topic_name="annual_budget",
                value="$1,000",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="My gear budget is $1,000",
            ),
        ]
    )
    await process_extracted_claims(
        db_session, entity, ep1, extraction1, [sports_topic, budget_topic]
    )
    await db_session.commit()

    # Episode 2: Starts buying Salomon shoes (coexists) and updates budget to $1,500 (supersedes)
    ep2 = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="I started buying Salomon trail shoes and increased my gear budget to $1,500.",
    )
    db_session.add(ep2)
    await db_session.flush()

    extraction2 = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Buys Salomon trail shoes",
                topic_name="sports_preferences",
                value="Salomon",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="started buying Salomon trail shoes",
            ),
            ExtractedClaim(
                claim="Gear budget is $1,500",
                topic_name="annual_budget",
                value="$1,500",
                operation=ClaimOperation.SUPERSEDE,
                confidence=0.95,
                evidence_excerpt="increased my gear budget to $1,500",
            ),
        ]
    )
    await process_extracted_claims(
        db_session, entity, ep2, extraction2, [sports_topic, budget_topic]
    )
    await db_session.commit()

    # Check active sports_preferences: all 3 should be ACTIVE
    res_sports = await db_session.execute(
        select(Memory).where(
            Memory.entity_id == entity.id,
            Memory.topic_id == sports_topic.id,
            Memory.status == MemoryStatus.ACTIVE,
        )
    )
    active_sports = res_sports.scalars().all()
    assert len(active_sports) == 3

    # Check active budget: only 1 should be ACTIVE ($1,500), and $1,000 should be SUPERSEDED
    res_budget = await db_session.execute(
        select(Memory).where(
            Memory.entity_id == entity.id,
            Memory.topic_id == budget_topic.id,
            Memory.status == MemoryStatus.ACTIVE,
        )
    )
    active_budgets = res_budget.scalars().all()
    assert len(active_budgets) == 1
    assert active_budgets[0].structured_value == 1500

