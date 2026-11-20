"""Tests for multimodal uploads (PNG, GIF, PDF, DOCX), persistent storage, DB-backed async queue & retries, and Migration 0005."""

from __future__ import annotations

import io
import os
import zipfile
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.ext.asyncio import AsyncSession

from cluestate.config import Settings
from cluestate.database import _upgrade_with_connection
from cluestate.engine import ExtractedClaim, ExtractionError, ExtractionResult
from cluestate.models import ClaimOperation, ClaimType, EpisodeAttachment, IngestJob
from cluestate.worker import execute_ingest_job

# Minimal valid 1x1 GIF89a bytes
MINI_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!"
    b"\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)


def _make_sample_docx(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>"
        )
        zf.writestr("word/document.xml", xml)
    return buf.getvalue()


def _make_sample_pdf(text: str) -> bytes:
    """Create a valid minimal single-page PDF containing selectable ASCII text."""
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
    objs = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
        f"4 0 obj << /Length {len(stream)} >> stream\n".encode("ascii") + stream + b"\nendstream endobj\n",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for off in offsets:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
    out.extend(
        f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii")
    )
    return bytes(out)


@pytest.mark.asyncio
async def test_async_ingest_queue_and_worker_execution_with_retry(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await client.post(
        "/api/topics",
        json={
            "name": "is_vegan",
            "data_type": "boolean",
            "cardinality": "single",
            "update_policy": "replace",
        },
    )

    # 1. Enqueue async ingest -> returns 202 Accepted immediately without LLM call
    res = await client.post(
        "/api/ingest",
        json={
            "external_id": "async_user_1",
            "entity_name": "Async Clara",
            "content": "Patient explicitly confirmed she follows a vegan diet.",
            "source_type": "note",
            "mode": "async",
        },
    )
    assert res.status_code == 202
    body = res.json()
    assert body["job_id"] is not None
    assert body["job_status"] == "queued"
    job_id = body["job_id"]

    # 2. First worker attempt fails transiently -> job stays queued for backoff retry
    job = await db_session.get(IngestJob, job_id)
    assert job is not None
    with patch(
        "cluestate.worker.extract_memories_from_text",
        new=AsyncMock(side_effect=ExtractionError("Simulated 429 rate limit")),
    ):
        updated_job = await execute_ingest_job(db_session, job)
        assert updated_job.status == "queued"
        assert updated_job.attempts == 1
        assert "429" in (updated_job.last_error or "")

    # 3. Manual retry endpoint resets attempts & queues immediately
    retry_res = await client.post(f"/api/ingest/jobs/{job_id}/retry")
    assert retry_res.status_code == 200
    assert retry_res.json()["status"] == "queued"
    assert retry_res.json()["attempts"] == 0

    # 4. Next worker execution succeeds -> completes job and persists verified memory
    mock_extraction = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Patient follows a vegan diet",
                topic_name="is_vegan",
                value="true",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.96,
                evidence_excerpt="she follows a vegan diet.",
            )
        ]
    )
    job = await db_session.get(IngestJob, job_id)
    with patch("cluestate.worker.extract_memories_from_text", new=AsyncMock(return_value=mock_extraction)):
        done_job = await execute_ingest_job(db_session, job)
        assert done_job.status == "completed"
        assert done_job.result_summary["memories_extracted"] == 1

    # 5. Poll job via API & verify compiled state
    poll_res = await client.get(f"/api/ingest/jobs/{job_id}")
    assert poll_res.status_code == 200
    assert poll_res.json()["status"] == "completed"

    intel_res = await client.get("/api/intel/by-external-id/async_user_1")
    assert intel_res.status_code == 200
    assert intel_res.json()["state"]["is_vegan"] is True


@pytest.mark.asyncio
async def test_sync_ingest_queue_on_error_fallback(client: AsyncClient):
    with patch(
        "cluestate.api.ingest.extract_memories_from_text",
        new=AsyncMock(side_effect=ExtractionError("OpenAI timeout")),
    ):
        res = await client.post(
            "/api/ingest",
            json={
                "external_id": "fallback_user",
                "content": "Important customer note",
                "mode": "sync",
                "queue_on_error": True,
            },
        )
        assert res.status_code == 202
        body = res.json()
        assert body["job_id"] is not None
        assert body["job_status"] == "queued"


