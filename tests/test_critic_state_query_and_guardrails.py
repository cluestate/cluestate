"""Tests for Smart Adversarial Judge, State-Filtered Profiles (?where=...), Demo Seeder, Guardrails & Migration 0004."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine, inspect

from cluestate.api.ingest import _INGEST_RATE_BUCKETS
from cluestate.config import Settings
from cluestate.database import _upgrade_with_connection
from cluestate.engine import (
    ExtractedClaim,
    ExtractionResult,
    JudgeClaimVerdict,
    JudgeResult,
    is_multi_speaker_transcript,
    matches_state_filters,
    should_escalate_to_judge,
)
from cluestate.models import (
    ClaimOperation,
    ClaimType,
    Topic,
    TopicCardinality,
    UpdatePolicy,
)

# ──────────────────────────────────────────────
# 1. Unit Tests: Smart Judge Escalation, Provider Auto-Detect & State Filters
# ──────────────────────────────────────────────

def test_provider_auto_detection(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

    s_anth = Settings(llm_model="openai/gpt-4o-mini", openai_api_key="", anthropic_api_key="sk-ant-test")
    assert s_anth.resolved_llm_model == "anthropic/claude-3-5-haiku-latest"
    assert s_anth.resolved_judge_model == "anthropic/claude-3-5-haiku-latest"

    s_gem = Settings(llm_model="openai/gpt-4o-mini", openai_api_key="", gemini_api_key="gem-key")
    assert s_gem.resolved_llm_model == "gemini/gemini-2.0-flash"

    s_override = Settings(llm_model="openai/gpt-4o-mini", judge_model="openai/gpt-4o", openai_api_key="sk-1")
    assert s_override.resolved_llm_model == "openai/gpt-4o-mini"
    assert s_override.resolved_judge_model == "openai/gpt-4o"


def test_smart_judge_escalation_rules():
    review_topic = Topic(name="known_allergies", update_policy=UpdatePolicy.REVIEW, cardinality=TopicCardinality.MULTIPLE)
    normal_topic = Topic(name="tech_stack", update_policy=UpdatePolicy.APPEND, cardinality=TopicCardinality.MULTIPLE)

    clean_claim = ExtractedClaim(
        claim="Uses PostgreSQL",
        topic_name="tech_stack",
        value="PostgreSQL",
        claim_type=ClaimType.EXPLICIT,
        operation=ClaimOperation.ADD,
        confidence=0.95,
        evidence_excerpt="We use PostgreSQL.",
    )

    # Clean verbatim single-speaker add -> skip in smart mode
    run, reason = should_escalate_to_judge(
        "We use PostgreSQL.", [clean_claim], [normal_topic], {"judge_mode": "smart"}
    )
    assert run is False
    assert reason == "smart:clean_verbatim_add"

    # Always mode -> run even on clean add
    run_always, _ = should_escalate_to_judge(
        "We use PostgreSQL.", [clean_claim], [normal_topic], {"judge_mode": "always"}
    )
    assert run_always is True

    # Off mode -> never run even on conflict
    conflict_claim = clean_claim.model_copy(update={"operation": ClaimOperation.SUPERSEDE})
    run_off, _ = should_escalate_to_judge(
        "We use PostgreSQL.", [conflict_claim], [normal_topic], {"judge_mode": "off"}
    )
    assert run_off is False

    # Smart mode escalates on conflict, review topic, inferred claim, or multi-speaker dialogue
    assert should_escalate_to_judge("We use PostgreSQL.", [conflict_claim], [normal_topic], {"judge_mode": "smart"})[0] is True
    allergy_claim = clean_claim.model_copy(update={"topic_name": "known_allergies"})
    assert should_escalate_to_judge("We use PostgreSQL.", [allergy_claim], [review_topic], {"judge_mode": "smart"})[0] is True
    assert is_multi_speaker_transcript("Doctor: Any allergies?\nPatient: Only peanuts.") is True
    assert should_escalate_to_judge(
        "Doctor: What database?\nPatient: We use PostgreSQL.", [clean_claim], [normal_topic], {"judge_mode": "smart"}
    )[0] is True


def test_matches_state_filters():
    state = {
        "is_vegan": True,
        "annual_budget": 60000,
        "known_allergies": ["penicillin", "tree_nuts"],
        "preferred_contact_method": "sms",
    }
    assert matches_state_filters(state, ["is_vegan:true"]) is True
    assert matches_state_filters(state, ["is_vegan=false"]) is False
    assert matches_state_filters(state, ["known_allergies:penicillin"]) is True
    assert matches_state_filters(state, ["known_allergies!=latex"]) is True
    assert matches_state_filters(state, ["annual_budget>=25000", "annual_budget<=75000"]) is True
    assert matches_state_filters(state, ["annual_budget>60000"]) is False
    assert matches_state_filters(state, ["preferred_contact_method=sms", "is_vegan=true"]) is True


# ──────────────────────────────────────────────
# 2. Integration Tests: Demo Seeder & ?where=... State Querying
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_demo_seeder_and_state_filtering_api(client: AsyncClient):
    # Seed clinical demo (0 LLM cost)
    seed_res = await client.post(
        "/api/workspaces/current/seed-demo",
        json={"preset": "clinical"},
    )
    assert seed_res.status_code == 201
    seed_body = seed_res.json()
    assert seed_body["entities_created"] == 2
    assert seed_body["memories_created"] >= 6

    # Second seed call is idempotent
    seed_again = await client.post(
        "/api/workspaces/current/seed-demo",
        json={"preset": "clinical"},
    )
    assert seed_again.status_code == 201
    assert seed_again.json()["entities_created"] == 0

    # Filter profiles by is_vegan=true -> returns Clara only
    veg_res = await client.get("/api/entities?where=is_vegan:true")
    assert veg_res.status_code == 200
    veg_entities = veg_res.json()
    assert len(veg_entities) == 1
    assert veg_entities[0]["external_id"] == "patient_clara_409"
    assert veg_entities[0]["state"]["is_vegan"] is True

    # Filter profiles by known_allergies=latex -> returns Viktor only
    latex_res = await client.get("/api/entities?where=known_allergies=latex")
    assert latex_res.status_code == 200
    latex_entities = latex_res.json()
    assert len(latex_entities) == 1
    assert latex_entities[0]["external_id"] == "patient_viktor_108"

    # Verify demo pending_review item has judge_note and verified evidence span
    rev_res = await client.get("/api/memories?status=pending_review")
    assert rev_res.status_code == 200
    pending = rev_res.json()
    assert len(pending) == 1
    assert pending[0]["judge_note"]
    assert pending[0]["evidence"][0]["is_verified"] is True
    assert pending[0]["evidence"][0]["char_start"] is not None


# ──────────────────────────────────────────────
# 3. Integration Tests: Adversarial Judge End-to-End & Hosted Guardrails
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ingest_with_adversarial_judge_reject_and_quarantine(client: AsyncClient):
    await client.post(
        "/api/topics",
        json={
            "name": "is_vegan",
            "data_type": "boolean",
            "cardinality": "single",
            "update_policy": "replace",
        },
    )

    mock_extraction = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Patient is vegan",
                topic_name="is_vegan",
                value="true",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.92,
                evidence_excerpt="Are you vegan?",
            ),
            ExtractedClaim(
                claim="Patient prefers morning appointments",
                topic_name=None,
                value="mornings",
                claim_type=ClaimType.INFERRED,
                operation=ClaimOperation.ADD,
                confidence=0.75,
                evidence_excerpt="Usually free before noon.",
            ),
        ]
    )
    mock_judge = JudgeResult(
        verdicts=[
            JudgeClaimVerdict(
                claim_index=0,
                verdict="reject",
                note="Doctor asked a question and patient explicitly answered 'No'.",
            ),
            JudgeClaimVerdict(
                claim_index=1,
                verdict="quarantine",
                note="Inferred scheduling preference; confirm before activating.",
                adjusted_confidence=0.65,
            ),
        ]
    )

    with (
        patch("cluestate.api.ingest.extract_memories_from_text", new=AsyncMock(return_value=mock_extraction)),
        patch("cluestate.engine.instructor.from_litellm") as mock_instructor,
    ):
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_judge)
        mock_instructor.return_value = mock_client

        res = await client.post(
            "/api/ingest",
            json={
                "external_id": "patient_01",
                "entity_name": "Anna",
                "content": "Doctor: Are you vegan?\nPatient: No! Usually free before noon.",
                "source_type": "conversation",
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body["judge_applied"] is True
        assert len(body["judge_rejected"]) == 1
        assert "Doctor asked" in body["judge_rejected"][0]["reason"]
        assert len(body["memories"]) == 1
        assert body["memories"][0]["status"] == "pending_review"
        assert "Inferred scheduling preference" in body["memories"][0]["judge_note"]
        assert body["state"] == {}


@pytest.mark.asyncio
async def test_hosted_rate_limit_and_monthly_quota(client: AsyncClient):
    _INGEST_RATE_BUCKETS.clear()

    mock_extraction = ExtractionResult(claims=[])
    limited_settings = Settings(
        rate_limit_ingest_per_min=1,
        max_ingests_per_workspace_month=10,
    )

    with (
        patch("cluestate.api.ingest.get_settings", return_value=limited_settings),
        patch("cluestate.api.ingest.extract_memories_from_text", new=AsyncMock(return_value=mock_extraction)),
    ):
        r1 = await client.post(
            "/api/ingest",
            json={"external_id": "u1", "content": "Hello", "source_type": "note"},
        )
        assert r1.status_code == 200

        r2 = await client.post(
            "/api/ingest",
            json={"external_id": "u1", "content": "Second call within 1 min", "source_type": "note"},
        )
        assert r2.status_code == 429
        assert "rate limit" in r2.json()["detail"].lower()

    _INGEST_RATE_BUCKETS.clear()

    # Now test monthly quota cap (1 already ingested above -> cap=1 blocks next live ingest)
    quota_settings = Settings(
        rate_limit_ingest_per_min=0,
        max_ingests_per_workspace_month=1,
    )
    with (
        patch("cluestate.api.ingest.get_settings", return_value=quota_settings),
        patch("cluestate.api.ingest.extract_memories_from_text", new=AsyncMock(return_value=mock_extraction)),
    ):
        r3 = await client.post(
            "/api/ingest",
            json={"external_id": "u1", "content": "Over monthly quota", "source_type": "note"},
        )
        assert r3.status_code == 429
        assert "monthly ingestion quota" in r3.json()["detail"].lower()

    _INGEST_RATE_BUCKETS.clear()


# ──────────────────────────────────────────────
# 4. Alembic 0004 Migration Safety Test
# ──────────────────────────────────────────────

def test_alembic_0004_adds_judge_note(tmp_path):
    db_file = tmp_path / "mig_0004.db"
    sync_engine = create_engine(f"sqlite:///{db_file}")
    try:
        with sync_engine.begin() as conn:
            _upgrade_with_connection(conn)
            cols = {c["name"] for c in inspect(conn).get_columns("memories")}
            assert "judge_note" in cols
    finally:
        sync_engine.dispose()
        if db_file.exists():
            os.remove(db_file)
