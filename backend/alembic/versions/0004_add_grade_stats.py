"""Add grade_stats column to tracks table.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-02 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tracks', sa.Column('grade_stats', JSON, nullable=True))


def downgrade():
    op.drop_column('tracks', 'grade_stats')
