"""Add Track.status / Track.error_detail so failed/incomplete processing is
tracked explicitly instead of being encoded as a "__error: ..." sentinel
inside the regions array (or, for hard worker crashes, not tracked at all —
see M1 in the security audit backlog).

Backfill: rows whose regions array already carries the "__error:" sentinel
become status='error' with the message moved into error_detail (and the
sentinel stripped out of regions); every other existing row is assumed to
have finished processing successfully, since raw_points is only ever
populated on success.

Revision ID: 0017
Revises: 0016
Create Date: 2026-08-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tracks', sa.Column('status', sa.String(20), nullable=False, server_default='done'))
    op.add_column('tracks', sa.Column('error_detail', sa.Text(), nullable=True))
    op.create_index('ix_tracks_status', 'tracks', ['status'])

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, regions FROM tracks WHERE regions IS NOT NULL")).fetchall()
    for track_id, regions in rows:
        if not regions:
            continue
        sentinel = next((r for r in regions if r.startswith("__error: ")), None)
        if sentinel is None:
            continue
        detail = sentinel[len("__error: "):]
        cleaned = [r for r in regions if r != sentinel]
        conn.execute(
            sa.text(
                "UPDATE tracks SET status = 'error', error_detail = :detail, regions = :regions WHERE id = :id"
            ),
            {"detail": detail, "regions": cleaned, "id": track_id},
        )

    op.alter_column('tracks', 'status', server_default=None)


def downgrade():
    op.drop_index('ix_tracks_status', table_name='tracks')
    op.drop_column('tracks', 'error_detail')
    op.drop_column('tracks', 'status')
