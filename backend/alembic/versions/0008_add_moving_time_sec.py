"""Add moving_time_sec to tracks

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-11 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tracks", sa.Column("moving_time_sec", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("tracks", "moving_time_sec")
