"""Add episode_attachments and ingest_jobs tables for multimodal media and DB-backed async queue.

Revision ID: 0005_async_jobs_media
Revises: 0004_judge_notes
Create Date: 2026-11-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0005_async_jobs_media"
down_revision = "0004_judge_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "episode_attachments" not in tables:
        op.create_table(
            "episode_attachments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=False, server_default="1"),
            sa.Column("episode_id", sa.Integer(), sa.ForeignKey("episodes.id"), nullable=False),
            sa.Column("filename", sa.String(length=255), nullable=False),
            sa.Column("mime_type", sa.String(length=120), nullable=False, server_default="application/octet-stream"),
            sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("sha256", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("storage_path", sa.String(length=500), nullable=True),
            sa.Column("extracted_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_episode_attachments_workspace_id", "episode_attachments", ["workspace_id"])
        op.create_index("ix_episode_attachments_episode_id", "episode_attachments", ["episode_id"])
        op.create_index("ix_episode_attachments_sha256", "episode_attachments", ["sha256"])

    if "ingest_jobs" not in tables:
        op.create_table(
            "ingest_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=False, server_default="1"),
            sa.Column("entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=False),
            sa.Column("episode_id", sa.Integer(), sa.ForeignKey("episodes.id"), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="4"),
            sa.Column("next_run_at", sa.DateTime(), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("result_summary", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_ingest_jobs_workspace_id", "ingest_jobs", ["workspace_id"])
        op.create_index("ix_ingest_jobs_entity_id", "ingest_jobs", ["entity_id"])
        op.create_index("ix_ingest_jobs_episode_id", "ingest_jobs", ["episode_id"])
        op.create_index("ix_ingest_jobs_status", "ingest_jobs", ["status"])
        op.create_index("ix_ingest_jobs_next_run_at", "ingest_jobs", ["next_run_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "ingest_jobs" in tables:
        op.drop_table("ingest_jobs")
    if "episode_attachments" in tables:
        op.drop_table("episode_attachments")
