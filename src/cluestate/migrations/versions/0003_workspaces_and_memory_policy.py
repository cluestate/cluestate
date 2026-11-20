"""Add workspace_members, workspace_invites, workspace extraction_policy, and rich Topic schema fields.

Revision ID: 0003_workspaces_and_memory_policy
Revises: 0002_flexible_source_types
Create Date: 2026-11-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlmodel import SQLModel

from cluestate import models  # noqa: F401 — ensure all tables are registered

revision: str = "0003_workspaces_and_memory_policy"
down_revision: Union[str, None] = "0002_flexible_source_types"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # Create any newly added tables (workspace_members, workspace_invites)
    SQLModel.metadata.create_all(bind=bind, checkfirst=True)

    # 1. Add extraction_policy JSON column to workspaces if missing
    if "workspaces" in tables:
        ws_cols = {c["name"] for c in inspector.get_columns("workspaces")}
        if "extraction_policy" not in ws_cols:
            op.add_column(
                "workspaces",
                sa.Column(
                    "extraction_policy",
                    sa.JSON(),
                    nullable=False,
                    server_default='{"discovery_mode": "guided", "discovery_instructions": "", "discovery_review_policy": "active", "discovery_allow_inferred": true, "discovery_max_per_episode": 5}',
                ),
            )

    # 2. Add new Topic columns if missing
    if "topics" in tables:
        topic_cols = {c["name"] for c in inspector.get_columns("topics")}
        new_topic_columns = [
            ("label", sa.Column("label", sa.String(255), nullable=False, server_default="")),
            ("extraction_instructions", sa.Column("extraction_instructions", sa.Text(), nullable=False, server_default="")),
            ("examples", sa.Column("examples", sa.JSON(), nullable=False, server_default="[]")),
            ("ttl_days", sa.Column("ttl_days", sa.Integer(), nullable=True)),
            ("allow_custom_values", sa.Column("allow_custom_values", sa.Boolean(), nullable=False, server_default=sa.text("false"))),
            ("allow_inferred", sa.Column("allow_inferred", sa.Boolean(), nullable=False, server_default=sa.text("true"))),
            ("min_confidence", sa.Column("min_confidence", sa.Float(), nullable=False, server_default="0.0")),
            ("constraints", sa.Column("constraints", sa.JSON(), nullable=False, server_default="{}")),
            ("applies_to_entity_types", sa.Column("applies_to_entity_types", sa.JSON(), nullable=False, server_default="[]")),
        ]
        for col_name, col_def in new_topic_columns:
            if col_name not in topic_cols:
                op.add_column("topics", col_def)

    # 3. Backfill workspace_members for any existing workspace owners
    inspector = sa.inspect(bind)
    if "workspaces" in inspector.get_table_names() and "workspace_members" in inspector.get_table_names():
        rows = bind.execute(
            sa.text("SELECT id, owner_id, created_at FROM workspaces WHERE owner_id IS NOT NULL")
        ).fetchall()
        for ws_id, owner_id, created_at in rows:
            exists = bind.execute(
                sa.text(
                    "SELECT id FROM workspace_members WHERE workspace_id = :wid AND user_id = :uid"
                ),
                {"wid": ws_id, "uid": owner_id},
            ).fetchone()
            if not exists:
                bind.execute(
                    sa.text(
                        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) "
                        "VALUES (:wid, :uid, 'OWNER', COALESCE(:joined_at, CURRENT_TIMESTAMP))"
                    ),
                    {"wid": ws_id, "uid": owner_id, "joined_at": created_at},
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if "workspace_invites" in tables:
        op.drop_table("workspace_invites")
    if "workspace_members" in tables:
        op.drop_table("workspace_members")
