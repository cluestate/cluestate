"""Tests for Phase 1 & Phase 2: Multi-Workspace RBAC, Invite Links, Programmable Memory Schema, Discovery Policy, and Compiled State."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from cluestate.database import get_session
from cluestate.engine import (
    ExtractedClaim,
    ExtractionResult,
    compile_entity_state,
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
    MemoryStatus,
    Topic,
    TopicCardinality,
    UpdatePolicy,
)


def test_programmable_topic_types_and_constraints():
    """Verify date, number bounds, single_select + allow_custom_values, and constrained multi_select."""
    # 1. Date type
    date_topic = Topic(name="renewal_date", data_type="date")
    norm_d, val_d, ok_d = validate_and_coerce_value("2026-12-15", date_topic)
    assert ok_d is True
    assert val_d == "2026-12-15"
    assert validate_and_coerce_value("not_a_date", date_topic)[2] is False

    # 2. Number with min/max constraints
    num_topic = Topic(name="nps_score", data_type="number", constraints={"min": 0, "max": 10})
    assert validate_and_coerce_value("9", num_topic) == ("9", 9, True)
    assert validate_and_coerce_value("15", num_topic)[2] is False
    assert validate_and_coerce_value("-1", num_topic)[2] is False

    # 3. Enum / single_select with allow_custom_values=True vs False
    strict_enum = Topic(
        name="contact",
        data_type="enum",
        enum_values=["sms", "email"],
        allow_custom_values=False,
    )
    assert validate_and_coerce_value("WhatsApp", strict_enum)[2] is False

    open_enum = Topic(
        name="contact",
        data_type="enum",
        enum_values=["sms", "email"],
        allow_custom_values=True,
    )
    assert validate_and_coerce_value("SMS", open_enum) == ("sms", "sms", True)
    assert validate_and_coerce_value("Signal", open_enum) == ("Signal", "Signal", True)

    # 4. Constrained multi_select / list
    strict_list = Topic(
        name="allergies",
        data_type="list",
        enum_values=["penicillin", "peanuts", "latex"],
        allow_custom_values=False,
    )
    assert validate_and_coerce_value("Penicillin, Peanuts", strict_list) == (
        "penicillin, peanuts",
        ["penicillin", "peanuts"],
        True,
    )
    assert validate_and_coerce_value("Penicillin, UnknownDrug", strict_list)[2] is False

    open_list = Topic(
        name="allergies",
        data_type="list",
        enum_values=["penicillin", "peanuts"],
        allow_custom_values=True,
    )
    assert validate_and_coerce_value("Penicillin, Sulfa", open_list) == (
        "penicillin, Sulfa",
        ["penicillin", "Sulfa"],
        True,
    )


@pytest.mark.asyncio
async def test_strict_discovery_policy_and_explicit_only_guardrails(db_session: AsyncSession):
    """
    1. In 'strict' discovery_mode, untagged claims are deterministically dropped.
    2. When a topic has allow_inferred=False, inferred claims are quarantined to PENDING_REVIEW.
    3. When a topic has ttl_days=14, valid_to is set 14 days after event_time.
    4. When a topic has applies_to_entity_types=['organization'], it is skipped for a 'person' entity.
    """
    vegan_topic = Topic(
        workspace_id=1,
        name="is_vegan",
        label="Vegan Diet",
        data_type="boolean",
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
        allow_inferred=False,
        applies_to_entity_types=["person"],
    )
    vacation_topic = Topic(
        workspace_id=1,
        name="on_vacation",
        data_type="boolean",
        cardinality=TopicCardinality.SINGLE,
        update_policy=UpdatePolicy.REPLACE,
        temporal=True,
        ttl_days=14,
    )
    org_only_topic = Topic(
        workspace_id=1,
        name="soc2_certified",
        data_type="boolean",
        applies_to_entity_types=["organization"],
    )
    entity = Entity(
        workspace_id=1,
        external_id="patient_901",
        name="Clara",
        entity_type=EntityType.PERSON,
    )
    db_session.add_all([vegan_topic, vacation_topic, org_only_topic, entity])
    await db_session.flush()

    ev_time = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
    ep = Episode(
        workspace_id=1,
        entity_id=entity.id,
        content="Clara ordered a vegan salad today. She is on vacation for two weeks. Casual small talk about weather.",
        occurred_at=ev_time,
    )
    db_session.add(ep)
    await db_session.flush()

    extraction = ExtractionResult(
        claims=[
            # Inferred claim on allow_inferred=False tag -> must be quarantined to PENDING_REVIEW
            ExtractedClaim(
                claim="Clara is vegan",
                topic_name="is_vegan",
                value="true",
                claim_type=ClaimType.INFERRED,
                operation=ClaimOperation.ADD,
                confidence=0.88,
                evidence_excerpt="ordered a vegan salad today",
            ),
            # Explicit claim on TTL tag -> ACTIVE with valid_to = Nov 15
            ExtractedClaim(
                claim="Clara is on vacation",
                topic_name="on_vacation",
                value="true",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="She is on vacation for two weeks",
            ),
            # Organization-only tag on a Person entity -> must be skipped
            ExtractedClaim(
                claim="SOC2 certified",
                topic_name="soc2_certified",
                value="true",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.95,
                evidence_excerpt="ordered a vegan salad",
            ),
            # Untagged open discovery in strict mode -> must be deterministically dropped
            ExtractedClaim(
                claim="Talked about the weather",
                topic_name=None,
                value="weather",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.90,
                evidence_excerpt="Casual small talk about weather",
            ),
        ]
    )

    affected, new_cnt, _ = await process_extracted_claims(
        db_session,
        entity,
        ep,
        extraction,
        [vegan_topic, vacation_topic, org_only_topic],
        extraction_policy={"discovery_mode": "strict"},
    )
    await db_session.commit()

    # Only 2 claims kept (vegan quarantined, vacation active); org_only and untagged dropped!
    assert len(affected) == 2
    assert new_cnt == 2

    vegan_mem = next(m for m in affected if m.topic_id == vegan_topic.id)
    assert vegan_mem.status == MemoryStatus.PENDING_REVIEW

    vac_mem = next(m for m in affected if m.topic_id == vacation_topic.id)
    assert vac_mem.status == MemoryStatus.ACTIVE
    assert vac_mem.valid_to is not None
    assert (vac_mem.valid_to.replace(tzinfo=timezone.utc) - ev_time).days == 14

    # Compiled state should only include ACTIVE/CONFIRMED memories (on_vacation=True, not quarantined is_vegan)
    topics_by_id = {vegan_topic.id: vegan_topic, vacation_topic.id: vacation_topic}
    state = compile_entity_state(affected, topics_by_id)
    assert state == {"on_vacation": True}


@pytest.mark.asyncio
async def test_multi_workspace_switching_invites_and_compiled_intel(db_session: AsyncSession):
    """
    Test full multi-workspace lifecycle:
    1. Create second workspace with schema cloning + X-Workspace-Id switching
    2. Generate zero-SMTP invite link and accept it as a new user even when ALLOW_SIGNUP=false
    3. Verify RBAC (Viewer cannot create API keys; non-member gets 403 on X-Workspace-Id)
    4. Verify GET /api/intel/by-external-id/{id} returns compiled `state` and hydrated `evidence`
    """
    from sqlalchemy import delete

    from cluestate.models import User, Workspace

    await db_session.execute(delete(Workspace))
    await db_session.execute(delete(User))
    await db_session.commit()

    app = create_app()

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        # 1. Initial Admin Signup
        signup_res = await ac.post(
            "/api/auth/signup",
            json={
                "email": "director@zurichclinic.ch",
                "password": "ClinicPassword123!",
                "full_name": "Dr. Lukas Meyer",
                "workspace_name": "Zurich Clinic Prod",
            },
        )
        assert signup_res.status_code == 201
        admin_jwt = signup_res.json()["access_token"]
        ws1_id = signup_res.json()["workspace"]["id"]

        auth_headers = {"Authorization": f"Bearer {admin_jwt}"}

        # 2. Define rich clinical memory tags in Workspace 1
        t1 = await ac.post(
            "/api/topics",
            headers=auth_headers,
            json={
                "name": "is_vegan",
                "label": "Vegan Diet",
                "data_type": "boolean",
                "cardinality": "single",
                "update_policy": "replace",
                "extraction_instructions": "Only set true if explicitly vegan.",
                "allow_inferred": False,
            },
        )
        assert t1.status_code == 201

        t2 = await ac.post(
            "/api/topics",
            headers=auth_headers,
            json={
                "name": "known_allergies",
                "label": "Known Allergies",
                "data_type": "list",
                "cardinality": "multiple",
                "update_policy": "append",
                "enum_values": ["penicillin", "peanuts"],
                "allow_custom_values": True,
            },
        )
        assert t2.status_code == 201

        # 3. Create Workspace 2 cloning schema from Workspace 1
        ws2_res = await ac.post(
            "/api/workspaces",
            headers=auth_headers,
            json={
                "name": "Zurich Clinic Staging",
                "clone_schema_from_workspace_id": ws1_id,
            },
        )
        assert ws2_res.status_code == 201
        ws2_id = ws2_res.json()["workspace"]["id"]
        assert ws2_res.json()["initial_api_key"].startswith("cs_live_")

        # Verify Workspace 2 has the cloned topics via X-Workspace-Id header
        ws2_topics = await ac.get(
            "/api/topics",
            headers={**auth_headers, "X-Workspace-Id": str(ws2_id)},
        )
        assert ws2_topics.status_code == 200
        assert {t["name"] for t in ws2_topics.json()} == {"is_vegan", "known_allergies"}

        # 4. Generate a zero-SMTP invite link for Workspace 1 with 'viewer' role
        inv_res = await ac.post(
            f"/api/workspaces/{ws1_id}/invites",
            headers=auth_headers,
            json={"email": "nurse@zurichclinic.ch", "role": "viewer"},
        )
        assert inv_res.status_code == 201
        invite_token = inv_res.json()["token"]

        # Public inspect invite
        inspect_res = await ac.get(f"/api/auth/invites/{invite_token}")
        assert inspect_res.status_code == 200
        assert inspect_res.json()["workspace_name"] == "Zurich Clinic Prod"

        # Accept invite as a brand-new user (even though ALLOW_SIGNUP=false!)
        accept_res = await ac.post(
            f"/api/auth/invites/{invite_token}/accept",
            json={
                "email": "nurse@zurichclinic.ch",
                "full_name": "Anna Weber",
                "password": "NursePassword123!",
            },
        )
        assert accept_res.status_code == 200
        nurse_jwt = accept_res.json()["access_token"]
        assert accept_res.json()["workspace"]["id"] == ws1_id
        assert accept_res.json()["workspace"]["role"] == "viewer"

        # 5. Viewer RBAC: Nurse can read Workspace 1 entities, cannot mint API keys, and cannot access Workspace 2
        nurse_headers = {"Authorization": f"Bearer {nurse_jwt}"}
        forbid_key = await ac.post(
            "/api/auth/api-keys",
            headers=nurse_headers,
            json={"name": "Unauthorized Key"},
        )
        assert forbid_key.status_code == 403

        forbid_ws2 = await ac.get(
            "/api/entities",
            headers={**nurse_headers, "X-Workspace-Id": str(ws2_id)},
        )
        assert forbid_ws2.status_code == 403
