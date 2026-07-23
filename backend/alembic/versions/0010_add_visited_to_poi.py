"""Add visited column to POI table.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('poi', sa.Column('visited', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('poi', 'visited')
