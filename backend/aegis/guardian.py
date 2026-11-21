"""Ingestion and detection shared by the AWS worker and labelled metadata replay."""
import json
import math
from collections import Counter
from datetime import datetime
from urllib.parse import unquote

from sqlalchemy import text

from .security import digest, now, uid

WRITES = {"PutObject", "CopyObject", "DeleteObject", "CompleteMultipartUpload"}
WINDOW = 300


def run(db, sql, **params):
    return db.execute(text(sql), params)


def rows(result):
    return [dict(row) for row in result.mappings()]


def record(db, case, actor, action, detail=""):
    run(db, """INSERT INTO case_log (case_id,at,actor,action,detail)
        VALUES (:case,:at,:actor,:action,:detail)""", case=case, at=now(), actor=actor,
        action=action, detail=detail)


def queue(db, conn, case, kind, payload, *, pending=False, job_id=None):
    job = job_id or uid()
    run(db, """INSERT INTO jobs (id,connection,case_id,kind,payload,state,expires,attempts,next_at,result)
        VALUES (:id,:conn,:case,:kind,:payload,:state,:expires,0,0,'{}') ON CONFLICT (id) DO NOTHING""",
        id=job, conn=conn["id"], case=case, kind=kind, payload=json.dumps(payload),
        state="preview" if pending else "queued", expires=now()+900)
    return job


def notify(db, conn, case, phase):
    cfg=json.loads(conn["config"])
    if cfg.get("jira"):
        queue(db, conn, case, "jira", {"phase": phase}, job_id=f"{case}:jira:{phase}")
    if cfg.get("slack_env"):
        queue(db, conn, case, "slack", {"phase": phase}, job_id=f"{case}:slack:{phase}")


def normalize(message, cfg):
    if message.get("source") != "aws.s3" or message.get("detail-type") != "AWS API Call via CloudTrail":
        return None
    data = message["detail"]
    params = data.get("requestParameters") or {}
    if (data.get("eventSource") != "s3.amazonaws.com" or data.get("errorCode")
            or message.get("account") != cfg["account"] or message.get("region") != cfg["region"]
            or params.get("bucketName") != cfg["bucket"] or data.get("eventName") not in WRITES):
        return None
    if data.get("requestID") and data["requestID"] == cfg.get("canary_setup_request"):
        return None
    key = params.get("key", "")
    if not key.startswith(cfg["prefix"]) or key.startswith(cfg["prefix"]+".aegis-probes/"):
        return None
    identity = data.get("userIdentity") or {}
    actor = (identity.get("sessionContext", {}).get("sessionIssuer", {}).get("arn")
             or identity.get("arn") or "unresolved")
    source = unquote(params.get("x-amz-copy-source", "")).lstrip("/")
    return {"id": data["eventID"], "key": key, "op": data["eventName"], "actor": actor,
            "at": int(datetime.fromisoformat(data["eventTime"].replace("Z", "+00:00")).timestamp()),
            "copy_source": source, "version":(data.get("responseElements") or {}).get("x-amz-version-id","")}


def enrich_entropy(cloud, event):
    key = event["key"]
    cfg = cloud.cfg
    baseline = cfg.get("trusted", {}).get(key)
    if key not in cfg.get("synthetic_sample_keys", []) or not baseline or not event.get("version"):
        return
    def entropy(data):
        return -sum((n/len(data))*math.log2(n/len(data)) for n in Counter(data).values())
    try:
        old = cloud.sample(key,baseline["version"])
        new = cloud.sample(key,event["version"])
    except Exception:
        return
    if min(len(old),len(new)) >= 1024:
        event["entropy_jump"] = entropy(new) >= 7.5 and entropy(new)-entropy(old) >= 1.5


