"""Preserve ordered Nimi model output independently of chat display text."""

from alembic import op
import sqlalchemy as sa

revision = "f1e3d5c7b9a0"
down_revision = "026c0ba8b35c"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if "chat_history_messages" in inspector.get_table_names() and "nimi_output_items" not in {column["name"] for column in inspector.get_columns("chat_history_messages")}:
        op.add_column("chat_history_messages", sa.Column("nimi_output_items", sa.JSON(), nullable=True))


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if "chat_history_messages" in inspector.get_table_names() and "nimi_output_items" in {column["name"] for column in inspector.get_columns("chat_history_messages")}:
        op.drop_column("chat_history_messages", "nimi_output_items")
