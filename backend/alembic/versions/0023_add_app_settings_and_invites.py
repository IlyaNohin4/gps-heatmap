"""Add app_settings (singleton row, registration_enabled toggle) and
invite_tokens (admin-generated registration bypass links) — backs the
Administration Panel tab's registration toggle + invite link management.

Revision ID: 0023
Revises: 0022
Create Date: 2026-08-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0023'
down_revision = '0022'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'app_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('registration_enabled', sa.Boolean(), nullable=False, server_default='true'),
    )
    # Singleton row — every read/write targets id=1.
    op.execute("INSERT INTO app_settings (id, registration_enabled) VALUES (1, true)")

    op.create_table(
        'invite_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('token', sa.String(length=64), nullable=False, unique=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('use_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('revoked', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.create_index('ix_invite_tokens_token', 'invite_tokens', ['token'])


def downgrade():
    op.drop_index('ix_invite_tokens_token', table_name='invite_tokens')
    op.drop_table('invite_tokens')
    op.drop_table('app_settings')
