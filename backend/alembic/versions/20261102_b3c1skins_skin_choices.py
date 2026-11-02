"""skin choices and loadouts

Revision ID: b3c1skins
Revises: a7f4f93bbb4d
Create Date: 2026-11-02 18:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = 'b3c1skins'
down_revision = 'a7f4f93bbb4d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'skin_choices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('defindex', sa.Integer(), nullable=False),
        sa.Column('paint', sa.Integer(), nullable=False),
        sa.Column('wear', sa.Float(), nullable=False),
        sa.Column('seed', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'defindex'),
    )
    op.create_index(op.f('ix_skin_choices_user_id'), 'skin_choices', ['user_id'], unique=False)
    op.create_table(
        'loadouts',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('knife', sa.String(length=64), nullable=True),
        sa.Column('knife_defindex', sa.Integer(), nullable=True),
        sa.Column('glove_defindex', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('loadouts')
    op.drop_index(op.f('ix_skin_choices_user_id'), table_name='skin_choices')
    op.drop_table('skin_choices')
