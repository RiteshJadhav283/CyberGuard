"""Customer accounts, cases and single-file local recovery plans."""
from alembic import op
import sqlalchemy as s

revision = "0001"
down_revision = None


def upgrade():
    op.create_table("users",
        s.Column("id", s.String, primary_key=True),
        s.Column("customer", s.String, nullable=False),
        s.Column("email", s.String, nullable=False, unique=True),
        s.Column("role", s.String, nullable=False),
        s.Column("password_hash", s.String, nullable=False))
    op.create_table("sessions",
        s.Column("digest", s.String, primary_key=True),
        s.Column("user_id", s.String, s.ForeignKey("users.id"), nullable=False),
        s.Column("expires", s.BigInteger, nullable=False))
    op.create_table("incidents",
        s.Column("id", s.String, primary_key=True),
        s.Column("customer", s.String, nullable=False, index=True),
        s.Column("title", s.String, nullable=False),
        s.Column("object_key", s.String, nullable=False),
        s.Column("observed", s.String, nullable=False),
        s.Column("candidate", s.String, nullable=False),
        s.Column("expected_hash", s.String, nullable=False))
    op.create_table("fixture_versions",
        s.Column("id", s.String, primary_key=True),
        s.Column("incident", s.String, s.ForeignKey("incidents.id"), nullable=False),
        s.Column("content", s.LargeBinary, nullable=False))
    op.create_table("plans",
        s.Column("id", s.String, primary_key=True),
        s.Column("incident", s.String, s.ForeignKey("incidents.id"), nullable=False),
        s.Column("source", s.String, nullable=False),
        s.Column("observed", s.String, nullable=False),
        s.Column("expected_hash", s.String, nullable=False),
        s.Column("destination", s.String, nullable=False, unique=True),
        s.Column("expires", s.BigInteger, nullable=False),
        s.Column("status", s.String, nullable=False),
        s.Column("approved_by", s.String, s.ForeignKey("users.id")),
        s.Column("approved_at", s.BigInteger))
    op.create_table("recovered",
        s.Column("plan", s.String, s.ForeignKey("plans.id"), primary_key=True),
        s.Column("content", s.LargeBinary, nullable=False))
    op.create_table("audit",
        s.Column("id", s.Integer, primary_key=True),
        s.Column("incident", s.String, s.ForeignKey("incidents.id"), nullable=False),
        s.Column("actor", s.String, nullable=False),
        s.Column("action", s.String, nullable=False),
        s.Column("plan", s.String),
        s.Column("at", s.BigInteger, nullable=False))


def downgrade():
    for name in ("audit", "recovered", "plans", "fixture_versions", "incidents", "sessions", "users"):
        op.drop_table(name)
