"""lobbies on our own CS2 server

Revision ID: c9d2lobby
Revises: b3c1skins
Create Date: 2026-11-02 21:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = 'c9d2lobby'
down_revision = 'b3c1skins'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'lobbies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mode', sa.String(length=16), nullable=False),
        sa.Column('map', sa.String(length=40), nullable=False),
        sa.Column('server_address', sa.String(length=80), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('players', sa.JSON(), nullable=False),
        sa.Column('score', sa.JSON(), nullable=True),
        sa.Column('winner', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_lobbies_status'), 'lobbies', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_lobbies_status'), table_name='lobbies')
    op.drop_table('lobbies')
