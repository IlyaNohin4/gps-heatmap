"""Add icon and color columns to POI table.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('poi', sa.Column('icon', sa.String(50), nullable=True))
    op.add_column('poi', sa.Column('color', sa.String(20), nullable=True))


def downgrade():
    op.drop_column('poi', 'color')
    op.drop_column('poi', 'icon')
