"""Ingest endpoints — sync & async text/multimodal ingestion, durable queue jobs, and retries."""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session
from ..engine import (
    ExtractionError,
    compile_entity_state,
    compute_content_hash,
    extract_memories_from_text,
    judge_extracted_claims,
    process_extracted_claims,
)
from ..media import (
    MediaError,
    compose_episode_content,
    delete_upload_file,
    extract_text_from_file,
    normalize_mime_type,
    save_upload_bytes,
)
from ..models import (
    Entity,
    EntityType,
    Episode,
    EpisodeAttachment,
    Evidence,
    IngestJob,
    Memory,
    MemoryStatus,
    Topic,
    Workspace,
    ensure_workspace_source_type,
    normalize_source_type,
)
from ..schemas import (
    AttachmentRead,
    EvidenceRead,
    IngestJobRead,
    IngestRequest,
    IngestResponse,
    JudgeRejectedItem,
    MemoryRead,
)
from ..security import get_current_workspace
from .memories import to_attachment_read

logger = logging.getLogger("cluestate.api.ingest")

router = APIRouter(prefix="/ingest", tags=["Ingest"])

# In-memory sliding-window rate limiter per workspace_id (timestamps in monotonic seconds)
_INGEST_RATE_BUCKETS: dict[int, deque[float]] = defaultdict(deque)


def _check_workspace_rate_limit(workspace_id: int, limit_per_min: int) -> None:
    if limit_per_min <= 0:
        return
    now_mono = time.monotonic()
    cutoff = now_mono - 60.0
    bucket = _INGEST_RATE_BUCKETS[workspace_id]
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= limit_per_min:
        retry_after = max(1, int(60 - (now_mono - bucket[0])))
        raise HTTPException(
            status_code=429,
            detail=f"Workspace ingestion rate limit exceeded ({limit_per_min}/min). Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    bucket.append(now_mono)


async def _check_workspace_monthly_quota(
    session: AsyncSession,
    workspace_id: int,
    monthly_limit: int,
) -> None:
    if monthly_limit <= 0:
        return
    now_utc = datetime.now(timezone.utc)
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    res = await session.execute(
        select(func.count(Episode.id)).where(
            Episode.workspace_id == workspace_id,
            Episode.created_at >= month_start,
        )
    )
    used = res.scalar() or 0
    if used >= monthly_limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Workspace monthly ingestion quota reached ({used}/{monthly_limit}). "
                "Upgrade your plan or increase MAX_INGESTS_PER_WORKSPACE_MONTH."
            ),
        )


async def _resolve_or_create_entity(
    session: AsyncSession,
    workspace: Workspace,
    *,
    entity_id: Optional[int],
    external_id: Optional[str],
    entity_name: str,
    auto_create_entity: bool,
) -> Entity:
    entity = None
    if entity_id:
        entity = await session.get(Entity, entity_id)
        if not entity or entity.workspace_id != workspace.id:
            raise HTTPException(status_code=404, detail=f"Entity with id {entity_id} not found")
    elif external_id:
        result = await session.execute(
            select(Entity).where(
                Entity.workspace_id == workspace.id,
                Entity.external_id == external_id,
            )
        )
        entity = result.scalars().first()
        if not entity and auto_create_entity:
            entity = Entity(
                workspace_id=workspace.id,
                external_id=external_id,
                name=entity_name or external_id,
                entity_type=EntityType.PERSON,
            )
            session.add(entity)
            await session.flush()
    else:
        raise HTTPException(status_code=400, detail="Provide either entity_id or external_id")

    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found and auto_create_entity is disabled")
    return entity


