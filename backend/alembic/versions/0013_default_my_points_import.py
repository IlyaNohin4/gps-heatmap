"""Backfill a default "My Points" list for existing users with zero imports.

New users get this at registration time (see api/auth.py); this migration
covers accounts created before that change.

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-31 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        INSERT INTO poi_imports (user_id, name, created_at)
        SELECT id, 'My Points', now()
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM poi_imports pi WHERE pi.user_id = u.id
        )
        """
    )


def downgrade():
    op.execute("DELETE FROM poi_imports WHERE name = 'My Points'")
