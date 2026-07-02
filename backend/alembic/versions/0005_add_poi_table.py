"""Add poi table for user-uploaded POI.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-02 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'poi',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lon', sa.Float(), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('source', sa.String(50), nullable=True, server_default='uploaded'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('lat >= -90 AND lat <= 90'),
        sa.CheckConstraint('lon >= -180 AND lon <= 180'),
    )
    op.create_index('ix_poi_user_id', 'poi', ['user_id'])
    op.create_index('ix_poi_category', 'poi', ['category'])


def downgrade():
    op.drop_index('ix_poi_category', table_name='poi')
    op.drop_index('ix_poi_user_id', table_name='poi')
    op.drop_table('poi')
