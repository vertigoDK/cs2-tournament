"""site settings (game server address)

Revision ID: f7a8settings
Revises: e6f7tlobby
Create Date: 2026-11-02 23:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = 'f7a8settings'
down_revision = 'e6f7tlobby'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'settings',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint('key'),
    )


def downgrade() -> None:
    op.drop_table('settings')
