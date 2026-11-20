"""
ClueState Evaluation Suite — Deterministic Gate & Live LLM Benchmark Runner.

Usage:
  # Run zero-cost deterministic gate, provenance & judge-escalation checks (CI-safe):
  python evals/run_evals.py --mode deterministic

  # Run live end-to-end extraction + adversarial judge benchmark against configured LLM_MODEL:
  python evals/run_evals.py --mode live
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from cluestate.engine import (
    ExtractedClaim,
    ExtractionResult,
    compile_entity_state,
    compute_content_hash,
    extract_memories_from_text,
    judge_extracted_claims,
    process_extracted_claims,
    should_escalate_to_judge,
)
from cluestate.models import (
    ClaimOperation,
    ClaimType,
    Entity,
    EntityType,
    Episode,
    Evidence,
    Topic,
    TopicCardinality,
    UpdatePolicy,
    Workspace,
)

CASES_PATH = Path(__file__).parent / "cases.json"


async def _run_case(case: dict[str, Any], mode: str) -> tuple[bool, str]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as session:
            policy = case.get("policy") or {}
            ws = Workspace(name="Eval WS", slug="eval-ws", extraction_policy=policy)
            session.add(ws)
            await session.flush()

            entity = Entity(
                workspace_id=ws.id,
                external_id=f"eval_{case['id']}",
                name=case["entity_name"],
                entity_type=EntityType.PERSON,
            )
            session.add(entity)
            await session.flush()

            topics: list[Topic] = []
            for t_def in case.get("topics", []):
                t = Topic(
                    workspace_id=ws.id,
                    name=t_def["name"],
                    data_type=t_def.get("data_type", "text"),
                    cardinality=TopicCardinality(t_def.get("cardinality", "multiple")),
                    update_policy=UpdatePolicy(t_def.get("update_policy", "append")),
                    enum_values=t_def.get("enum_values", []),
                    allow_custom_values=t_def.get("allow_custom_values", False),
                    allow_inferred=t_def.get("allow_inferred", True),
                    constraints=t_def.get("constraints", {}),
                    extraction_instructions=t_def.get("extraction_instructions", ""),
                )
                session.add(t)
                topics.append(t)
            await session.flush()

            content = case["content"]
            episode = Episode(
                workspace_id=ws.id,
                entity_id=entity.id,
                source_type="conversation",
                content=content,
                content_hash=compute_content_hash(content),
                occurred_at=datetime.now(timezone.utc),
            )
            session.add(episode)
            await session.flush()

            if mode == "live":
                extraction = await extract_memories_from_text(
                    content=content,
                    entity_name=entity.name,
                    existing_memories=[],
                    topics=topics,
                    entity_type="person",
                    extraction_policy=policy,
                )
                extraction, decisions, _, _ = await judge_extracted_claims(
                    content=content,
                    entity_name=entity.name,
                    extraction=extraction,
                    existing_memories=[],
                    topics=topics,
                    extraction_policy=policy,
                )
            else:
                claims = [
                    ExtractedClaim(
                        claim=c["claim"],
                        topic_name=c.get("topic_name"),
                        value=c.get("value", ""),
                        claim_type=ClaimType(c.get("claim_type", "explicit")),
                        operation=ClaimOperation(c.get("operation", "add")),
                        confidence=float(c.get("confidence", 0.9)),
                        evidence_excerpt=c.get("evidence_excerpt", ""),
                    )
                    for c in case["simulated_claims"]
                ]
                extraction = ExtractionResult(claims=claims)
                decisions = {}

                if "expect_judge_escalation" in case:
                    should_run, _ = should_escalate_to_judge(
                        content=content,
                        claims=extraction.claims,
                        topics=topics,
                        extraction_policy=policy,
                    )
                    if should_run != case["expect_judge_escalation"]:
                        return False, f"expected judge escalation={case['expect_judge_escalation']}, got {should_run}"

            memories, _, _ = await process_extracted_claims(
                session=session,
                entity=entity,
                episode=episode,
                extraction=extraction,
                topics=topics,
                extraction_policy=policy,
                judge_decisions=decisions,
            )
            await session.flush()

            if "expected_count" in case and len(memories) != case["expected_count"]:
                return False, f"expected {case['expected_count']} memories, got {len(memories)}"

            if "expected_status" in case:
                if not memories or memories[0].status.value != case["expected_status"]:
                    got = memories[0].status.value if memories else "none"
                    return False, f"expected status={case['expected_status']}, got {got}"

            if "max_confidence" in case and memories:
                if memories[0].confidence > case["max_confidence"]:
                    return False, f"expected confidence <= {case['max_confidence']}, got {memories[0].confidence}"

            if "expected_verified" in case and memories:
                from sqlalchemy import select
                ev_res = await session.execute(select(Evidence).where(Evidence.memory_id == memories[0].id))
                ev = ev_res.scalars().first()
                actual_v = bool(ev.is_verified) if ev else False
                if actual_v != case["expected_verified"]:
                    return False, f"expected is_verified={case['expected_verified']}, got {actual_v}"

            if "expected_state" in case:
                topics_by_id = {t.id: t for t in topics if t.id is not None}
                actual_state = compile_entity_state(memories, topics_by_id)
                if actual_state != case["expected_state"]:
                    return False, f"expected state={case['expected_state']}, got {actual_state}"

            return True, "ok"
    finally:
        await engine.dispose()


async def main() -> int:
    parser = argparse.ArgumentParser(description="Run ClueState evaluation benchmark cases.")
    parser.add_argument("--mode", choices=["deterministic", "live"], default="deterministic")
    args = parser.parse_args()

    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    passed = 0
    print(f"ClueState Eval Suite ({args.mode.upper()} mode) — {len(cases)} cases\n" + "-" * 64)

    for case in cases:
        ok, detail = await _run_case(case, args.mode)
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print(f"[{status}] {case['id']:<34} ({case['category']}) — {detail}")

    print("-" * 64)
    print(f"Score: {passed}/{len(cases)} passed ({round(passed / max(len(cases), 1) * 100)}%)")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
