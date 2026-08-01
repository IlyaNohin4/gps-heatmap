"""Add poi_categories table; backfill from existing POI.category values.

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'poi_categories',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('user_id', 'name', name='uq_poi_categories_user_name'),
    )

    # Every distinct (user_id, category) already in use by a POI becomes a
    # registered category row, so existing categories keep appearing in the
    # picker/manager unchanged.
    op.execute(
        """
        INSERT INTO poi_categories (user_id, name, created_at)
        SELECT DISTINCT user_id, category, now()
        FROM poi
        WHERE category IS NOT NULL AND category <> ''
        """
    )


def downgrade():
    op.drop_table('poi_categories')
