"""Add Track.processing_started_at so the stuck-processing reaper in
list_tracks() can tell a track that's genuinely still queued (behind other
sequential uploads) apart from one whose worker died mid-task — previously
both cases were measured from uploaded_at with a single 2h timeout, which
could falsely reap a track that was simply still waiting in a long queue
(see security audit backlog, M1-followup).

Revision ID: 0018
Revises: 0017
Create Date: 2026-08-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0018'
down_revision = '0017'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tracks', sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('tracks', 'processing_started_at')
