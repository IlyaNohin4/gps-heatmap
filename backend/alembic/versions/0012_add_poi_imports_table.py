"""Add poi_imports table; backfill from existing POI.import_name values.

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'poi_imports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('user_id', 'name', name='uq_poi_imports_user_name'),
    )

    # Every distinct (user_id, import_name) already in use by a POI becomes a
    # real list row, so existing KML-uploaded imports keep working unchanged.
    op.execute(
        """
        INSERT INTO poi_imports (user_id, name, created_at)
        SELECT DISTINCT user_id, import_name, now()
        FROM poi
        WHERE import_name IS NOT NULL AND import_name <> ''
        """
    )


def downgrade():
    op.drop_table('poi_imports')
