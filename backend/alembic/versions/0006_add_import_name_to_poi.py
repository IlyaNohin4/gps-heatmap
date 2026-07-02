"""Add import_name column to POI table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-02 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('poi', sa.Column('import_name', sa.String(255), nullable=True))
    op.create_index('ix_poi_user_import', 'poi', ['user_id', 'import_name'])


def downgrade():
    op.drop_index('ix_poi_user_import', table_name='poi')
    op.drop_column('poi', 'import_name')
