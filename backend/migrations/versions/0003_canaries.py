"""Canary baselines, source receipts, response leases and rolling evidence."""
import json

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"


def upgrade():
    op.create_table("canaries",
        sa.Column("connection", sa.String, sa.ForeignKey("connections.id"), primary_key=True),
        sa.Column("object_key", sa.String, primary_key=True),
        sa.Column("bucket", sa.String, nullable=False),
        sa.Column("intent", sa.String, nullable=True),
        sa.Column("version", sa.String), sa.Column("sha256", sa.String),
        sa.Column("setup_request", sa.String), sa.Column("status", sa.String, nullable=False))
    op.create_table("setup_sessions",
        sa.Column("connection", sa.String, sa.ForeignKey("connections.id"), primary_key=True),
        sa.Column("object_key",sa.String,primary_key=True), sa.Column("credential_hash",sa.String,primary_key=True))
    op.create_table("read_checks",
        sa.Column("connection", sa.String, sa.ForeignKey("connections.id"), primary_key=True),
        sa.Column("object_key", sa.String, primary_key=True), sa.Column("request_id",sa.String,nullable=False),
        sa.Column("requested_at",sa.BigInteger,nullable=False), sa.Column("event_id",sa.String))
    op.create_table("read_observations",
        sa.Column("connection", sa.String, sa.ForeignKey("connections.id"), primary_key=True),
        sa.Column("object_key", sa.String, primary_key=True), sa.Column("at", sa.BigInteger, nullable=False),
        sa.Column("event_id", sa.String, nullable=False))
    op.create_table("receipts",
        sa.Column("connection", sa.String, sa.ForeignKey("connections.id"), primary_key=True),
        sa.Column("request_id", sa.String, primary_key=True),
        sa.Column("object_key", sa.String, nullable=False), sa.Column("operation", sa.String, nullable=False),
        sa.Column("actor", sa.String, nullable=False))
    op.create_table("replay_versions",
        sa.Column("connection", sa.String, sa.ForeignKey("connections.id"), primary_key=True),
        sa.Column("object_key", sa.String, primary_key=True), sa.Column("version", sa.String, primary_key=True),
        sa.Column("content", sa.LargeBinary, nullable=False),
        sa.Column("is_current",sa.Boolean, nullable=False, server_default=sa.true()))
    op.create_table("replay_policies",
        sa.Column("connection", sa.String, primary_key=True), sa.Column("actor", sa.String, primary_key=True),
        sa.Column("document", sa.Text, nullable=False))
    op.create_table("action_owners",
        sa.Column("target",sa.String,primary_key=True),
        sa.Column("case_id",sa.String,sa.ForeignKey("cases.id"),nullable=False,unique=True))
    op.create_table("restrictions",
        sa.Column("case_id", sa.String, sa.ForeignKey("cases.id"), primary_key=True),
        sa.Column("connection", sa.String, nullable=False), sa.Column("actor", sa.String, nullable=False),
        sa.Column("until_at", sa.BigInteger, nullable=False), sa.Column("state", sa.String, nullable=False),
        sa.Column("policy", sa.Text, nullable=False))
    op.add_column("activity", sa.Column("source", sa.Text, nullable=False, server_default="{}"))
    op.add_column("activity", sa.Column("outcome", sa.String, nullable=False, server_default="success"))
    op.create_index("activity_actor_time", "activity", ["connection", "actor", "at"])
    op.add_column("cases", sa.Column("rule", sa.String, nullable=False, server_default="correlation"))
    op.add_column("cases", sa.Column("metrics", sa.Text, nullable=False, server_default="{}"))
    op.create_table("case_events",
        sa.Column("case_id", sa.String, sa.ForeignKey("cases.id"), primary_key=True),
        sa.Column("connection", sa.String, primary_key=True), sa.Column("event_id", sa.String, primary_key=True),
        sa.ForeignKeyConstraint(["connection","event_id"], ["activity.connection","activity.event_id"]))
    db = op.get_bind()
    for conn in db.execute(sa.text("SELECT id,config FROM connections")).mappings():
        cfg = json.loads(conn["config"])
        key = cfg.get("canary")
        if key:
            base = cfg.get("trusted", {}).get(key, {})
            db.execute(sa.text("""INSERT INTO canaries
                (connection,object_key,bucket,version,sha256,setup_request,status)
                VALUES (:id,:key,:bucket,:version,:sha,:request,'legacy')"""),
                dict(id=conn["id"], key=key, bucket=cfg["bucket"], version=base.get("version"),
                     sha=base.get("sha256"), request=cfg.get("canary_setup_request") or None))

    # An existing verified policy has no time condition. Keep its exact document
    # available for the current worker to compare and reverse after an upgrade.
    latest={}
    for row in db.execute(sa.text("""SELECT l.case_id,j.kind,j.connection,j.payload,n.mode FROM case_log l
        JOIN jobs j ON j.id=l.detail JOIN connections n ON n.id=j.connection
        WHERE l.action IN ('restrict_completed','reverse_completed') ORDER BY l.id""")).mappings():
        latest[row["case_id"]]=dict(row)
    for case,row in latest.items():
        if row["kind"]!="restrict":
            continue
        plan=json.loads(row["payload"])
        actor,conn=plan["actor"],row["connection"]
        document=json.dumps({"Version":"2012-10-17","Statement":[{"Sid":"Case"+case,"Effect":"Deny",
            "Action":["s3:PutObject","s3:DeleteObject","s3:DeleteObjectVersion"],
            "Resource":f"arn:aws:s3:::{plan['bucket']}/{plan['prefix']}*"}]})
        params=dict(id=case,c=conn,a=actor,p=document,target=actor if row["mode"]=="aws" else f"replay:{conn}:{actor}")
        db.execute(sa.text("INSERT INTO restrictions VALUES (:id,:c,:a,0,'verified',:p)"),params)
        db.execute(sa.text("INSERT INTO action_owners VALUES (:target,:id) ON CONFLICT DO NOTHING"),params)
        if row["mode"]=="replay":
            db.execute(sa.text("INSERT INTO replay_policies VALUES (:c,:a,:p) ON CONFLICT DO NOTHING"),params)


def downgrade():
    op.drop_table("case_events")
    op.drop_column("cases", "metrics")
    op.drop_column("cases", "rule")
    op.drop_index("activity_actor_time", table_name="activity")
    op.drop_column("activity", "outcome")
    op.drop_column("activity", "source")
    for table in ("restrictions","action_owners","replay_policies","replay_versions","receipts","read_observations","read_checks","setup_sessions","canaries"):
        op.drop_table(table)
