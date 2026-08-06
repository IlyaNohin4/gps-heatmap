"""Add User.toast_position — which screen corner toast notifications stack
in. Was frontend-only localStorage state; moved server-side along with the
rest of the display prefs so it survives across devices without relying on
any local persistence.

Revision ID: 0021
Revises: 0020
Create Date: 2026-08-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0021'
down_revision = '0020'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('toast_position', sa.String(length=12), nullable=False, server_default='top-right'))


def downgrade():
    op.drop_column('users', 'toast_position')