def ingest(db, conn, event):
    cfg = json.loads(conn["config"])
    actor, at, key = event["actor"], event["at"], event["key"]
    if not key.startswith(cfg["prefix"]) or event["op"] not in WRITES:
        return
    group = digest(json.dumps([conn["id"], actor, at // WINDOW]).encode())[:40]
    # Serialize the event and case update per connection, including PostgreSQL workers.
    locked = run(db, "UPDATE connections SET health=health WHERE id=:id AND enabled=true", id=conn["id"])
    if not locked.rowcount:
        raise RuntimeError("Connection paused during delivery")
    added = run(db, """INSERT INTO activity (connection,event_id,actor,object_key,operation,at,received,group_id,copy_source,entropy_jump)
        VALUES (:conn,:event,:actor,:key,:op,:at,:received,:group,:source,:entropy)
        ON CONFLICT (connection,event_id) DO NOTHING""", conn=conn["id"], event=event["id"],
        actor=actor, key=key, op=event["op"], at=at, received=now(), group=group, source=event.get("copy_source",""),entropy=event.get("entropy_jump",False))
    if not added.rowcount:
        return
    changes = rows(run(db, "SELECT object_key,operation,at,copy_source,entropy_jump FROM activity WHERE group_id=:g", g=group))
    keys = {item["object_key"] for item in changes}
    evidence = []
    score = 0
    if cfg.get("canary") in keys:
        evidence.append("Registered decoy file changed")
        score += 65
    if len(keys) >= cfg.get("burst_threshold", 6):
        evidence.append(f"{len(keys)} distinct keys changed in one five-minute interval")
        score += 35
    if actor in cfg.get("read_only_actors", []):
        evidence.append("A writer was identified whose declared role only reads files")
        score += 40
    deleted = {r["object_key"] for r in changes if r["operation"]=="DeleteObject"}
    renamed = {r["copy_source"] for r in changes if r["operation"]=="CopyObject"
               and r["copy_source"].startswith(cfg["bucket"]+"/")
               and r["copy_source"].split("/",1)[1] in deleted}
    if len(renamed)>=3:
        evidence.append(f"{len(renamed)} copy sources also deleted in the same interval")
        score += 35
    if any(r["entropy_jump"] for r in changes):
        evidence.append("A pinned synthetic sample became substantially more random")
        score += 30
    if score < 60:
        return
    first = run(db, """INSERT INTO cases (id,connection,actor,score,evidence,stage,first_at,last_at)
        VALUES (:id,:conn,:actor,:score,:evidence,'open',:first,:last)
        ON CONFLICT (id) DO NOTHING""", id=group, conn=conn["id"], actor=actor, score=min(100,score),
        evidence=json.dumps(evidence), first=min(r["at"] for r in changes), last=max(r["at"] for r in changes))
    run(db, """UPDATE cases SET score=:score,evidence=:evidence,first_at=:first,last_at=:last WHERE id=:id""",
        score=min(score,100), evidence=json.dumps(evidence), first=min(r["at"] for r in changes),
        last=max(r["at"] for r in changes), id=group)
    if first.rowcount:
        record(db,group,"guardian","incident_opened"," / ".join(evidence))
        notify(db,conn,group,"opened")
    else:
        # Fresh evidence invalidates a previous human closure.
        run(db, "UPDATE cases SET stage='review' WHERE id=:id AND stage='closed'", id=group)


def replay(db, conn, scenario):
    cfg = json.loads(conn["config"])
    prefix = cfg["prefix"]
    actor = "replay/uploader" if scenario in ("routine","bulk") else "replay/report-reader"
    keys = [prefix+"report-01.txt"]
    if scenario in ("bulk", "correlated"):
        keys = [prefix+f"report-{i:02}.txt" for i in range(1,9)]
    if scenario == "canary":
        keys = [cfg["canary"]]
        actor = "replay/uploader"
    if scenario == "correlated":
        keys.append(cfg["canary"])
    # Separate simulated intervals prevent a routine example affecting a later scenario.
    previous = run(db, "SELECT max(at) FROM activity WHERE connection=:id", id=conn["id"]).scalar()
    start = max(now()//WINDOW*WINDOW, (previous//WINDOW+1)*WINDOW if previous else 0)
    for i,key in enumerate(keys):
        ingest(db,conn,dict(id=uid(),key=key,actor=actor,at=start+i,op="PutObject"))
    return len(keys)
