"""Add Track.color (per-track hex color, set at creation time) and
User.randomize_track_colors (opt-in toggle, same swatch set as POI colors).

Revision ID: 0020
Revises: 0019
Create Date: 2026-08-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0020'
down_revision = '0019'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tracks', sa.Column('color', sa.String(length=7), nullable=True))
    op.add_column('users', sa.Column('randomize_track_colors', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('users', 'randomize_track_colors')
    op.drop_column('tracks', 'color')
