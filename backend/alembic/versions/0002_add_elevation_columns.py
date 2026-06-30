"""Add elevation_gain and elevation_loss columns to tracks

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("elevation_gain", sa.Float(), nullable=True))
    op.add_column("tracks", sa.Column("elevation_loss", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("tracks", "elevation_loss")
    op.drop_column("tracks", "elevation_gain")
