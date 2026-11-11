"""users.banned

Revision ID: a1b2banned
Revises: f7a8settings
Create Date: 2026-11-12 12:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = 'a1b2banned'
down_revision = 'f7a8settings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('banned', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('users', 'banned')
