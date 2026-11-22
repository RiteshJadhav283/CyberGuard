"""Ingestion and detection shared by the AWS worker and labelled metadata replay."""
import json
import math
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import unquote

from .db import run, rows
from .response import eligible, proposal, reserve
from .cloud import ReviewRequired

from .security import digest, now, uid

WRITES = {"PutObject", "CopyObject", "DeleteObject", "CompleteMultipartUpload"}
READS = {"GetObject", "HeadObject", "GetObjectAttributes", "SelectObjectContent"}
WINDOW = 300


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
    op = data.get("eventName")
    if (data.get("eventSource") != "s3.amazonaws.com" or message.get("account") != cfg["account"]
            or message.get("region") != cfg["region"] or data.get("recipientAccountId",cfg["account"]) != cfg["account"]
            or params.get("bucketName") != cfg["bucket"] or op not in WRITES | READS):
        return None
    key = params.get("key", "")
    if not key.startswith(cfg["prefix"]):
        return None
    identity = data.get("userIdentity") or {}
    context = identity.get("sessionContext") or {}
    issuer = (context.get("sessionIssuer") or {}).get("arn")
    arn = identity.get("arn")
    role = issuer if identity.get("type") == "AssumedRole" else None
    session = arn if role else None
    error = data.get("errorCode") or ""
    denied = error.split(".")[-1] in ("AccessDenied","AccessDeniedException","UnauthorizedOperation","AllAccessDisabled","Forbidden","403")
    source = {"account":cfg["account"], "region":cfg["region"], "bucket":cfg["bucket"], "role_arn":role,
              "session_arn":session,"identity_type":identity.get("type"),"principal_id":identity.get("principalId"),
              "principal_arn":arn,"source_identity":context.get("sourceIdentity"),
              "identity_center_user_id":(identity.get("onBehalfOf") or {}).get("userId"),
              "identity_store_arn":(identity.get("onBehalfOf") or {}).get("identityStoreArn"),
              "source_ip":data.get("sourceIPAddress"),"user_agent":data.get("userAgent"),
              "request_id":data.get("requestID"),"error_code":error or None,
              "version_id":(data.get("responseElements") or {}).get("x-amz-version-id") or params.get("versionId")}
    source = {key:value for key,value in source.items() if value is not None}
    return {"id": data["eventID"], "key":key, "op":op,"actor":role or arn or "unresolved",
            "at":int(datetime.fromisoformat(data["eventTime"].replace("Z","+00:00")).timestamp()),
            "credential_hash":digest(identity["accessKeyId"].encode()) if identity.get("accessKeyId") else None,
            "outcome":"denied" if denied else "failed" if error else "success","source":source,
            "copy_source":unquote(params.get("x-amz-copy-source","")).lstrip("/"),"version":source.get("version_id","")}


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


def save_case(db, conn, group, actor, score, evidence, first_at, last_at, rule, metrics):
    args = dict(id=group,conn=conn["id"],actor=actor,score=min(100,score),e=json.dumps(evidence),
                first=first_at,last=last_at,rule=rule,m=json.dumps(metrics))
    new = run(db,"""INSERT INTO cases (id,connection,actor,score,evidence,stage,first_at,last_at,rule,metrics)
        VALUES (:id,:conn,:actor,:score,:e,'open',:first,:last,:rule,:m) ON CONFLICT DO NOTHING""",**args)
    if new.rowcount:
        record(db,group,"guardian","incident_opened"," / ".join(evidence))
        notify(db,conn,group,"opened")
    else:
        run(db,"""UPDATE cases SET score=:score,evidence=:e,metrics=:m,rule=:rule,
            first_at=CASE WHEN first_at<:first THEN first_at ELSE :first END,
            last_at=CASE WHEN last_at>:last THEN last_at ELSE :last END,
            stage=CASE WHEN stage='closed' THEN 'review' ELSE stage END WHERE id=:id""",**args)


def auto_request(db, conn, cfg, case, event, trigger):
    rules = cfg.get("rules",{})
    if (trigger not in rules.get("automatic_triggers",[]) or event.get("outcome","success")!="success"
            or not eligible(cfg,event["actor"]) or event.get("source",{}).get("role_arn") != cfg["test_role"]
            or (conn["mode"]=="aws" and not 0 <= now()-event["at"] <= rules.get("window_seconds",300))):
        return
    if conn["mode"]=="aws":
        role_name=cfg["test_role"].rsplit("/",1)[-1]
        session_prefix=f"arn:aws:sts::{cfg['account']}:assumed-role/{role_name}/"
        if not event["source"].get("session_arn","").startswith(session_prefix):
            return
    if run(db,"SELECT 1 FROM jobs WHERE case_id=:id AND kind='restrict'",id=case).first():
        return
    stage = run(db,"SELECT stage FROM cases WHERE id=:id",id=case).scalar_one()
    if stage not in ("open","review"):
        return
    payload = proposal(cfg,case,stage,"restrict")
    payload.update(trigger=trigger,event_id=event["id"],rule_snapshot=rules,authorization=cfg.get("rule_approval"))
    try:
        reserve(db,conn,case,payload)
    except ReviewRequired as exc:
        record(db,case,"guardian","automatic_restriction_deferred",str(exc))
        return
    job = queue(db,conn,case,"restrict",payload)
    run(db,"UPDATE cases SET stage='containment_pending' WHERE id=:id",id=case)
    record(db,case,"guardian","restriction_requested",job)


