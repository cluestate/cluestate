"""Durable DB-backed async ingestion worker with automatic exponential-backoff retries (Zero Redis)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_session_factory
from .engine import (
    compile_entity_state,
    compute_content_hash,
    extract_memories_from_text,
    judge_extracted_claims,
    process_extracted_claims,
)
from .media import (
    compose_episode_content,
    extract_text_from_file,
    resolve_upload_path,
)
from .models import (
    Entity,
    Episode,
    EpisodeAttachment,
    IngestJob,
    Memory,
    MemoryStatus,
    Topic,
    Workspace,
)

logger = logging.getLogger("cluestate.worker")

_BACKOFF_SECONDS = (15, 60, 300, 900)


def _backoff_for_attempt(attempt: int) -> int:
    idx = min(max(attempt - 1, 0), len(_BACKOFF_SECONDS) - 1)
    return _BACKOFF_SECONDS[idx]


async def ensure_episode_transcribed(
    session: AsyncSession,
    episode: Episode,
) -> None:
    """
    Ensure any attached media files (images, screenshots, PDFs, DOCX, text) on `episode`
    have been transcribed into `episode.content` so downstream extraction has exact offsets.
    """
    att_res = await session.execute(
        select(EpisodeAttachment)
        .where(EpisodeAttachment.episode_id == episode.id)
        .order_by(EpisodeAttachment.id.asc())
    )
    attachments = list(att_res.scalars().all())
    if not attachments:
        return

    any_new_transcript = False
    transcript_pairs: list[tuple[str, str]] = []

    for att in attachments:
        if att.extracted_text and att.extracted_text.strip():
            transcript_pairs.append((att.filename, att.extracted_text))
            continue

        file_path = resolve_upload_path(att.storage_path)
        if not file_path:
            continue
        raw_bytes = file_path.read_bytes()
        extracted = await extract_text_from_file(raw_bytes, att.mime_type, att.filename)
        att.extracted_text = extracted
        session.add(att)
        transcript_pairs.append((att.filename, extracted))
        any_new_transcript = True

    if any_new_transcript and transcript_pairs:
        base_text = str((episode.meta or {}).get("_raw_user_text", "") or "")
        if not base_text and episode.content and not episode.content.startswith("[ATTACHMENT:"):
            base_text = episode.content
        composed = compose_episode_content(base_text, transcript_pairs)
        if composed:
            episode.content = composed
            episode.content_hash = compute_content_hash(composed)
            session.add(episode)
            await session.flush()


async def run_episode_extraction_pipeline(
    session: AsyncSession,
    workspace: Workspace,
    entity: Entity,
    episode: Episode,
) -> tuple[list[Memory], int, int, bool, list[dict[str, Any]], dict[str, Any], list[Topic]]:
    """
    Execute the complete grounded pipeline for an Episode:
      1. Transcribe any untranscribed media attachments into `episode.content`
      2. Load active memories & active workspace topics
      3. Run LLM Extraction -> Stage 3 Smart Critic/Judge -> Deterministic State Resolution
      4. Compile entity state
    """
    await ensure_episode_transcribed(session, episode)

    if not episode.content or not episode.content.strip():
        raise ValueError("Episode has no text content after processing attachments.")

    mem_res = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.updated_at.desc())
    )
    existing_memories = list(mem_res.scalars().all())

    topic_res = await session.execute(
        select(Topic).where(
            Topic.workspace_id == workspace.id,
            Topic.is_active == True,
        )
    )
    topics = list(topic_res.scalars().all())
    entity_type_str = (
        entity.entity_type.value if hasattr(entity.entity_type, "value") else str(entity.entity_type)
    )

    extraction = await extract_memories_from_text(
        content=episode.content,
        entity_name=entity.name or entity.external_id,
        existing_memories=existing_memories,
        topics=topics,
        entity_type=entity_type_str,
        extraction_policy=workspace.extraction_policy,
    )

    filtered_extraction, judge_decisions, judge_rejected, judge_applied = await judge_extracted_claims(
        content=episode.content,
        entity_name=entity.name or entity.external_id,
        extraction=extraction,
        existing_memories=existing_memories,
        topics=topics,
        extraction_policy=workspace.extraction_policy,
    )

    all_memories, new_count, updated_count = await process_extracted_claims(
        session=session,
        entity=entity,
        episode=episode,
        extraction=filtered_extraction,
        topics=topics,
        extraction_policy=workspace.extraction_policy,
        judge_decisions=judge_decisions,
    )

    topics_by_id = {t.id: t for t in topics if t.id is not None}
    active_res = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc())
    )
    compiled_state = compile_entity_state(list(active_res.scalars().all()), topics_by_id)

    return (
        all_memories,
        new_count,
        updated_count,
        judge_applied,
        judge_rejected,
        compiled_state,
        topics,
    )


async def execute_ingest_job(session: AsyncSession, job: IngestJob) -> IngestJob:
    """Process a single claimed IngestJob inside `session`, updating status or scheduling retry."""
    job_id = job.id
    now = datetime.now(timezone.utc)
    job.status = "processing"
    job.attempts = (job.attempts or 0) + 1
    job.started_at = now
    job.last_error = None
    session.add(job)
    await session.commit()

    try:
        workspace = await session.get(Workspace, job.workspace_id)
        entity = await session.get(Entity, job.entity_id)
        episode = await session.get(Episode, job.episode_id)
        if not workspace or not entity or not episode:
            raise ValueError("Associated workspace, entity, or episode no longer exists.")

        (
            all_memories,
            new_count,
            updated_count,
            judge_applied,
            judge_rejected,
            compiled_state,
            _,
        ) = await run_episode_extraction_pipeline(session, workspace, entity, episode)

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        job.last_error = None
        job.result_summary = {
            "memories_extracted": len(all_memories),
            "memories_new": new_count,
            "memories_updated": updated_count,
            "judge_applied": judge_applied,
            "judge_rejected_count": len(judge_rejected),
            "state_keys": list(compiled_state.keys()),
        }
        session.add(job)
        await session.commit()
        logger.info(
            f"IngestJob #{job.id} completed (episode={job.episode_id}, "
            f"memories={len(all_memories)}, attempt={job.attempts})"
        )
    except Exception as exc:
        await session.rollback()
        fresh_job = await session.get(IngestJob, job_id)
        if not fresh_job:
            return job
        fresh_job.last_error = str(exc)[:2000]
        if fresh_job.attempts < fresh_job.max_attempts:
            delay = _backoff_for_attempt(fresh_job.attempts)
            fresh_job.status = "queued"
            fresh_job.next_run_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
            logger.warning(
                f"IngestJob #{fresh_job.id} attempt {fresh_job.attempts}/{fresh_job.max_attempts} "
                f"failed ({exc}); retrying in {delay}s"
            )
        else:
            fresh_job.status = "failed"
            fresh_job.completed_at = datetime.now(timezone.utc)
            logger.error(
                f"IngestJob #{fresh_job.id} permanently failed after {fresh_job.attempts} attempts: {exc}"
            )
        session.add(fresh_job)
        await session.commit()
        return fresh_job

    return job


async def process_due_jobs_once(session_factory=None) -> int:
    """Poll and execute any due `queued` ingest jobs once. Returns number of jobs processed."""
    factory = session_factory or get_session_factory()
    processed = 0
    now = datetime.now(timezone.utc)

    async with factory() as session:
        res = await session.execute(
            select(IngestJob.id)
            .where(
                IngestJob.status == "queued",
                IngestJob.next_run_at <= now,
            )
            .order_by(IngestJob.next_run_at.asc(), IngestJob.id.asc())
            .limit(10)
        )
        due_ids = [row[0] for row in res.all()]

    for job_id in due_ids:
        async with factory() as session:
            job = await session.get(IngestJob, job_id)
            if not job or job.status != "queued":
                continue
            await execute_ingest_job(session, job)
            processed += 1

    return processed


async def recover_stale_processing_jobs(session_factory=None) -> int:
    """Re-queue any jobs left in 'processing' after an unclean shutdown or Coolify redeploy."""
    factory = session_factory or get_session_factory()
    async with factory() as session:
        res = await session.execute(
            select(IngestJob).where(IngestJob.status == "processing")
        )
        stale = list(res.scalars().all())
        if not stale:
            return 0
        now = datetime.now(timezone.utc)
        for job in stale:
            job.status = "queued"
            job.next_run_at = now
            session.add(job)
        await session.commit()
        logger.info(f"Recovered {len(stale)} interrupted ingest job(s) on startup")
        return len(stale)


class IngestWorkerManager:
    """Lightweight in-process asyncio worker loop running inside FastAPI lifespan."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        settings = get_settings()
        if not settings.enable_ingest_worker:
            return
        await recover_stale_processing_jobs()
        self._stop_event.clear()
        self._task = asyncio.create_task(self._loop(), name="cluestate-ingest-worker")
        logger.info("DB-backed async ingest worker started")

    async def _loop(self) -> None:
        settings = get_settings()
        poll = max(0.25, float(settings.ingest_worker_poll_seconds))
        while not self._stop_event.is_set():
            try:
                processed = await process_due_jobs_once()
                if processed > 0:
                    continue
            except Exception as exc:
                logger.error(f"Ingest worker poll error: {exc}")
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=poll)
            except asyncio.TimeoutError:
                pass

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
            logger.info("DB-backed async ingest worker stopped")
