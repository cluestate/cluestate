"""Initial ClueState platform & entity-state schema.

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-10-31
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlmodel import SQLModel

from cluestate import models  # noqa: F401 — ensure all tables are registered

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all initial ClueState tables safely and ensure enum values exist on PostgreSQL."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        inspector = sa.inspect(bind)
        if "memories" in inspector.get_table_names():
            op.execute(sa.text("ALTER TYPE memorystatus ADD VALUE IF NOT EXISTS 'PENDING_REVIEW'"))
            op.execute(sa.text("ALTER TYPE memorystatus ADD VALUE IF NOT EXISTS 'pending_review'"))
    SQLModel.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    """Drop ClueState tables in reverse dependency order."""
    bind = op.get_bind()
    for table_name in ("evidence", "memories", "episodes", "topics", "entities", "api_keys", "workspaces", "users"):
        inspector = sa.inspect(bind)
        if table_name in inspector.get_table_names():
            op.drop_table(table_name)
