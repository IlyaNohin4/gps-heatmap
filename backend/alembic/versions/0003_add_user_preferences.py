"""Add user preference columns (language, theme, unit_distance, unit_speed)

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("language", sa.String(8), nullable=False, server_default="en"))
    op.add_column("users", sa.Column("theme", sa.String(10), nullable=False, server_default="light"))
    op.add_column("users", sa.Column("unit_distance", sa.String(4), nullable=False, server_default="km"))
    op.add_column("users", sa.Column("unit_speed", sa.String(8), nullable=False, server_default="kmh"))


def downgrade() -> None:
    op.drop_column("users", "unit_speed")
    op.drop_column("users", "unit_distance")
    op.drop_column("users", "theme")
    op.drop_column("users", "language")
