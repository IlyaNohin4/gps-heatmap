"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-29
"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "password_resets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(128), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_resets_id", "password_resets", ["id"])
    op.create_index("ix_password_resets_token", "password_resets", ["token"], unique=True)

    op.create_table(
        "tracks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("file_format", sa.String(10), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("speed_avg", sa.Float(), nullable=True),
        sa.Column("speed_max", sa.Float(), nullable=True),
        sa.Column("speed_min", sa.Float(), nullable=True),
        sa.Column("regions", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("geom", geoalchemy2.types.Geometry("LINESTRING", srid=4326), nullable=True),
        sa.Column("raw_points", sa.JSON(), nullable=True),
        sa.Column("normalized_points", sa.JSON(), nullable=True),
        sa.Column("speed_segments", sa.JSON(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=True),
        sa.Column("public_token", sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_token"),
    )
    op.create_index("ix_tracks_id", "tracks", ["id"])
    op.create_index("ix_tracks_user_id", "tracks", ["user_id"])


def downgrade() -> None:
    op.drop_table("tracks")
    op.drop_table("password_resets")
    op.drop_table("users")
