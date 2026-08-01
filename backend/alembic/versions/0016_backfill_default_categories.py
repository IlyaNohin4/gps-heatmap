"""Backfill the 9 suggested default categories for all existing users.

New users get this at registration time (see api/auth.py); this migration
covers accounts created before that change, and existing accounts that
already have some real categories (which stay as-is — this only adds the
suggested ones that aren't already present).

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None

DEFAULT_CATEGORIES = [
    'Food', 'Medical', 'Transport', 'Accommodation', 'Tourism',
    'Amenities', 'Bicycle', 'Public Transport', 'Other',
]


def upgrade():
    conn = op.get_bind()
    user_ids = [row[0] for row in conn.execute(sa.text("SELECT id FROM users")).fetchall()]
    for user_id in user_ids:
        for name in DEFAULT_CATEGORIES:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO poi_categories (user_id, name, created_at)
                    SELECT :user_id, :name, now()
                    WHERE NOT EXISTS (
                        SELECT 1 FROM poi_categories WHERE user_id = :user_id AND name = :name
                    )
                    """
                ),
                {"user_id": user_id, "name": name},
            )


def downgrade():
    conn = op.get_bind()
    for name in DEFAULT_CATEGORIES:
        conn.execute(sa.text("DELETE FROM poi_categories WHERE name = :name"), {"name": name})
