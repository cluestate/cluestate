"""Tests for the ClueState Python SDK, State Resolution Engine, and Evidence Verifier."""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from cluestate import AsyncClueState, ClueStateError
from cluestate.app import app
from cluestate.auth import create_access_token
from cluestate.database import get_db
from cluestate.engine import (
    ExtractedClaim,
    ExtractionOutput,
    coerce_and_validate_value,
    process_extracted_claims,
    verify_evidence_excerpt,
)
from cluestate.models import (
     Base,
    ClaimOperation,
    ClaimType,
    Entity,
    Episode,
    MemoryStatus,
    Topic,
    TopicCardinality,
    TopicDataType,
    UpdatePolicy,
    Workspace,
)


@pytest.fixture
async def db_session():
    """Create an isolated in-memory SQLite database session for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        workspace = Workspace(id=1, name="Test Workspace", slug="test-workspace")
        session.add(workspace)
        await session.commit()
        yield session

    await engine.dispose()


def test_verify_evidence_excerpt_exact_and_case_insensitive():
    source = "We migrated our primary database from MySQL to PostgreSQL last month."
    ok, start, end = verify_evidence_excerpt(
        source, "migrated our primary database from MySQL to PostgreSQL"
    )
    assert ok is True
    assert start is not None and end is not None
    assert source[start:end] == "migrated our primary database from MySQL to PostgreSQL"

    ok_missing, s_missing, e_missing = verify_evidence_excerpt(
        source, "We use Oracle Cloud Infrastructure"
    )
    assert ok_missing is False
    assert s_missing is None and e_missing is None


def test_coerce_and_validate_value():
    num_topic = Topic(
        name="annual_budget",
        data_type=TopicDataType.NUMBER,
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
    )
    norm_str, structured, valid = coerce_and_validate_value("$25,000", num_topic)
    assert valid is True
    assert norm_str == "25000"
    assert structured == 25000


@pytest.mark.asyncio
async def test_state_resolution_cardinality_single_vs_multiple(db_session):
    """Verify multiple-cardinality topics coexist while single-cardinality topics supersede."""
    sports_topic = Topic(
        workspace_id=1,
        name="sports_preferences",
        data_type=TopicDataType.LIST,
        cardinality=TopicCardinality.MULTIPLE,
        update_policy=UpdatePolicy.APPEND,
    )
    budget_topic = Topic(
        workspace_id=1,
        name="annual_budget",
        data_type=TopicDataType.NUMBER,
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
    )
    entity = Entity(workspace_id=1, external_id="cust_1", name="Alex Rivera")
    db_session.add_all([sports_topic, budget_topic, entity])
    await db_session.flush()

    ep1 = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="I run in Nike shoes and my annual budget is $10,000.",
    )
    db_session.add(ep1)
    await db_session.flush()

    out1 = ExtractionOutput(
        claims=[
            ExtractedClaim(
                claim="Likes Nike running shoes",
                topic_name="sports_preferences",
                value="Nike",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.95,
                excerpt="I run in Nike shoes",
            ),
            ExtractedClaim(
                claim="Annual budget is $10,000",
                topic_name="annual_budget",
                value="$10,000",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.95,
                excerpt="my annual budget is $10,000",
            ),
        ]
    )
    await process_extracted_claims(
        db_session, entity, ep1, out1, [sports_topic, budget_topic]
    )
    await db_session.commit()

    # Episode 2: Adds Salomon shoes (coexists) and updates budget to $15,000 (supersedes)
    ep2 = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="I recently started buying Salomon trail shoes and raised my annual budget to $15,000.",
    )
    db_session.add(ep2)
    await db_session.flush()

    out2 = ExtractionOutput(
        claims=[
            ExtractedClaim(
                claim="Buys Salomon trail shoes",
                topic_name="sports_preferences",
                value="Salomon",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.SUPERSEDE,  # Even if LLM proposes supersede, APPEND policy preserves coexistence
                confidence=0.95,
                excerpt="recently started buying Salomon trail shoes",
            ),
            ExtractedClaim(
                claim="Annual budget is $15,000",
                topic_name="annual_budget",
                value="$15,000",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.SUPERSEDE,
                confidence=0.95,
                excerpt="raised my annual budget to $15,000",
            ),
        ]
    )
    all_mems, updated_count, new_count = await process_extracted_claims(
        db_session, entity, ep2, out2, [sports_topic, budget_topic]
    )
    await db_session.commit()

    assert new_count == 2
    assert updated_count == 1  # Only annual_budget was superseded

    # Check active memories
    from sqlalchemy import select
    from cluestate.models import Memory

    res = await db_session.execute(
        select(Memory).where(Memory.entity_id == entity.id)
    )
    memories = list(res.scalars().all())
    active_sports = [
        m for m in memories if m.topic_id == sports_topic.id and m.status == MemoryStatus.ACTIVE
    ]
    active_budget = [
        m for m in memories if m.topic_id == budget_topic.id and m.status == MemoryStatus.ACTIVE
    ]
    superseded_budget = [
        m for m in memories if m.topic_id == budget_topic.id and m.status == MemoryStatus.SUPERSEDED
    ]

    assert len(active_sports) == 2  # Both Nike and Salomon remain active!
    assert len(active_budget) == 1
    assert active_budget[0].value == "15000"
    assert len(superseded_budget) == 1
    assert superseded_budget[0].value == "10000"


@pytest.mark.asyncio
async def test_python_sdk_client(db_session):
    """Test AsyncClueState SDK resource methods against the FastAPI ASGI app."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    token = create_access_token(user_id=1, workspace_id=1, email="test@cluestate.com")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers={"Authorization": f"Bearer {token}"},
    ) as http_client:
        sdk = AsyncClueState(
            api_key=token,
            base_url="http://testserver",
            http_client=http_client,
        )

        # 1. Create a topic via SDK
        topic = await sdk.topics.create(
            name="account_tier",
            description="Customer subscription tier",
            data_type="enum",
            cardinality="single",
            update_policy="replace",
            allowed_values=["free", "pro", "enterprise"],
        )
        assert topic.name == "account_tier"
        assert topic.cardinality.value == "single"

        # 2. Create an entity via SDK
        entity = await sdk.entities.create(
            name="Elena Rostova",
            external_id="usr_elena_1",
            entity_type="customer",
        )
        assert entity.external_id == "usr_elena_1"

        # 3. List entities via SDK
        page = await sdk.entities.list(search="Elena")
        assert page.total == 1
        assert page.entities[0].name == "Elena Rostova"

        # 4. Get customer intelligence state via SDK
        intel = await sdk.get_intel(external_id="usr_elena_1")
        assert intel.entity.name == "Elena Rostova"
        assert "Elena Rostova" in intel.formatted_prompt

        # 5. Verify ClueStateError on 404
        with pytest.raises(ClueStateError) as exc_info:
            await sdk.get_intel(external_id="non_existent_customer")
        assert exc_info.value.status_code == 404

    app.dependency_overrides.clear()

