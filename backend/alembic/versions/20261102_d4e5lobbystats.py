"""lobby kills/deaths/assists

Revision ID: d4e5lobbystats
Revises: c9d2lobby
Create Date: 2026-11-02 22:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = 'd4e5lobbystats'
down_revision = 'c9d2lobby'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('lobbies', sa.Column('stats', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('lobbies', 'stats')