async def _build_idempotent_replay_response(
    session: AsyncSession,
    workspace: Workspace,
    existing_ep: Episode,
) -> IngestResponse:
    ev_res = await session.execute(
        select(Evidence).where(Evidence.episode_id == existing_ep.id)
    )
    ev_list = list(ev_res.scalars().all())
    mem_ids = list({ev.memory_id for ev in ev_list})
    memories = []
    if mem_ids:
        m_res = await session.execute(select(Memory).where(Memory.id.in_(mem_ids)))
        memories = list(m_res.scalars().all())

    t_res = await session.execute(select(Topic).where(Topic.workspace_id == workspace.id))
    topics_all = list(t_res.scalars().all())
    topic_map = {t.id: t.name for t in topics_all if t.id is not None}
    topics_by_id = {t.id: t for t in topics_all if t.id is not None}

    att_res = await session.execute(
        select(EpisodeAttachment).where(EpisodeAttachment.episode_id == existing_ep.id)
    )
    ep_atts = [to_attachment_read(a) for a in att_res.scalars().all()]

    mem_reads = []
    for m in memories:
        m_ev = [
            EvidenceRead(
                **e.model_dump(),
                episode_content=existing_ep.content,
                episode_source_type=existing_ep.source_type,
                episode_description=existing_ep.source_description,
                episode_occurred_at=existing_ep.occurred_at,
                episode_attachments=ep_atts,
            )
            for e in ev_list
            if e.memory_id == m.id
        ]
        mem_reads.append(
            MemoryRead(
                **m.model_dump(),
                topic_name=topic_map.get(m.topic_id) if m.topic_id else None,
                evidence=m_ev,
            )
        )

    job_res = await session.execute(
        select(IngestJob)
        .where(IngestJob.episode_id == existing_ep.id)
        .order_by(IngestJob.id.desc())
        .limit(1)
    )
    existing_job = job_res.scalars().first()

    return IngestResponse(
        episode_id=existing_ep.id,
        entity_id=existing_ep.entity_id,
        memories_extracted=len(mem_reads),
        memories_updated=0,
        memories_new=0,
        idempotent_replay=True,
        dry_run=False,
        job_id=existing_job.id if existing_job else None,
        job_status=existing_job.status if existing_job else None,
        judge_applied=False,
        judge_rejected=[],
        state=compile_entity_state(memories, topics_by_id),
        memories=mem_reads,
    )


