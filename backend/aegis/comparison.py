"""Two versioned, local fixture lanes for a dashboard rehearsal."""
import json

from .db import run
from .guardian import replay
from .security import digest, now, uid

KEY = "reports/synthetic-demo.txt"
ORIGINAL = b"MediCore synthetic report\nDemo reference: 001\n"
LANES = ("protected", "baseline")


def lane_id(customer, exercise, lane):
    scope = json.dumps([customer, str(exercise), lane]).encode()
    return "compare-" + digest(scope)[:32]


def start(db, customer, exercise):
    """Reserve the run and commit both lanes in the same transaction."""
    for lane in LANES:
        identifier = lane_id(customer, exercise, lane)
        cfg = {
            "bucket": f"synthetic-{lane}", "prefix": "reports/",
            "recovery_bucket": "synthetic-recovery", "canary": KEY,
            "test_role": "arn:aws:iam::000000000000:role/aegis-sandbox/DemoWriter",
            "control_role": "arn:aws:iam::000000000000:role/aegis-sandbox/DemoControl",
            "comparison_lane": lane,
        }
        inserted = run(db, """INSERT INTO connections
            (id,customer,label,mode,config,enabled,health,checked_at)
            VALUES (:id,:customer,:label,'replay',:cfg,true,'Ready',:at)
            ON CONFLICT (id) DO NOTHING""", id=identifier, customer=customer,
            label=f"Comparison rehearsal · {lane}", cfg=json.dumps(cfg), at=now())
        if not inserted.rowcount:
            break
        original = uid()
        run(db, """INSERT INTO canaries (connection,object_key,bucket,version,sha256,status)
            VALUES (:id,:key,:bucket,:version,:sha,'ready')""", id=identifier, key=KEY,
            bucket=cfg["bucket"], version=original, sha=digest(ORIGINAL))
        run(db, """INSERT INTO replay_versions (connection,object_key,version,content)
            VALUES (:id,:key,:version,:content)""", id=identifier, key=KEY,
            version=original, content=ORIGINAL)
        connection = {"id": identifier, "mode": "replay", "config": json.dumps(cfg)}
        replay(db, connection, "canary-overwrite")


def result(db, customer, exercise):
    lanes = {}
    for lane in LANES:
        record = run(db, """SELECT a.connection, a.event_id, a.object_key, a.operation,
                a.outcome, a.at, a.source, c.id AS case_id, c.stage, k.version AS trusted_version_id
            FROM activity a JOIN connections n ON n.id=a.connection
            JOIN canaries k ON k.connection=a.connection AND k.object_key=a.object_key
            LEFT JOIN cases c ON c.id=a.group_id AND c.connection=a.connection
            WHERE n.id=:id AND n.customer=:customer AND n.mode='replay'
            ORDER BY a.at,a.event_id LIMIT 1""", id=lane_id(customer, exercise, lane),
            customer=customer).mappings().first()
        if not record:
            return None
        data = dict(record)
        source = json.loads(data.pop("source"))
        lanes[lane] = data | {"intervention": "aegis" if lane == "protected" else "manual",
                              "observed_version_id": source.get("version_id")}
    return {"id": str(exercise), "mode": "replay", "lanes": lanes}
