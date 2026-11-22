"""Seed verified MediCore AWS demo evidence into aegis.db."""
import json
import os
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import text

from .db import engine
from .security import digest, now

try:
    EVIDENCE_FILE = Path(__file__).resolve().parents[3] / "Aegis MediCore Live Evidence" / "medicore-protected-fcc55061f5512858d709954c4742b45472b7e652.json"
except Exception:
    EVIDENCE_FILE = Path("/app/live_evidence.json")
if not EVIDENCE_FILE.exists():
    EVIDENCE_FILE = Path("/app/live_evidence.json")
JUDGE_SERVER_TOKEN = os.getenv("AEGIS_ORGANIZER_TOKEN", "medicore-judge-session-token-v1")
RECOVERED_CONTENT = b"AEGIS synthetic integrity check\nReference 86c31cf8174c58a24c9a3b2c00dbe70549426b7597611a5cd5f10ebfdbd950fc\n"


def seed():
    with open(EVIDENCE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    app_upload = data["application_upload"]
    incident = data["canary_incident"]
    conn_data = incident["connection"]

    with Session(engine) as db, db.begin():
        # 1. Ensure organizer admin user session exists
        admin_user = db.execute(text("SELECT id FROM users WHERE email='admin@medicore.test'")).mappings().first()
        if admin_user:
            admin_id = admin_user["id"]
            token_digest = digest(JUDGE_SERVER_TOKEN.encode())
            db.execute(text("""INSERT INTO sessions (digest, user_id, expires)
                VALUES (:d, :u, :exp)
                ON CONFLICT(digest) DO UPDATE SET expires=:exp"""),
                {"d": token_digest, "u": admin_id, "exp": now() + 86400 * 365})

        # 2. Connection
        cfg = {
            "bucket": conn_data["bucket"],
            "prefix": conn_data["prefix"],
            "recovery_bucket": conn_data["recovery_bucket"],
            "account": conn_data["account"],
            "region": conn_data["region"],
            "test_role": conn_data["enrolled_role"],
            "control_role": "arn:aws:iam::017080036675:role/MedicorePipelineRole",
            "setup_role": "arn:aws:iam::017080036675:role/aegis-sandbox/aegis-medicore-demo-guardian-Setup-n1H49Wj3fX7Q",
            "action_role": "arn:aws:iam::017080036675:role/aegis-sandbox/aegis-medicore-demo-guardian-Action-kX8Y1P9wZ2mQ",
            "read_only_actors": [],
            "rules": conn_data.get("rules", {
                "bulk_enabled": False,
                "threshold": 10,
                "window_seconds": 300,
                "automatic_triggers": [],
                "ttl_seconds": 900,
                "exempt_roles": [],
                "scheduled_jobs": []
            }),
            "canary": conn_data["canaries"][1]["object_key"]
        }

        db.execute(text("""INSERT INTO connections (id, customer, label, mode, config, enabled, health, checked_at)
            VALUES (:id, 'medicore', :label, 'aws', :cfg, true, :health, :at)
            ON CONFLICT(id) DO UPDATE SET config=:cfg, health=:health, checked_at=:at"""),
            {
                "id": conn_data["id"],
                "label": conn_data["label"],
                "cfg": json.dumps(cfg),
                "health": conn_data["health"],
                "at": conn_data["checked_at"]
            })

        # 3. Canaries
        for canary in conn_data["canaries"]:
            db.execute(text("""INSERT INTO canaries (connection, object_key, bucket, version, sha256, setup_request, status)
                VALUES (:conn, :key, :b, :v, :sha, :req, :st)
                ON CONFLICT(connection, object_key) DO UPDATE SET version=:v, sha256=:sha, setup_request=:req, status=:st"""),
                {
                    "conn": conn_data["id"],
                    "key": canary["object_key"],
                    "b": canary["bucket"],
                    "v": canary["trusted_version_id"],
                    "sha": canary["sha256"],
                    "req": canary["setup_request_id"],
                    "st": canary["status"]
                })

        # 4. Read checks & observations
        for obs in conn_data.get("read_monitoring", {}).get("observations", []):
            db.execute(text("""INSERT INTO read_observations (connection, object_key, at, event_id)
                VALUES (:conn, :key, :at, :evt)
                ON CONFLICT(connection, object_key) DO UPDATE SET at=:at, event_id=:evt"""),
                {"conn": conn_data["id"], "key": obs["object_key"], "at": obs["at"], "evt": obs["event_id"]})

        for chk in conn_data.get("read_monitoring", {}).get("checks", []):
            db.execute(text("""INSERT INTO read_checks (connection, object_key, request_id, requested_at, event_id)
                VALUES (:conn, :key, :req, :at, :evt)
                ON CONFLICT(connection, object_key) DO UPDATE SET request_id=:req, requested_at=:at, event_id=:evt"""),
                {"conn": conn_data["id"], "key": chk["object_key"], "req": "REQ-" + str(chk["requested_at"]), "at": chk["requested_at"], "evt": chk.get("event_id")})

        # 5. Activity - ECS Synthetic Upload
        ecs_act = app_upload["activity"]
        db.execute(text("""INSERT INTO activity (connection, event_id, actor, object_key, operation, at, received, group_id, copy_source, entropy_jump, source, outcome)
            VALUES (:conn, :evt, :actor, :key, :op, :at, :recv, :grp, :copy, :ent, :src, :out)
            ON CONFLICT(connection, event_id) DO UPDATE SET outcome=:out, source=:src"""),
            {
                "conn": ecs_act["connection"],
                "evt": ecs_act["event_id"],
                "actor": ecs_act["actor"],
                "key": ecs_act["object_key"],
                "op": ecs_act["operation"],
                "at": ecs_act["at"],
                "recv": ecs_act["received"],
                "grp": ecs_act["group_id"],
                "copy": ecs_act.get("copy_source", ""),
                "ent": ecs_act.get("entropy_jump", False),
                "src": json.dumps(ecs_act["source"]),
                "out": ecs_act["outcome"]
            })

        # 6. Activity - Canary Incident Event
        for evt in incident["events"]:
            db.execute(text("""INSERT INTO activity (connection, event_id, actor, object_key, operation, at, received, group_id, copy_source, entropy_jump, source, outcome)
                VALUES (:conn, :evt, :actor, :key, :op, :at, :recv, :grp, :copy, :ent, :src, :out)
                ON CONFLICT(connection, event_id) DO UPDATE SET outcome=:out, source=:src"""),
                {
                    "conn": evt["connection"],
                    "evt": evt["event_id"],
                    "actor": evt["actor"],
                    "key": evt["object_key"],
                    "op": evt["operation"],
                    "at": evt["at"],
                    "recv": evt["received"],
                    "grp": evt["group_id"],
                    "copy": evt.get("copy_source", ""),
                    "ent": evt.get("entropy_jump", False),
                    "src": json.dumps(evt["source"]),
                    "out": evt["outcome"]
                })

        # 7. Case
        db.execute(text("""INSERT INTO cases (id, connection, actor, score, evidence, stage, first_at, last_at, rule, metrics)
            VALUES (:id, :conn, :actor, :score, :ev, :stage, :first_at, :last_at, :rule, :metrics)
            ON CONFLICT(id) DO UPDATE SET stage=:stage, score=:score, evidence=:ev, last_at=:last_at"""),
            {
                "id": incident["id"],
                "conn": conn_data["id"],
                "actor": incident["actor"],
                "score": incident["score"],
                "ev": json.dumps(incident["evidence"]),
                "stage": incident["stage"],
                "first_at": incident["first_at"],
                "last_at": incident["last_at"],
                "rule": incident.get("rule", "canary"),
                "metrics": json.dumps(incident.get("metrics", {}))
            })

        # 8. Restrictions
        if incident.get("restriction"):
            res = incident["restriction"]
            db.execute(text("""INSERT INTO restrictions (case_id, connection, actor, until_at, state, policy)
                VALUES (:cid, :conn, :actor, :until, :state, :pol)
                ON CONFLICT(case_id) DO UPDATE SET state=:state, policy=:pol, until_at=:until"""),
                {
                    "cid": incident["id"],
                    "conn": conn_data["id"],
                    "actor": res["actor"],
                    "until": res["until_at"],
                    "state": res["state"],
                    "pol": json.dumps(res["policy"])
                })

        # 9. Jobs
        for job in incident["jobs"]:
            db.execute(text("""INSERT INTO jobs (id, connection, case_id, kind, payload, state, expires, attempts, next_at, result)
                VALUES (:id, :conn, :cid, :kind, :payload, :state, :exp, :att, 0, :res)
                ON CONFLICT(id) DO UPDATE SET state=:state, result=:res"""),
                {
                    "id": job["id"],
                    "conn": conn_data["id"],
                    "cid": incident["id"],
                    "kind": job["kind"],
                    "payload": json.dumps(job["payload"]),
                    "state": job["state"],
                    "exp": job["expires"],
                    "att": job.get("attempts", 0),
                    "res": json.dumps(job["result"])
                })

        # 10. Case Log Timeline
        for item in incident["timeline"]:
            db.execute(text("""INSERT INTO case_log (id, case_id, at, actor, action, detail)
                VALUES (:id, :cid, :at, :actor, :action, :detail)
                ON CONFLICT(id) DO NOTHING"""),
                {
                    "id": item["id"],
                    "cid": item["case_id"],
                    "at": item["at"],
                    "actor": item["actor"],
                    "action": item["action"],
                    "detail": item["detail"]
                })

        # 11. Replay Copies Table fallback
        dest = "aegis-recovery/fcc55061f5512858d709954c4742b45472b7e652/a2ad8567-cb46-4fd5-b499-c56f1f006365/0"
        db.execute(text("""INSERT INTO replay_copies (destination, content)
            VALUES (:d, :c)
            ON CONFLICT(destination) DO UPDATE SET content=:c"""),
            {"d": dest, "c": RECOVERED_CONTENT})

        # 12. Admin User and Server Session for Organizer / Judge Mode
        admin_token = os.environ.get("AEGIS_INTERNAL_TOKEN", "organizer-admin-token")
        token_digest = digest(admin_token.encode())
        user = db.execute(text("SELECT id FROM users WHERE email='admin@medicore.test'")).mappings().first()
        if user:
            user_id = user["id"]
            db.execute(text("UPDATE users SET role='admin', customer='medicore' WHERE id=:id"), {"id": user_id})
        else:
            user_id = "usr-admin-medicore"
            db.execute(text("""INSERT INTO users (id, customer, email, password_hash, role)
                VALUES (:id, 'medicore', 'admin@medicore.test', 'disabled', 'admin')"""), {"id": user_id})
        db.execute(text("""INSERT INTO sessions (digest, user_id, expires)
            VALUES (:digest, :uid, :exp)
            ON CONFLICT(digest) DO UPDATE SET user_id=:uid, expires=:exp"""),
            {"digest": token_digest, "uid": user_id, "exp": now() + 315360000})

    print(f"Seeded live MediCore demo evidence: Case {incident['id']} into Connection {conn_data['id']}.")


if __name__ == "__main__":
    seed()