async def _run_sync_extraction_and_build_response(
    session: AsyncSession,
    workspace: Workspace,
    entity: Entity,
    episode: Episode,
    *,
    dry_run: bool,
    queue_on_error: bool,
    response: Response,
    ep_attachments: list[AttachmentRead] | None = None,
) -> IngestResponse:
    settings = get_settings()

    # Fetch context
    result = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.updated_at.desc())
    )
    existing_memories = list(result.scalars().all())

    result = await session.execute(
        select(Topic).where(
            Topic.workspace_id == workspace.id,
            Topic.is_active == True,
        )
    )
    topics = list(result.scalars().all())
    entity_type_str = (
        entity.entity_type.value if hasattr(entity.entity_type, "value") else str(entity.entity_type)
    )

    logger.info(
        f"Extracting state for entity '{entity.name}' (id={entity.id}, workspace={workspace.id}, dry_run={dry_run}) "
        f"from {len(episode.content)} chars"
    )

    try:
        extraction = await extract_memories_from_text(
            content=episode.content,
            entity_name=entity.name or entity.external_id,
            existing_memories=existing_memories,
            topics=topics,
            entity_type=entity_type_str,
            extraction_policy=workspace.extraction_policy,
        )
    except ExtractionError as exc:
        if queue_on_error and not dry_run:
            now = datetime.now(timezone.utc)
            job = IngestJob(
                workspace_id=workspace.id,
                entity_id=entity.id,
                episode_id=episode.id,
                status="queued",
                attempts=1,
                max_attempts=settings.ingest_job_max_attempts,
                next_run_at=now,
                last_error=str(exc)[:2000],
                created_at=now,
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)
            response.status_code = 202
            return IngestResponse(
                episode_id=episode.id or 0,
                entity_id=entity.id or 0,
                memories_extracted=0,
                memories_updated=0,
                memories_new=0,
                idempotent_replay=False,
                dry_run=False,
                job_id=job.id,
                job_status=job.status,
                judge_applied=False,
                judge_rejected=[],
                state={},
                memories=[],
            )
        await session.rollback()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    logger.info(f"LLM extracted {len(extraction.claims)} claims")

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

    topic_map = {t.id: t.name for t in topics if t.id is not None}
    topics_by_id = {t.id: t for t in topics if t.id is not None}

    mem_ids = [m.id for m in all_memories if m.id is not None]
    ev_by_mem: dict[int, list[EvidenceRead]] = {}
    if mem_ids:
        ev_res = await session.execute(select(Evidence).where(Evidence.memory_id.in_(mem_ids)))
        for ev in ev_res.scalars().all():
            ev_by_mem.setdefault(ev.memory_id, []).append(
                EvidenceRead(
                    **ev.model_dump(),
                    episode_content=episode.content if ev.episode_id == episode.id else None,
                    episode_source_type=episode.source_type if ev.episode_id == episode.id else None,
                    episode_description=episode.source_description if ev.episode_id == episode.id else None,
                    episode_occurred_at=episode.occurred_at if ev.episode_id == episode.id else None,
                    episode_attachments=ep_attachments or [] if ev.episode_id == episode.id else [],
                )
            )

    memory_reads = [
        MemoryRead(
            **m.model_dump(),
            entity_name=entity.name,
            entity_external_id=entity.external_id,
            topic_name=topic_map.get(m.topic_id) if m.topic_id else None,
            evidence=ev_by_mem.get(m.id, []) if m.id is not None else [],
        )
        for m in all_memories
    ]

    active_res = await session.execute(
        select(Memory)
        .where(
            Memory.entity_id == entity.id,
            Memory.status.in_([MemoryStatus.ACTIVE, MemoryStatus.CONFIRMED]),
        )
        .order_by(Memory.confidence.desc())
    )
    compiled_state = compile_entity_state(list(active_res.scalars().all()), topics_by_id)

    ep_id = episode.id or 0
    ent_id = entity.id or 0

    if dry_run:
        await session.rollback()
    else:
        await session.commit()

    return IngestResponse(
        episode_id=ep_id,
        entity_id=ent_id,
        memories_extracted=len(all_memories),
        memories_updated=updated_count,
        memories_new=new_count,
        idempotent_replay=False,
        dry_run=dry_run,
        judge_applied=judge_applied,
        judge_rejected=[JudgeRejectedItem(**r) for r in judge_rejected],
        state=compiled_state,
        memories=memory_reads,
    )


# ──────────────────────────────────────────────
# 1. Text Ingestion (Sync default, or Async Queue)
# ──────────────────────────────────────────────

