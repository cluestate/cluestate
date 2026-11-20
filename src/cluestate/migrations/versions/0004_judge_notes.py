"""Add judge_note column to memories for adversarial critic diagnostics.

Revision ID: 0004_judge_notes
Revises: 0003_workspaces_and_policy
Create Date: 2026-11-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0004_judge_notes"
down_revision = "0003_workspaces_and_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "memories" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("memories")}
        if "judge_note" not in existing_cols:
            op.add_column("memories", sa.Column("judge_note", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "memories" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("memories")}
        if "judge_note" in existing_cols:
            op.drop_column("memories", "judge_note")
