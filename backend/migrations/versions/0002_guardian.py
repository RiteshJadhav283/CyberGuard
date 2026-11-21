"""Customer connections, observed activity, cases, approvals and worker jobs."""
from alembic import op
import sqlalchemy as s

revision = "0002"
down_revision = "0001"


def col(name, kind=s.String, **kw):
    return s.Column(name, kind, nullable=False, **kw)


def upgrade():
    op.create_table("connections", col("id", primary_key=True), col("customer", index=True),
                    col("label"), col("mode"), col("config", s.Text), col("enabled", s.Boolean),
                    col("health"), col("checked_at", s.BigInteger))
    op.create_table("cloud_bindings", col("queue_arn", primary_key=True), col("external_id", unique=True),
                    col("connection", unique=True))
    op.create_table("activity", col("connection", primary_key=True), col("event_id", primary_key=True),
                    col("actor"), col("object_key"), col("operation"), col("at", s.BigInteger),
                    col("received", s.BigInteger), col("group_id", index=True),
                    col("copy_source"), col("entropy_jump",s.Boolean))
    op.create_table("cases", col("id", primary_key=True), col("connection", index=True),
                    col("actor"), col("score", s.Integer), col("evidence", s.Text), col("stage"),
                    col("first_at", s.BigInteger), col("last_at", s.BigInteger))
    op.create_table("case_log", col("id", s.Integer, primary_key=True), col("case_id", index=True),
                    col("at", s.BigInteger), col("actor"), col("action"), col("detail", s.Text))
    op.create_table("jobs", col("id", primary_key=True), col("connection", index=True),
                    col("case_id", index=True), col("kind"), col("payload", s.Text),
                    col("state"), col("expires", s.BigInteger), col("attempts", s.Integer),
                    col("next_at", s.BigInteger), col("result", s.Text))
    op.create_table("replay_copies", col("destination", primary_key=True), col("content", s.LargeBinary))


def downgrade():
    for table in ("replay_copies", "jobs", "case_log", "cases", "activity", "cloud_bindings", "connections"):
        op.drop_table(table)
