"""Keep a failed outline visible without replaying paid generation on reload."""

from alembic import op
import sqlalchemy as sa

revision = "a2c4e6f8b0d1"
down_revision = "f1e3d5c7b9a0"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if "presentations" in inspector.get_table_names() and "outline_error" not in {column["name"] for column in inspector.get_columns("presentations")}:
        op.add_column("presentations", sa.Column("outline_error", sa.JSON(), nullable=True))


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if "presentations" in inspector.get_table_names() and "outline_error" in {column["name"] for column in inspector.get_columns("presentations")}:
        op.drop_column("presentations", "outline_error")
