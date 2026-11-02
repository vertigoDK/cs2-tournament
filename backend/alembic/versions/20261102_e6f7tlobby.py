"""tournament lobbies

Revision ID: e6f7tlobby
Revises: d4e5lobbystats
Create Date: 2026-11-02 23:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = 'e6f7tlobby'
down_revision = 'd4e5lobbystats'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('lobbies') as b:
        b.add_column(sa.Column('tournament_id', sa.Integer(), nullable=True))
        b.add_column(sa.Column('kind', sa.String(length=16), nullable=True))
        b.add_column(sa.Column('ref', sa.JSON(), nullable=True))
        b.add_column(sa.Column('label', sa.String(length=120), nullable=False, server_default=''))
        b.create_foreign_key('fk_lobbies_tournament', 'tournaments', ['tournament_id'], ['id'], ondelete='CASCADE')
        b.create_index('ix_lobbies_tournament_id', ['tournament_id'])


def downgrade() -> None:
    with op.batch_alter_table('lobbies') as b:
        b.drop_index('ix_lobbies_tournament_id')
        b.drop_constraint('fk_lobbies_tournament', type_='foreignkey')
        b.drop_column('label')
        b.drop_column('ref')
        b.drop_column('kind')
        b.drop_column('tournament_id')
