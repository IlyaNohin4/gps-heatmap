"""Add User.notifications_enabled and User.show_start_end_markers so these
two settings persist per-user (synced across devices) like the existing
language/theme/unit prefs, instead of only living in frontend-local Zustand
state.

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0019'
down_revision = '0018'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('notifications_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('show_start_end_markers', sa.Boolean(), nullable=False, server_default='true'))


def downgrade():
    op.drop_column('users', 'show_start_end_markers')
    op.drop_column('users', 'notifications_enabled')