@router.post("", response_model=IngestResponse)
async def ingest(
    body: IngestRequest,
    response: Response,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """
    Ingest text interaction data into the workspace.

    - `mode="sync"` (default): Extracts, audits with Smart Judge, and returns verified memories immediately.
    - `mode="async"`: Persists the Episode and enqueues a durable retryable IngestJob, returning `202 Accepted`.
    - `dry_run=True`: Simulates extraction and schema validation without persisting any database changes.
    """
    mode = (body.mode or "sync").strip().lower()
    if mode not in ("sync", "async"):
        raise HTTPException(status_code=400, detail="mode must be 'sync' or 'async'")
    if body.dry_run:
        mode = "sync"

    # ── 1. Idempotency Check (skip if dry_run) ──
    if body.idempotency_key and not body.dry_run:
        existing_ep_res = await session.execute(
            select(Episode).where(
                Episode.workspace_id == workspace.id,
                Episode.idempotency_key == body.idempotency_key,
            )
        )
        existing_ep = existing_ep_res.scalars().first()
        if existing_ep:
            return await _build_idempotent_replay_response(session, workspace, existing_ep)

    # ── 1b. Hosted Rate Limit & Monthly Quota Guardrails ──
    settings = get_settings()
    if workspace.id is not None:
        _check_workspace_rate_limit(workspace.id, settings.rate_limit_ingest_per_min)
        if not body.dry_run:
            await _check_workspace_monthly_quota(
                session, workspace.id, settings.max_ingests_per_workspace_month
            )

    # ── 2. Resolve Entity ──
    entity = await _resolve_or_create_entity(
        session,
        workspace,
        entity_id=body.entity_id,
        external_id=body.external_id,
        entity_name=body.entity_name,
        auto_create_entity=body.auto_create_entity,
    )

    # ── 3. Create Episode ──
    if not body.dry_run:
        await ensure_workspace_source_type(workspace, body.source_type, session)

    now = datetime.now(timezone.utc)
    content_hash = compute_content_hash(body.content)
    episode = Episode(
        workspace_id=workspace.id,
        entity_id=entity.id,
        source_type=body.source_type,
        source_record_id=body.source_record_id,
        idempotency_key=None if body.dry_run else body.idempotency_key,
        content=body.content,
        content_hash=content_hash,
        source_description=body.source_description,
        meta=body.meta,
        occurred_at=body.occurred_at or now,
        created_at=now,
    )
    session.add(episode)
    await session.flush()

    # ── 4. Async Mode -> Enqueue Durable Job & Return 202 ──
    if mode == "async":
        job = IngestJob(
            workspace_id=workspace.id,
            entity_id=entity.id,
            episode_id=episode.id,
            status="queued",
            attempts=0,
            max_attempts=settings.ingest_job_max_attempts,
            next_run_at=now,
            created_at=now,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        response.status_code = 202
        return IngestResponse(
            episode_id=episode.id or 0,
            entity_id=entity.id or 0,
            memories_extracted=0,
            memories_updated=0,
            memories_new=0,
            idempotent_replay=False,
            dry_run=False,
            job_id=job.id,
            job_status=job.status,
            judge_applied=False,
            judge_rejected=[],
            state={},
            memories=[],
        )

    # ── 5. Sync Mode ──
    return await _run_sync_extraction_and_build_response(
        session,
        workspace,
        entity,
        episode,
        dry_run=body.dry_run,
        queue_on_error=body.queue_on_error,
        response=response,
    )


# ──────────────────────────────────────────────
# 2. Multimodal File Upload Ingestion (Images, Screenshots, GIF, PDF, DOCX, TXT)
# ──────────────────────────────────────────────

@router.post("/upload", response_model=IngestResponse)
async def ingest_upload(
    response: Response,
    files: list[UploadFile] = File(default=[]),
    content: str = Form(default=""),
    entity_id: Optional[int] = Form(default=None),
    external_id: Optional[str] = Form(default=None),
    entity_name: str = Form(default=""),
    source_type: str = Form(default="note"),
    source_description: str = Form(default=""),
    idempotency_key: Optional[str] = Form(default=None),
    auto_create_entity: bool = Form(default=True),
    mode: str = Form(default="async"),
    dry_run: bool = Form(default=False),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """
    Multimodal ingestion endpoint supporting PNG, JPEG, WEBP, GIF, PDF (native + scanned),
    DOCX, TXT, MD, CSV, and JSON alongside optional accompanying text.

    Transcript-first architecture:
      1. Saves original files to persistent storage (UPLOAD_DIR) if STORE_UPLOADED_MEDIA=true.
      2. Transcribes each attachment into verbatim grounded text inside Episode.content.
      3. Runs standard ClueState extraction, Smart Judge, and `[char_start:char_end]` verification.

    Defaults to `mode="async"` (returns 202 with `job_id`) so large images/PDFs never block callers.
    """
    clean_mode = (mode or "async").strip().lower()
    if clean_mode not in ("sync", "async"):
        raise HTTPException(status_code=400, detail="mode must be 'sync' or 'async'")
    if dry_run:
        clean_mode = "sync"

    if not files and not content.strip():
        raise HTTPException(status_code=400, detail="Provide at least one file or text content.")

    if idempotency_key and not dry_run:
        existing_ep_res = await session.execute(
            select(Episode).where(
                Episode.workspace_id == workspace.id,
                Episode.idempotency_key == idempotency_key,
            )
        )
        existing_ep = existing_ep_res.scalars().first()
        if existing_ep:
            return await _build_idempotent_replay_response(session, workspace, existing_ep)

    settings = get_settings()
    if workspace.id is not None:
        _check_workspace_rate_limit(workspace.id, settings.rate_limit_ingest_per_min)
        if not dry_run:
            await _check_workspace_monthly_quota(
                session, workspace.id, settings.max_ingests_per_workspace_month
            )

    # Read and validate uploaded files up front
    parsed_files: list[tuple[str, str, bytes]] = []
    for up in files:
        fname = up.filename or "upload"
        raw = await up.read()
        try:
            mime = normalize_mime_type(fname, up.content_type)
        except MediaError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        parsed_files.append((fname, mime, raw))

    entity = await _resolve_or_create_entity(
        session,
        workspace,
        entity_id=entity_id,
        external_id=external_id,
        entity_name=entity_name,
        auto_create_entity=auto_create_entity,
    )

    clean_source_type = normalize_source_type(source_type)
    if not dry_run:
        await ensure_workspace_source_type(workspace, clean_source_type, session)

    now = datetime.now(timezone.utc)
    stored_paths_created: list[str] = []

    try:
        # Persist files to disk (if enabled & not dry_run)
        saved_meta: list[tuple[str, str, bytes, str, Optional[str]]] = []
        for fname, mime, raw in parsed_files:
            if dry_run:
                import hashlib
                sha = hashlib.sha256(raw).hexdigest()
                rel_path = None
            else:
                sha, rel_path = save_upload_bytes(workspace.id or 1, fname, mime, raw)
                if rel_path:
                    stored_paths_created.append(rel_path)
            saved_meta.append((fname, mime, raw, sha, rel_path))

        # In async mode (when files are persisted on disk), defer Vision/PDF transcription to the worker
        # so the HTTP response returns in < 30ms. If STORE_UPLOADED_MEDIA=false or sync mode, transcribe inline.
        must_transcribe_inline = (clean_mode == "sync") or (not settings.store_uploaded_media)
        transcript_pairs: list[tuple[str, str]] = []
        extracted_by_idx: dict[int, str] = {}

        if must_transcribe_inline:
            for idx, (fname, mime, raw, _, _) in enumerate(saved_meta):
                extracted = await extract_text_from_file(raw, mime, fname)
                extracted_by_idx[idx] = extracted
                transcript_pairs.append((fname, extracted))
            final_content = compose_episode_content(content, transcript_pairs)
        else:
            final_content = content.strip() or f"[Queued multimodal upload: {', '.join(f for f, _, _, _, _ in saved_meta)}]"

        desc = source_description.strip()
        if not desc and parsed_files:
            desc = f"Uploaded {', '.join(f for f, _, _ in parsed_files[:3])}"

        ep_meta: dict = {"_raw_user_text": content.strip()} if content.strip() else {}
        episode = Episode(
            workspace_id=workspace.id,
            entity_id=entity.id,
            source_type=clean_source_type,
            idempotency_key=None if dry_run else idempotency_key,
            content=final_content,
            content_hash=compute_content_hash(final_content),
            source_description=desc,
            meta=ep_meta,
            occurred_at=now,
            created_at=now,
        )
        session.add(episode)
        await session.flush()

        att_reads: list[AttachmentRead] = []
        for idx, (fname, mime, raw, sha, rel_path) in enumerate(saved_meta):
            att = EpisodeAttachment(
                workspace_id=workspace.id,
                episode_id=episode.id,
                filename=fname,
                mime_type=mime,
                size_bytes=len(raw),
                sha256=sha,
                storage_path=rel_path,
                extracted_text=extracted_by_idx.get(idx, ""),
                created_at=now,
            )
            session.add(att)
            await session.flush()
            att_reads.append(to_attachment_read(att))

        if clean_mode == "async":
            job = IngestJob(
                workspace_id=workspace.id,
                entity_id=entity.id,
                episode_id=episode.id,
                status="queued",
                attempts=0,
                max_attempts=settings.ingest_job_max_attempts,
                next_run_at=now,
                created_at=now,
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)
            response.status_code = 202
            return IngestResponse(
                episode_id=episode.id or 0,
                entity_id=entity.id or 0,
                memories_extracted=0,
                memories_updated=0,
                memories_new=0,
                idempotent_replay=False,
                dry_run=False,
                job_id=job.id,
                job_status=job.status,
                judge_applied=False,
                judge_rejected=[],
                state={},
                memories=[],
            )

        return await _run_sync_extraction_and_build_response(
            session,
            workspace,
            entity,
            episode,
            dry_run=dry_run,
            queue_on_error=True,
            response=response,
            ep_attachments=att_reads,
        )
    except MediaError as exc:
        await session.rollback()
        for p in stored_paths_created:
            delete_upload_file(p)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        for p in stored_paths_created:
            delete_upload_file(p)
        raise
    except Exception as exc:
        await session.rollback()
        for p in stored_paths_created:
            delete_upload_file(p)
        raise HTTPException(status_code=500, detail=f"Multimodal ingest failed: {exc}") from exc


# ──────────────────────────────────────────────
# 3. Durable Async Queue Jobs Inspection & Retry
# ──────────────────────────────────────────────

@router.get("/jobs", response_model=list[IngestJobRead])
async def list_ingest_jobs(
    status: Optional[str] = Query(None, description="Filter by status: queued, processing, completed, failed"),
    limit: int = Query(50, ge=1, le=200),
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """List durable async ingestion jobs in the active workspace."""
    query = (
        select(IngestJob, Entity.name, Entity.external_id)
        .join(Entity, IngestJob.entity_id == Entity.id)
        .where(IngestJob.workspace_id == workspace.id)
        .order_by(IngestJob.created_at.desc())
        .limit(limit)
    )
    if status:
        query = query.where(IngestJob.status == status.strip().lower())
    res = await session.execute(query)
    return [
        IngestJobRead(
            **job.model_dump(),
            entity_name=ent_name,
            entity_external_id=ent_ext_id,
        )
        for job, ent_name, ent_ext_id in res.all()
    ]


@router.get("/jobs/{job_id}", response_model=IngestJobRead)
async def get_ingest_job(
    job_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Poll status and results of a specific async ingest job."""
    job = await session.get(IngestJob, job_id)
    if not job or job.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Ingest job not found")
    ent = await session.get(Entity, job.entity_id)
    return IngestJobRead(
        **job.model_dump(),
        entity_name=ent.name if ent else None,
        entity_external_id=ent.external_id if ent else None,
    )


@router.post("/jobs/{job_id}/retry", response_model=IngestJobRead)
async def retry_ingest_job(
    job_id: int,
    workspace: Workspace = Depends(get_current_workspace),
    session: AsyncSession = Depends(get_session),
):
    """Immediately re-queue a failed or delayed ingest job."""
    job = await session.get(IngestJob, job_id)
    if not job or job.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Ingest job not found")

    now = datetime.now(timezone.utc)
    job.status = "queued"
    job.attempts = 0
    job.next_run_at = now
    job.last_error = None
    job.completed_at = None
    session.add(job)
    await session.commit()
    await session.refresh(job)

    ent = await session.get(Entity, job.entity_id)
    return IngestJobRead(
        **job.model_dump(),
        entity_name=ent.name if ent else None,
        entity_external_id=ent.external_id if ent else None,
    )
