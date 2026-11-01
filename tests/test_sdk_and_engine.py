"""Regression tests for State Resolution, Schema Contracts, Temporal Ordering, RBAC, Multi-Tenancy, and Python SDK."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cluestate import AsyncClueState, ClueStateError
from cluestate.database import get_session
from cluestate.engine import (
    ExtractedClaim,
    ExtractionResult,
    format_entity_intel,
    process_extracted_claims,
    validate_and_coerce_value,
)
from cluestate.main import create_app
from cluestate.models import (
    ClaimOperation,
    ClaimType,
    Entity,
    EntityType,
    Episode,
    Evidence,
    Memory,
    MemoryStatus,
    Topic,
    TopicCardinality,
    UpdatePolicy,
)
from cluestate.security import create_access_token


def test_locale_aware_number_validation():
    """Verify US thousands, European decimal commas, currency symbols, and k/m suffixes."""
    num_topic = Topic(
        name="annual_budget",
        data_type="number",
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
    )

    assert validate_and_coerce_value("$25,000", num_topic) == ("25000", 25000, True)
    assert validate_and_coerce_value("4,5", num_topic) == ("4.5", 4.5, True)
    assert validate_and_coerce_value("€1.250,50", num_topic) == ("1250.5", 1250.5, True)
    assert validate_and_coerce_value("USD 1,250.50", num_topic) == ("1250.5", 1250.5, True)
    assert validate_and_coerce_value("50k", num_topic) == ("50000", 50000, True)
    assert validate_and_coerce_value("not_a_number", num_topic)[2] is False


@pytest.mark.asyncio
async def test_multi_valued_supersession_safety(db_session: AsyncSession):
    """
    If a multi-valued topic receives SUPERSEDE without a valid target_memory_id,
    it must NOT overwrite an arbitrary preference (e.g. Nike); it quarantines to PENDING_REVIEW.
    When target_memory_id IS provided, only that targeted preference is superseded.
    """
    brand_topic = Topic(
        workspace_id=1,
        name="brand_preferences",
        data_type="text",
        cardinality=TopicCardinality.MULTIPLE,
        update_policy=UpdatePolicy.APPEND,
    )
    entity = Entity(workspace_id=1, external_id="cust_brands", name="Alex Rivera")
    db_session.add_all([brand_topic, entity])
    await db_session.flush()

    ep1 = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="I regularly buy Nike, Adidas, and Salomon gear.",
    )
    db_session.add(ep1)
    await db_session.flush()

    init_claims = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Likes Nike",
                topic_name="brand_preferences",
                value="Nike",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="buy Nike",
            ),
            ExtractedClaim(
                claim="Likes Adidas",
                topic_name="brand_preferences",
                value="Adidas",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="Adidas",
            ),
            ExtractedClaim(
                claim="Likes Salomon",
                topic_name="brand_preferences",
                value="Salomon",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="Salomon gear",
            ),
        ]
    )
    created, _, _ = await process_extracted_claims(db_session, entity, ep1, init_claims, [brand_topic])
    await db_session.commit()
    adidas_mem = next(m for m in created if m.value == "Adidas")

    # Case 1: Ambiguous SUPERSEDE without target_memory_id -> must NOT corrupt Nike!
    ep2 = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="I have stopped buying Adidas.",
    )
    db_session.add(ep2)
    await db_session.flush()

    ambiguous = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Stopped buying Adidas",
                topic_name="brand_preferences",
                value="no_adidas",
                operation=ClaimOperation.SUPERSEDE,
                target_memory_id=None,
                confidence=0.95,
                evidence_excerpt="stopped buying Adidas",
            )
        ]
    )
    affected_ambig, _, _ = await process_extracted_claims(db_session, entity, ep2, ambiguous, [brand_topic])
    await db_session.commit()

    assert affected_ambig[0].status == MemoryStatus.PENDING_REVIEW

    res_active = await db_session.execute(
        select(Memory).where(Memory.entity_id == entity.id, Memory.status == MemoryStatus.ACTIVE)
    )
    active_values = {m.value for m in res_active.scalars().all()}
    assert active_values == {"Nike", "Adidas", "Salomon"}

    # Case 2: Explicit target_memory_id targeting Adidas -> supersedes ONLY Adidas
    ep3 = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="Confirming I switched from Adidas to Brooks.",
    )
    db_session.add(ep3)
    await db_session.flush()

    targeted = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Likes Brooks",
                topic_name="brand_preferences",
                value="Brooks",
                operation=ClaimOperation.SUPERSEDE,
                target_memory_id=adidas_mem.id,
                confidence=0.95,
                evidence_excerpt="switched from Adidas to Brooks",
            )
        ]
    )
    await process_extracted_claims(db_session, entity, ep3, targeted, [brand_topic])
    await db_session.commit()

    res_after = await db_session.execute(
        select(Memory).where(Memory.entity_id == entity.id, Memory.status == MemoryStatus.ACTIVE)
    )
    assert {m.value for m in res_after.scalars().all()} == {"Nike", "Salomon", "Brooks"}


@pytest.mark.asyncio
async def test_strict_schema_contract_quarantines_invalid_enum(db_session: AsyncSession):
    """Schema-invalid values (e.g. 'WhatsApp' outside allowed enum) must be quarantined to PENDING_REVIEW."""
    comm_topic = Topic(
        workspace_id=1,
        name="communication_preference",
        data_type="enum",
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
        enum_values=["email", "phone", "sms"],
    )
    entity = Entity(workspace_id=1, external_id="cust_schema", name="Dana")
    db_session.add_all([comm_topic, entity])
    await db_session.flush()

    ep = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="Please message me on WhatsApp.",
    )
    db_session.add(ep)
    await db_session.flush()

    out = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Prefers WhatsApp messaging",
                topic_name="communication_preference",
                value="WhatsApp",
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="message me on WhatsApp",
            )
        ]
    )
    affected, _, _ = await process_extracted_claims(db_session, entity, ep, out, [comm_topic])
    await db_session.commit()

    assert len(affected) == 1
    assert affected[0].status == MemoryStatus.PENDING_REVIEW

    # Must NOT appear in active intel prompt
    intel_text = await format_entity_intel(db_session, entity)
    assert "WhatsApp" not in intel_text


@pytest.mark.asyncio
async def test_late_arriving_out_of_order_event_does_not_overwrite_newer_state(db_session: AsyncSession):
    """An Oct 10 historical event ingested after an Oct 20 event must NOT overwrite the Oct 20 state."""
    addr_topic = Topic(
        workspace_id=1,
        name="delivery_address",
        data_type="text",
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
        temporal=True,
    )
    entity = Entity(workspace_id=1, external_id="cust_temporal", name="Liam")
    db_session.add_all([addr_topic, entity])
    await db_session.flush()

    oct_20 = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)
    oct_10 = datetime(2026, 10, 10, 9, 0, tzinfo=timezone.utc)

    # First ingested: Newer interaction from Oct 20
    ep_newer = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="My new delivery address is 200 Market St.",
        occurred_at=oct_20,
    )
    db_session.add(ep_newer)
    await db_session.flush()

    await process_extracted_claims(
        db_session,
        entity,
        ep_newer,
        ExtractionResult(
            claims=[
                ExtractedClaim(
                    claim="Delivery address is 200 Market St",
                    topic_name="delivery_address",
                    value="200 Market St",
                    operation=ClaimOperation.ADD,
                    confidence=0.95,
                    evidence_excerpt="new delivery address is 200 Market St",
                )
            ]
        ),
        [addr_topic],
    )
    await db_session.commit()

    # Second ingested (delayed backfill): Older interaction from Oct 10
    ep_older = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="Ship my package to 10 Old Oak Rd.",
        occurred_at=oct_10,
    )
    db_session.add(ep_older)
    await db_session.flush()

    affected_old, _, _ = await process_extracted_claims(
        db_session,
        entity,
        ep_older,
        ExtractionResult(
            claims=[
                ExtractedClaim(
                    claim="Delivery address is 10 Old Oak Rd",
                    topic_name="delivery_address",
                    value="10 Old Oak Rd",
                    operation=ClaimOperation.SUPERSEDE,
                    confidence=0.95,
                    evidence_excerpt="Ship my package to 10 Old Oak Rd",
                )
            ]
        ),
        [addr_topic],
    )
    await db_session.commit()

    # Older claim must be recorded directly as historical SUPERSEDED [Oct 10 -> Oct 20]
    assert affected_old[0].status == MemoryStatus.SUPERSEDED
    assert affected_old[0].valid_to is not None

    # Active claim must still be 200 Market St from Oct 20
    active_res = await db_session.execute(
        select(Memory).where(Memory.entity_id == entity.id, Memory.status == MemoryStatus.ACTIVE)
    )
    active_list = list(active_res.scalars().all())
    assert len(active_list) == 1
    assert active_list[0].value == "200 Market St"
    assert affected_old[0].superseded_by_id == active_list[0].id


@pytest.mark.asyncio
async def test_support_does_not_arbitrarily_inflate_confidence(db_session: AsyncSession):
    """Supporting an existing memory attaches evidence without arbitrary +0.05 confidence inflation."""
    entity = Entity(workspace_id=1, external_id="cust_conf", name="Nora")
    db_session.add(entity)
    await db_session.flush()

    ep1 = Episode(workspace_id=1, entity_id=entity.id, content="I prefer dark mode.")
    db_session.add(ep1)
    await db_session.flush()

    mems1, _, _ = await process_extracted_claims(
        db_session,
        entity,
        ep1,
        ExtractionResult(
            claims=[
                ExtractedClaim(
                    claim="Prefers dark mode",
                    value="dark",
                    claim_type=ClaimType.EXPLICIT,
                    operation=ClaimOperation.ADD,
                    confidence=0.80,
                    evidence_excerpt="prefer dark mode",
                )
            ]
        ),
        [],
    )
    await db_session.commit()
    mem = mems1[0]
    assert mem.confidence == 0.80

    ep2 = Episode(workspace_id=1, entity_id=entity.id, content="Still using dark mode daily.")
    db_session.add(ep2)
    await db_session.flush()

    await process_extracted_claims(
        db_session,
        entity,
        ep2,
        ExtractionResult(
            claims=[
                ExtractedClaim(
                    claim="Prefers dark mode",
                    value="dark",
                    operation=ClaimOperation.SUPPORT,
                    target_memory_id=mem.id,
                    confidence=0.80,
                    evidence_excerpt="using dark mode daily",
                )
            ]
        ),
        [],
    )
    await db_session.commit()

    assert mem.confidence == 0.80
    ev_res = await db_session.execute(select(Evidence).where(Evidence.memory_id == mem.id))
    assert len(ev_res.scalars().all()) == 2


@pytest.mark.asyncio
async def test_multi_tenant_isolation_and_api_key_privilege_separation(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    """
    1. Two workspaces with identical external_id ('shared_cust_1') cannot read or list each other's state.
    2. Scoped API keys (cs_live_...) receive 403 Forbidden on /api/auth/api-keys management endpoints.
    """
    from cluestate.config import get_settings

    monkeypatch.setattr(get_settings(), "allow_signup", True)
    app = create_app()

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        # Sign up Tenant A
        res_a = await ac.post(
            "/api/auth/signup",
            json={
                "email": "a@tenant-a.com",
                "password": "PasswordTenantA1!",
                "full_name": "Alice A",
                "workspace_name": "Tenant A",
            },
        )
        assert res_a.status_code == 201
        jwt_a = res_a.json()["access_token"]
        key_a = res_a.json()["initial_api_key"]

        # Sign up Tenant B
        res_b = await ac.post(
            "/api/auth/signup",
            json={
                "email": "b@tenant-b.com",
                "password": "PasswordTenantB1!",
                "full_name": "Bob B",
                "workspace_name": "Tenant B",
            },
        )
        assert res_b.status_code == 201
        key_b = res_b.json()["initial_api_key"]

        # Both workspaces create an entity with the EXACT SAME external_id
        ent_a = await ac.post(
            "/api/entities",
            headers={"Authorization": f"Bearer {key_a}"},
            json={"external_id": "shared_cust_1", "name": "Secret Customer A"},
        )
        assert ent_a.status_code == 201
        ent_a_id = ent_a.json()["id"]

        ent_b = await ac.post(
            "/api/entities",
            headers={"Authorization": f"Bearer {key_b}"},
            json={"external_id": "shared_cust_1", "name": "Secret Customer B"},
        )
        assert ent_b.status_code == 201

        # Tenant A intel lookup only sees Secret Customer A
        intel_a = await ac.get(
            "/api/intel/by-external-id/shared_cust_1",
            headers={"Authorization": f"Bearer {key_a}"},
        )
        assert intel_a.status_code == 200
        assert intel_a.json()["entity_name"] == "Secret Customer A"

        # Tenant B cannot fetch Tenant A's internal entity_id directly (must get 404)
        cross_read = await ac.get(
            f"/api/entities/{ent_a_id}",
            headers={"Authorization": f"Bearer {key_b}"},
        )
        assert cross_read.status_code == 404

        # API Key RBAC: cs_live_ key MUST be forbidden (403) from listing or creating API keys
        forbid_list = await ac.get(
            "/api/auth/api-keys",
            headers={"Authorization": f"Bearer {key_a}"},
        )
        assert forbid_list.status_code == 403

        forbid_create = await ac.post(
            "/api/auth/api-keys",
            headers={"Authorization": f"Bearer {key_a}"},
            json={"name": "Backdoor Key"},
        )
        assert forbid_create.status_code == 403

        # User JWT session CAN list and create API keys
        allow_list = await ac.get(
            "/api/auth/api-keys",
            headers={"Authorization": f"Bearer {jwt_a}"},
        )
        assert allow_list.status_code == 200
        assert len(allow_list.json()) == 1


@pytest.mark.asyncio
async def test_python_sdk_client(db_session: AsyncSession):
    """Test AsyncClueState SDK resource methods against the FastAPI ASGI app."""
    app = create_app()

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    token = create_access_token(user_id=1, workspace_id=1, email="test@cluestate.com")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver/api",
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
            enum_values=["free", "pro", "enterprise"],
        )
        assert topic.name == "account_tier"
        assert topic.cardinality.value == "single"

        # 2. Create an entity via SDK
        entity = await sdk.entities.create(
            external_id="usr_elena_1",
            name="Elena Rostova",
            entity_type=EntityType.PERSON,
        )
        assert entity.external_id == "usr_elena_1"

        # 3. List entities via SDK
        entities = await sdk.entities.list(search="Elena")
        assert len(entities) == 1
        assert entities[0].name == "Elena Rostova"

        # 4. Get entity intelligence state via SDK
        intel = await sdk.get_intel("usr_elena_1")
        assert intel.entity_name == "Elena Rostova"
        assert "Elena Rostova" in intel.formatted_prompt

        # 5. Verify ClueStateError on 404
        with pytest.raises(ClueStateError) as exc_info:
            await sdk.get_intel("non_existent_customer")
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_spa_path_traversal_regression():
    """
    Regression test for SPA catch-all path traversal:
    Requesting /%2e%2e/%2e%2e/etc/hostname or /%2e%2e/%2e%2e/pyproject.toml
    must never read files outside static_root and must return the SPA index.html.
    """
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        for payload in (
            "/%2e%2e/%2e%2e/etc/hostname",
            "/%2e%2e/%2e%2e/%2e%2e/pyproject.toml",
            "/..%2f..%2fpyproject.toml",
        ):
            res = await ac.get(payload)
            assert res.status_code == 200
            assert "<!doctype html>" in res.text.lower()
            assert "[build-system]" not in res.text


@pytest.mark.asyncio
async def test_health_endpoint_does_not_leak_model():
    """Public /api/health must not disclose llm_model or database backend."""
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        res = await ac.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "llm_model" not in data
        assert "database" not in data


@pytest.mark.asyncio
async def test_sensitive_topic_defaults_to_review_and_complete_episode_forget(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
):
    """
    1. Sensitive topics (e.g. 'food_allergies') default to UpdatePolicy.REVIEW when not specified.
    2. Deleting a memory cleans up its orphaned source Episode so raw text does not linger.
    3. DELETE /api/episodes/{id} removes the episode and any memories backed solely by it.
    """
    # 1. Sensitive topic default policy
    topic_res = await client.post(
        "/api/topics",
        json={
            "name": "food_allergies",
            "description": "Dietary allergies",
            "data_type": "list",
            "cardinality": "multiple",
        },
    )
    assert topic_res.status_code == 201
    assert topic_res.json()["update_policy"] == "review"

    # 2. Memory delete cleans up orphaned Episode
    ent = Entity(workspace_id=1, external_id="forget_test", name="Forget User")
    db_session.add(ent)
    await db_session.flush()

    ep1 = Episode(workspace_id=1, entity_id=ent.id, content="Sensitive text to forget completely.")
    db_session.add(ep1)
    await db_session.flush()

    mem1 = Memory(
        workspace_id=1,
        entity_id=ent.id,
        claim="Has secret claim",
        value="secret",
        confidence=0.9,
    )
    db_session.add(mem1)
    await db_session.flush()

    ev1 = Evidence(memory_id=mem1.id, episode_id=ep1.id, excerpt="Sensitive text", is_verified=True)
    db_session.add(ev1)
    await db_session.commit()

    del_res = await client.delete(f"/api/memories/{mem1.id}")
    assert del_res.status_code == 204

    assert await db_session.get(Episode, ep1.id) is None

    # 3. Direct Episode delete cleans up linked Memory
    ep2 = Episode(workspace_id=1, entity_id=ent.id, content="Second episode to delete directly.")
    db_session.add(ep2)
    await db_session.flush()

    mem2 = Memory(
        workspace_id=1,
        entity_id=ent.id,
        claim="Second claim",
        value="second",
        confidence=0.9,
    )
    db_session.add(mem2)
    await db_session.flush()

    ev2 = Evidence(memory_id=mem2.id, episode_id=ep2.id, excerpt="Second episode", is_verified=True)
    db_session.add(ev2)
    await db_session.commit()

    del_ep_res = await client.delete(f"/api/episodes/{ep2.id}")
    assert del_ep_res.status_code == 204
    assert await db_session.get(Episode, ep2.id) is None
    assert await db_session.get(Memory, mem2.id) is None