def known_setup(db, conn, cfg, event, item):
    source = event.get("source",{})
    request = source.get("request_id")
    if not request:
        return False
    actor, op, key = event["actor"],event["op"],event["key"]
    if run(db,"""SELECT 1 FROM receipts WHERE connection=:c AND request_id=:r AND object_key=:k
            AND operation=:op AND actor=:a""",c=conn["id"],r=request,k=key,op=op,a=actor).first():
        return True
    if not item or op!="PutObject" or event.get("outcome","success")!="success":
        return False
    if item["setup_request"] == request:
        # Legacy setup used customer credentials. Bind the receipt to its pinned revision.
        return (actor==cfg.get("setup_role") or
                (item["version"] and source.get("version_id")==item["version"]))
    if not item["intent"] or item["setup_request"] or actor!=cfg.get("setup_role"):
        return False
    session = source.get("session_arn","").rsplit("/",1)[-1]
    proven=run(db,"SELECT 1 FROM setup_sessions WHERE connection=:c AND object_key=:k AND credential_hash=:h",
               c=conn["id"],k=key,h=event.get("credential_hash")).first()
    if not proven or session != "AEGIS-setup-"+item["intent"]:
        return False
    run(db,"""UPDATE canaries SET setup_request=:r,
        status=CASE WHEN version IS NULL THEN status ELSE 'ready' END
        WHERE connection=:c AND object_key=:k""",r=request,c=conn["id"],k=key)
    return True


