"""Add User.is_admin — gates the TopIsland Administration Panel tab
(currently a stub) to a small set of users. Defaults false for everyone;
must be flipped manually in the DB, there's no self-serve promotion path.

Revision ID: 0022
Revises: 0021
Create Date: 2026-08-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0022'
down_revision = '0021'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('users', 'is_admin')
