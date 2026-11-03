"""Add dynamic source_types to workspaces and ensure flexible episodes.source_type.

Revision ID: 0002_flexible_source_types
Revises: 0001_initial_schema
Create Date: 2026-11-03
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_flexible_source_types"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Add source_types JSON column to workspaces if missing
    if "workspaces" in tables:
        columns = [c["name"] for c in inspector.get_columns("workspaces")]
        if "source_types" not in columns:
            op.add_column(
                "workspaces",
                sa.Column(
                    "source_types",
                    sa.JSON(),
                    nullable=False,
                    server_default='["conversation", "note", "interaction", "custom"]',
                ),
            )

    # 2. In PostgreSQL, convert episodes.source_type to VARCHAR(50) if it was an Enum
    if bind.dialect.name == "postgresql" and "episodes" in tables:
        op.execute(sa.text("ALTER TABLE episodes ALTER COLUMN source_type TYPE VARCHAR(50) USING source_type::text"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "workspaces" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("workspaces")]
        if "source_types" in columns:
            op.drop_column("workspaces", "source_types")

