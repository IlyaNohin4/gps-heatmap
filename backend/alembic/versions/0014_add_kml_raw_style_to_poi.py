"""Add raw KML style/altitude columns to POI table for round-trip export fidelity.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('poi', sa.Column('kml_icon_href', sa.String(500), nullable=True))
    op.add_column('poi', sa.Column('kml_style_color', sa.String(8), nullable=True))
    op.add_column('poi', sa.Column('kml_altitude', sa.Float(), nullable=True))


def downgrade():
    op.drop_column('poi', 'kml_altitude')
    op.drop_column('poi', 'kml_style_color')
    op.drop_column('poi', 'kml_icon_href')