@pytest.mark.asyncio
async def test_multimodal_upload_gif_pdf_docx_and_attachment_serving(
    client: AsyncClient,
    db_session: AsyncSession,
    tmp_path,
):
    upload_dir = tmp_path / "uploads"
    custom_settings = Settings(
        upload_dir=str(upload_dir),
        store_uploaded_media=True,
        max_upload_size_mb=10,
    )

    await client.post(
        "/api/topics",
        json={
            "name": "known_allergies",
            "data_type": "list",
            "cardinality": "multiple",
            "update_policy": "append",
        },
    )

    pdf_bytes = _make_sample_pdf("Patient lab note: documented allergy to penicillin.")
    docx_bytes = _make_sample_docx("Follow-up note: prefers SMS appointment alerts.")

    mock_extraction = ExtractionResult(
        claims=[
            ExtractedClaim(
                claim="Documented allergy to penicillin",
                topic_name="known_allergies",
                value="penicillin",
                claim_type=ClaimType.EXPLICIT,
                operation=ClaimOperation.ADD,
                confidence=0.97,
                evidence_excerpt="documented allergy to penicillin.",
            )
        ]
    )

    with (
        patch("cluestate.media.get_settings", return_value=custom_settings),
        patch("cluestate.api.ingest.get_settings", return_value=custom_settings),
        patch(
            "cluestate.media.transcribe_image_bytes",
            new=AsyncMock(return_value="Screenshot chat: Please mark penicillin allergy on my chart."),
        ),
        patch("cluestate.api.ingest.extract_memories_from_text", new=AsyncMock(return_value=mock_extraction)),
    ):
        # Upload GIF + PDF + DOCX synchronously to test full grounded transcript-first pipeline
        res = await client.post(
            "/api/ingest/upload",
            data={
                "external_id": "patient_media_1",
                "entity_name": "Media Patient",
                "source_type": "intake_scan",
                "mode": "sync",
                "content": "Front desk upload",
            },
            files=[
                ("files", ("chat_clip.gif", MINI_GIF, "image/gif")),
                ("files", ("lab_report.pdf", pdf_bytes, "application/pdf")),
                (
                    "files",
                    (
                        "followup.docx",
                        docx_bytes,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ),
                ),
            ],
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["memories_extracted"] == 1
        assert body["state"]["known_allergies"] == ["penicillin"]
        mem = body["memories"][0]
        assert mem["evidence"][0]["is_verified"] is True
        atts = mem["evidence"][0]["episode_attachments"]
        assert len(atts) == 3
        assert {a["mime_type"] for a in atts} == {
            "image/gif",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }

        # Verify persisted GIF can be downloaded securely through authenticated endpoint
        gif_att = next(a for a in atts if a["mime_type"] == "image/gif")
        dl_res = await client.get(gif_att["download_url"])
        assert dl_res.status_code == 200
        assert dl_res.content == MINI_GIF

        # Verify episode content contains all 3 grounded attachment transcripts
        ep_res = await client.get(f"/api/entities/{body['entity_id']}/episodes")
        assert ep_res.status_code == 200
        ep_content = ep_res.json()[0]["content"]
        assert "[ATTACHMENT: chat_clip.gif]" in ep_content
        assert "[ATTACHMENT: lab_report.pdf]" in ep_content
        assert "[ATTACHMENT: followup.docx]" in ep_content
        assert "prefers SMS appointment alerts." in ep_content

        # Delete episode -> persisted files on disk are cleaned up
        att_row = await db_session.get(EpisodeAttachment, gif_att["id"])
        disk_path = upload_dir / att_row.storage_path
        assert disk_path.exists()

        del_res = await client.delete(f"/api/episodes/{body['episode_id']}")
        assert del_res.status_code == 204
        assert not disk_path.exists()


def test_alembic_0005_creates_attachments_and_jobs(tmp_path):
    db_file = tmp_path / "mig_0005.db"
    sync_engine = create_engine(f"sqlite:///{db_file}")
    try:
        with sync_engine.begin() as conn:
            _upgrade_with_connection(conn)
            tables = set(inspect(conn).get_table_names())
            assert "episode_attachments" in tables
            assert "ingest_jobs" in tables
    finally:
        sync_engine.dispose()
        if db_file.exists():
            os.remove(db_file)
