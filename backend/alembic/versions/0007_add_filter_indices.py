"""Add indices for filters and sorting on tracks and poi

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    # Indices for tracks filtering and sorting
    op.create_index("ix_tracks_recorded_at", "tracks", ["recorded_at"])
    op.create_index("ix_tracks_uploaded_at", "tracks", ["uploaded_at"])
    op.create_index("ix_tracks_speed_avg", "tracks", ["speed_avg"])
    op.create_index("ix_tracks_distance_km", "tracks", ["distance_km"])
    op.create_index("ix_tracks_file_format", "tracks", ["file_format"])

    # Index for poi name search
    op.create_index("ix_poi_name", "poi", ["name"])


def downgrade():
    op.drop_index("ix_poi_name", table_name="poi")

    op.drop_index("ix_tracks_file_format", table_name="tracks")
    op.drop_index("ix_tracks_distance_km", table_name="tracks")
    op.drop_index("ix_tracks_speed_avg", table_name="tracks")
    op.drop_index("ix_tracks_uploaded_at", table_name="tracks")
    op.drop_index("ix_tracks_recorded_at", table_name="tracks")