def ingest(db, conn, event):
    cid = conn["id"]
    lock = run(db,"UPDATE connections SET health=health WHERE id=:id AND enabled=true",id=cid)
    if not lock.rowcount:
        raise RuntimeError("Connection paused during delivery")
    cfg = json.loads(run(db,"SELECT config FROM connections WHERE id=:id",id=cid).scalar_one())
    actor, at, key, op = event["actor"],event["at"],event["key"],event["op"]
    if not key.startswith(cfg["prefix"]) or op not in READS | WRITES:
        return
    items = {r["object_key"]:r for r in run(db,"SELECT * FROM canaries WHERE connection=:c",c=cid).mappings()}
    canaries = {k for k,r in items.items() if r["status"]!="conflict"}
    if cfg.get("canary"):
        canaries.add(cfg["canary"])
    if op in READS:
        if key not in canaries:
            return
        if event.get("outcome")=="success":
            run(db,"""UPDATE read_checks SET event_id=:eid WHERE connection=:c AND object_key=:k
                AND request_id=:r""",c=cid,k=key,eid=event["id"],r=event.get("source",{}).get("request_id"))
        run(db,"""INSERT INTO read_observations VALUES (:c,:k,:at,:event)
            ON CONFLICT (connection,object_key) DO UPDATE SET at=excluded.at,event_id=excluded.event_id
            WHERE read_observations.at < excluded.at""",c=cid,k=key,at=at,event=event["id"])
    if known_setup(db,conn,cfg,event,items.get(key)):
        return
    group = digest(json.dumps([cid,actor,at//WINDOW]).encode())[:40]
    outcome = event.get("outcome","success")
    inserted = run(db,"""INSERT INTO activity (connection,event_id,actor,object_key,operation,at,received,
        group_id,copy_source,entropy_jump,source,outcome) VALUES (:c,:id,:a,:k,:op,:at,:received,:g,:copy,
        :entropy,:source,:outcome) ON CONFLICT (connection,event_id) DO NOTHING""",
        c=cid,id=event["id"],a=actor,k=key,op=op,at=at,received=now(),g=group,copy=event.get("copy_source",""),
        entropy=event.get("entropy_jump",False),source=json.dumps(event.get("source",{})),outcome=outcome)
    if not inserted.rowcount:
        return
    changes = rows(run(db,"SELECT * FROM activity WHERE group_id=:g ORDER BY at,event_id",g=group))
    writes = [r for r in changes if r["outcome"]=="success" and r["operation"] in WRITES]
    touches = [r for r in changes if r["object_key"] in canaries]
    keys = {r["object_key"] for r in writes}
    evidence = []
    score = 0
    if touches:
        evidence.append("Registered canary access observed")
        score += 65
    if len(keys)>=cfg.get("burst_threshold",6):
        evidence.append(f"{len(keys)} distinct keys changed in one five-minute interval")
        score += 35
    if writes and actor in cfg.get("read_only_actors",[]):
        evidence.append("The writer has a declared read-only business role")
        score += 40
    deleted = {r["object_key"] for r in writes if r["operation"]=="DeleteObject"}
    renamed = {r["copy_source"] for r in writes if r["operation"]=="CopyObject"
               and r["copy_source"].startswith(cfg["bucket"]+"/") and r["copy_source"].split("/",1)[1] in deleted}
    if len(renamed)>=3:
        evidence.append(f"{len(renamed)} copy sources also deleted in the same interval")
        score += 35
    if any(r["entropy_jump"] for r in writes):
        evidence.append("A pinned synthetic sample became substantially more random")
        score += 30
    case = None
    if score>=60:
        case = group
        save_case(db,conn,group,actor,score,evidence,changes[0]["at"],changes[-1]["at"],
                  "canary" if touches else "correlation",{"canary_event_ids":[r["event_id"] for r in touches]})
        if key in canaries:
            record(db,group,"guardian","canary_touch",event["id"])
            auto_request(db,conn,cfg,group,event,"canary")
    if cfg.get("rules",{}).get("bulk_enabled") and outcome=="success" and op in WRITES:
        from .rolling import detect_bulk
        bulk = detect_bulk(db,conn,cfg,event)
        case = case or bulk
    return case


def replay(db, conn, scenario):
    cfg = json.loads(conn["config"])
    prefix = cfg["prefix"]
    role = cfg["test_role"]
    account = cfg.get("account","000000000000")
    region = cfg.get("region","us-east-1")
    actor = role if scenario not in ("routine","bulk","canary") else f"arn:aws:iam::{account}:role/uploader"
    keys = [prefix+"report-01.txt"]
    op = "PutObject"
    if scenario in ("bulk","correlated","enrolled-bulk"):
        keys = [prefix+f"report-{i:02}.txt" for i in range(1,9)]
    if scenario == "canary":
        keys = [cfg["canary"]]
    if scenario == "correlated":
        keys.append(cfg["canary"])
    if scenario in ("canary-overwrite","canary-read","canary-delete","canary-denied"):
        item = run(db,"""SELECT * FROM canaries WHERE connection=:c AND status='ready'
            ORDER BY object_key LIMIT 1""",c=conn["id"]).mappings().first()
        if not item:
            from .cloud import ReviewRequired
            raise ReviewRequired("Provision the canaries before running this replay")
        keys = [item["object_key"]]
        op = {"canary-read":"GetObject","canary-delete":"DeleteObject","canary-denied":"GetObject"}.get(scenario,op)
    previous = run(db,"SELECT max(at) FROM activity WHERE connection=:id",id=conn["id"]).scalar()
    start = max(now()//WINDOW*WINDOW,(previous//WINDOW+1)*WINDOW if previous else 0)
    ids, cases = [], []
    from .response import ReplayActions
    for i,key in enumerate(keys):
        eid = uid()
        denied = (scenario=="canary-denied" or (actor==role and op in WRITES and
                  not ReplayActions(db,conn["id"],cfg).probe("test_role",eid)))
        detail = {"eventID":eid,"requestID":uid(),"eventName":op,"eventSource":"s3.amazonaws.com",
            "eventTime":datetime.fromtimestamp(start+i,timezone.utc).isoformat(),"sourceIPAddress":"192.0.2.10",
            "userIdentity":{"type":"AssumedRole","arn":f"arn:aws:sts::{account}:assumed-role/{actor.rsplit('/',1)[-1]}/Mentoring",
                            "sessionContext":{"sessionIssuer":{"arn":actor}}},
            "requestParameters":{"bucketName":cfg["bucket"],"key":key}}
        if denied:
            detail["errorCode"]="AccessDenied"
        elif scenario in ("canary-overwrite","canary-delete"):
            version=uid()
            run(db,"UPDATE replay_versions SET is_current=false WHERE connection=:c AND object_key=:k",c=conn["id"],k=key)
            run(db,"INSERT INTO replay_versions (connection,object_key,version,content) VALUES (:c,:k,:v,:body)",c=conn["id"],k=key,v=version,
                body=b"Harmless replay revision\n" if op=="PutObject" else b"")
            detail["responseElements"]={"x-amz-version-id":version}
        envelope={"source":"aws.s3","detail-type":"AWS API Call via CloudTrail","account":account,"region":region,"detail":detail}
        event=normalize(envelope,{**cfg,"account":account,"region":region})
        case=ingest(db,conn,event)
        ids.append(eid)
        linked=list(run(db,"SELECT case_id FROM case_events WHERE connection=:c AND event_id=:id",
                        c=conn["id"],id=eid).scalars())
        for identifier in [case,*linked]:
            if identifier and identifier not in cases:
                cases.append(identifier)
    return {"recorded":len(ids),"event_ids":ids,"case_ids":cases,"mode":"replay","scenario":scenario}
