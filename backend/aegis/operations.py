"""Authenticated operator workflow for replay and customer-owned AWS connections."""
import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .cloud import Cloud, ReviewRequired, replay_bytes
from . import comparison
from .canary import provision, inventory, check_reads, read_health
from .response import eligible, proposal, reserve
from .rules import Rules
from .db import database
from .evidence import events_for, explanation
from .guardian import notify, queue, record, replay, rows, run
from .security import current_user, digest, now, roles, uid

router = APIRouter(prefix="/api/v1/ops")


class Selection(BaseModel):
    keys: list[str] = Field(min_length=1,max_length=50)


class Step(BaseModel):
    action: Literal["review","skip_containment","close"]
    reason: str = Field(default="",max_length=500)


def connection(db,user,identifier):
    conn = run(db,"SELECT * FROM connections WHERE id=:id AND customer=:customer",
               id=identifier,customer=user["customer"]).mappings().first()
    if not conn:
        raise HTTPException(404,"Connection unavailable")
    return conn


def case_context(db,user,identifier,lock=False):
    case = run(db,"""SELECT c.* FROM cases c JOIN connections n ON c.connection=n.id
        WHERE c.id=:id AND n.customer=:customer""",id=identifier,customer=user["customer"]).mappings().first()
    if not case:
        raise HTTPException(404,"Case unavailable")
    conn = connection(db,user,case["connection"])
    if lock:
        run(db,"UPDATE connections SET health=health WHERE id=:id",id=conn["id"])
        case = run(db,"SELECT * FROM cases WHERE id=:id",id=identifier).mappings().one()
        conn = connection(db,user,case["connection"])
    return case,conn


def public_conn(db,conn):
    cfg=json.loads(conn["config"])
    health=conn["health"]
    if conn["enabled"] and conn["mode"]=="aws" and conn["checked_at"] and now()-conn["checked_at"]>120:
        health="Worker check overdue"
    return {k:conn[k] for k in ("id","label","mode","enabled","health","checked_at")} | {
        "health":health,"bucket":cfg["bucket"],"prefix":cfg["prefix"],"recovery_bucket":cfg["recovery_bucket"],
        "account":cfg.get("account"),"region":cfg.get("region"),"canaries":inventory(db,conn["id"]),
        "rules":Rules.model_validate(cfg.get("rules",{})).model_dump(),"enrolled_role":cfg.get("test_role"),"read_monitoring":read_health(db,conn,cfg),
        "canary":cfg.get("canary",""),"slack_configured":bool(cfg.get("slack_env")),"jira_configured":bool(cfg.get("jira"))}


@router.get("/overview")
def overview(user=Depends(current_user), db:Session=Depends(database)):
    connections=rows(run(db,"SELECT * FROM connections WHERE customer=:c ORDER BY label",c=user["customer"]))
    cases=rows(run(db,"""SELECT c.*,n.mode,n.label FROM cases c JOIN connections n ON n.id=c.connection
        WHERE n.customer=:customer ORDER BY c.last_at DESC LIMIT 100""",customer=user["customer"]))
    activity=rows(run(db,"""SELECT a.*,n.mode,n.label FROM activity a JOIN connections n ON n.id=a.connection
        WHERE n.customer=:c ORDER BY received DESC,at DESC LIMIT 40""",c=user["customer"]))
    for event in activity:
        event["source"]=json.loads(event["source"])
    return {"connections":[public_conn(db,c) for c in connections],"cases":cases,"activity":activity}


@router.post("/connections/replay")
def create_replay(user=Depends(roles("admin")),db:Session=Depends(database)):
    identifier="replay-"+digest(user["customer"].encode())[:32]
    cfg={"bucket":"synthetic-files","prefix":"reports/","recovery_bucket":"synthetic-recovery",
         "canary":f"reports/.aegis-canaries/{identifier}/check-1.txt","account":"000000000000","region":"us-east-1",
         "test_role":"arn:aws:iam::000000000000:role/aegis-sandbox/DemoWriter",
         "control_role":"arn:aws:iam::000000000000:role/aegis-sandbox/DemoControl",
         "read_only_actors":["arn:aws:iam::000000000000:role/aegis-sandbox/DemoWriter"]}
    run(db,"""INSERT INTO connections VALUES (:id,:customer,'Practice bucket','replay',:cfg,true,'Ready',:at)
        ON CONFLICT (id) DO NOTHING""",id=identifier,customer=user["customer"],cfg=json.dumps(cfg),at=now())
    db.commit()
    return public_conn(db,connection(db,user,identifier))


@router.get("/connections/{identifier}")
def get_connection(identifier:str,user=Depends(current_user),db:Session=Depends(database)):
    return public_conn(db,connection(db,user,identifier))


@router.get("/connections/{identifier}/activity/{event_id}")
def get_activity(identifier: str, event_id: str, user=Depends(current_user), db:Session=Depends(database)):
    conn = connection(db, user, identifier)
    event = run(db, "SELECT * FROM activity WHERE connection=:conn AND event_id=:event",
                conn=identifier, event=event_id).mappings().first()
    if event is None:
        raise HTTPException(404, "Activity unavailable")
    return dict(event) | {"source": json.loads(event["source"]), "mode": conn["mode"], "label": conn["label"]}


@router.put("/connections/{identifier}/rules")
def configure(identifier:str,ruleset:Rules,user=Depends(roles("admin")),db:Session=Depends(database)):
    connection(db,user,identifier)
    run(db,"UPDATE connections SET health=health WHERE id=:id",id=identifier)
    conn=connection(db,user,identifier)
    cfg=json.loads(conn["config"])
    if ruleset.automatic_triggers and (not cfg.get("test_role") or (conn["mode"]=="aws" and not cfg.get("action_role"))):
        raise HTTPException(409,"Enroll the dedicated writer and control role before enabling automatic response")
    cfg["rules"]=ruleset.model_dump()
    cfg["rule_approval"]={"administrator_id":user["id"],"at":now()}
    run(db,"UPDATE connections SET config=:cfg WHERE id=:id",id=identifier,cfg=json.dumps(cfg))
    db.commit()
    return cfg["rules"]


@router.post("/connections/{identifier}/canaries")
def plant(identifier:str,user=Depends(roles("admin")),db:Session=Depends(database)):
    conn=connection(db,user,identifier)
    try:
        return {"mode":conn["mode"],"canaries":provision(db,conn)}
    except ReviewRequired as exc:
        raise HTTPException(409,str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503,"Setup interrupted. Retry to resume from the stored inventory.") from exc


@router.post("/connections/{identifier}/read-check",status_code=202)
def verify_reads(identifier:str,user=Depends(roles("admin")),db:Session=Depends(database)):
    conn=connection(db,user,identifier)
    try:
        check_reads(db,conn)
    except ReviewRequired as exc:
        raise HTTPException(409,str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503,"The read check was interrupted. Inspect the recorded requests.") from exc
    return read_health(db,conn,json.loads(conn["config"]))


class Deployment(BaseModel):
    connection_id: str
    account: str
    region: str
    bucket: str
    prefix: str


@router.post("/connections/aws")
def activate_selected(selection:Deployment,user=Depends(roles("admin")),db:Session=Depends(database)):
    conn=connection(db,user,selection.connection_id)
    cfg=json.loads(conn["config"])
    if conn["mode"]!="aws" or any(getattr(selection,k)!=cfg[k] for k in ("account","region","bucket","prefix")):
        raise HTTPException(409,"Choose an authorized deployment and its registered scope")
    return enable(conn["id"],True,user,db)


@router.post("/connections/{identifier}/enabled/{enabled}")
def enable(identifier:str,enabled:bool,user=Depends(roles("admin")),db:Session=Depends(database)):
    conn=connection(db,user,identifier)
    if enabled and conn["mode"]=="aws":
        try:
            Cloud(json.loads(conn["config"])).check()
        except ReviewRequired as exc:
            raise HTTPException(409,str(exc)) from exc
        except Exception as exc:
            raise HTTPException(503,"Cannot verify the registered bucket and queue") from exc
    run(db,"UPDATE connections SET enabled=:flag,health=:health WHERE id=:id",flag=enabled,
        health="Awaiting next check" if enabled else "Paused",id=identifier)
    db.commit()
    return public_conn(db,connection(db,user,identifier))


@router.post("/connections/{identifier}/replay/{scenario}")
def run_replay(identifier:str,scenario:Literal["routine","bulk","canary","correlated","canary-overwrite","canary-read","canary-denied","canary-delete","enrolled-bulk"],
               user=Depends(roles("admin","analyst")),db:Session=Depends(database)):
    conn=connection(db,user,identifier)
    if conn["mode"]!="replay" or not conn["enabled"]:
        raise HTTPException(409,"An enabled replay connection is required")
    if json.loads(conn["config"]).get("comparison_lane"):
        raise HTTPException(409, "Start a new comparison exercise for another rehearsal")
    try:
        result=replay(db,conn,scenario)
    except ReviewRequired as exc:
        raise HTTPException(409,str(exc)) from exc
    db.commit()
    return result


@router.put("/exercises/comparison/{exercise_id}")
def start_comparison(exercise_id: UUID, user=Depends(roles("admin")), db:Session=Depends(database)):
    comparison.start(db, user["customer"], exercise_id)
    result = comparison.result(db, user["customer"], exercise_id)
    if result is None:
        raise HTTPException(409, "The comparison exercise is incomplete")
    db.commit()
    return result


@router.get("/exercises/comparison/{exercise_id}")
def get_comparison(exercise_id: UUID, user=Depends(current_user), db:Session=Depends(database)):
    result = comparison.result(db, user["customer"], exercise_id)
    if result is None:
        raise HTTPException(404, "Comparison exercise unavailable")
    return result


def case_report(db,user,identifier):
    case,conn=case_context(db,user,identifier)
    events=events_for(db,case)
    for event in events:
        event["mode"]=conn["mode"]
    jobs=rows(run(db,"""SELECT id,kind,state,payload,result,expires,attempts FROM jobs
        WHERE case_id=:id ORDER BY expires,id""",id=identifier))
    for job in jobs:
        for field in ("payload","result"):
            job[field]=json.loads(job[field])
    history=run(db,"""SELECT count(*) AS previous_events,count(DISTINCT object_key) AS previous_files
        FROM activity WHERE connection=:conn AND actor=:actor AND at<:start""",conn=conn["id"],
        actor=case["actor"],start=case["first_at"]).mappings().one()
    lease=run(db,"SELECT actor,state,until_at,policy FROM restrictions WHERE case_id=:id",id=identifier).mappings().first()
    restriction=({**lease,"policy":json.loads(lease["policy"])} if lease else None)
    return {**case,"metrics":json.loads(case["metrics"]),"restriction":restriction,
            "explanation":explanation(case,events,jobs,conn["mode"]),"history":dict(history),"evidence":json.loads(case["evidence"]),"connection":public_conn(db,conn),"events":events,
            "jobs":jobs,"timeline":rows(run(db,"SELECT * FROM case_log WHERE case_id=:id ORDER BY id",id=identifier))}


@router.get("/cases/{identifier}")
def case_detail(identifier:str,user=Depends(current_user),db:Session=Depends(database)):
    return case_report(db,user,identifier)


@router.get("/cases/{identifier}/export")
def export(identifier:str,user=Depends(current_user),db:Session=Depends(database)):
    return Response(json.dumps(case_report(db,user,identifier),indent=2),media_type="application/json",
                    headers={"Content-Disposition":'attachment; filename="aegis-incident.json"'})


@router.post("/cases/{identifier}/step")
def advance(identifier:str,step:Step,user=Depends(roles("admin","analyst")),db:Session=Depends(database)):
    case,conn=case_context(db,user,identifier,True)
    stage=case["stage"]
    if not conn["enabled"]:
        raise HTTPException(409,"Connection is paused")
    if step.action=="review" and stage=="open":
        stage="review"
    elif step.action=="skip_containment" and stage in ("open","review") and step.reason.strip():
        stage="containment_skipped"
    elif step.action=="close" and stage in ("containment_skipped","reversed","recovered","partial_recovery"):
        active=run(db,"""SELECT count(*) FROM jobs WHERE case_id=:id AND kind NOT IN ('slack','jira')
            AND (state IN ('queued','running') OR (state='preview' AND expires>:at))""",id=identifier,at=now()).scalar()
        restriction=last_restriction(db,identifier)
        if restriction and restriction["kind"]=="restrict":
            raise HTTPException(409,"Reverse the test-role restriction before closure")
        if active or not step.reason.strip():
            raise HTTPException(409,"Finish pending actions and record the closure reason")
        stage="closed"
        notify(db,conn,identifier,"closed")
    else:
        raise HTTPException(409,"This step requires another decision or a reason")
    run(db,"UPDATE cases SET stage=:s WHERE id=:id",s=stage,id=identifier)
    record(db,identifier,user["id"],stage,step.reason)
    db.commit()
    return {"stage":stage}


@router.post("/cases/{identifier}/recovery")
def preview(identifier:str,selection:Selection,user=Depends(roles("admin","analyst")),db:Session=Depends(database)):
    case,conn=case_context(db,user,identifier,True)
    if not conn["enabled"] or case["stage"] not in ("contained","containment_skipped","recovered","reversed","partial_recovery"):
        raise HTTPException(409,"Record a containment decision before recovery")
    cfg=json.loads(conn["config"])
    job=uid()
    affected={e["object_key"] for e in events_for(db,case)}
    items=[]
    skipped=[]
    cloud=Cloud(cfg)
    for index,key in enumerate(dict.fromkeys(selection.keys)):
        if key not in affected:
            raise HTTPException(422,"Choose files from this incident")
        baseline=cfg.get("trusted",{}).get(key)
        canary=run(db,"""SELECT version,sha256 FROM canaries WHERE connection=:c AND object_key=:k
            AND version IS NOT NULL AND sha256 IS NOT NULL""",c=conn["id"],k=key).mappings().first()
        if canary:
            baseline=canary
        if conn["mode"]=="replay" and canary:
            observed=run(db,"SELECT version FROM replay_versions WHERE connection=:c AND object_key=:k AND is_current=true",
                         c=conn["id"],k=key).scalar()
            if not observed:
                baseline=None
        elif conn["mode"]=="replay":
            baseline={"version":"replay-original","sha256":digest(replay_bytes(key))}
            observed="replay-revision"
        elif baseline:
            try:
                observed=cloud.current(key)
            except ReviewRequired:
                baseline=None
            except Exception:
                raise HTTPException(503,"Customer storage is unavailable")
        if not baseline:
            skipped.append(key)
            continue
        items.append(dict(key=key,source=baseline["version"],sha256=baseline["sha256"],observed=observed,
                          destination=f"aegis-recovery/{identifier}/{job}/{index}"))
    if not items:
        raise HTTPException(409,"No selected file has an available trusted baseline")
    payload={"source_bucket":cfg["bucket"],"recovery_bucket":cfg["recovery_bucket"],"items":items,"skipped":skipped}
    queue(db,conn,identifier,"recover",payload,pending=True,job_id=job)
    record(db,identifier,user["id"],"recovery_preview",job)
    db.commit()
    return {"id":job,**payload}


def last_restriction(db,case_id):
    return run(db,"""SELECT j.kind FROM case_log l JOIN jobs j ON j.id=l.detail
        WHERE l.case_id=:id AND l.action IN ('restrict_completed','reverse_completed')
        ORDER BY l.id DESC LIMIT 1""",id=case_id).mappings().first()


@router.post("/cases/{identifier}/containment/{direction}")
def containment(identifier:str,direction:Literal["restrict","reverse"],user=Depends(roles("admin","analyst")),
                db:Session=Depends(database)):
    case,conn=case_context(db,user,identifier,True)
    cfg=json.loads(conn["config"])
    if ((direction=="restrict" and (not conn["enabled"] or not eligible(cfg,case["actor"]))) or case["actor"]!=cfg.get("test_role") or
        (conn["mode"]=="aws" and not cfg.get("action_role")) or (direction=="restrict" and case["rule"] not in ("canary","rolling_bulk") and len(json.loads(case["evidence"]))<2)):
        raise HTTPException(409,"Actor or evidence is ineligible for scoped containment")
    if direction=="reverse" and case["stage"]!="containment_uncertain":
        previous=last_restriction(db,identifier)
        if not previous or previous["kind"]!="restrict":
            raise HTTPException(409,"This case has no verified restriction to reverse")
    allowed=("open","review") if direction=="restrict" else ("contained","containment_uncertain","recovered","partial_recovery")
    if case["stage"] not in allowed:
        raise HTTPException(409,"Containment stage changed")
    lease=run(db,"SELECT * FROM restrictions WHERE case_id=:id",id=identifier).mappings().first()
    payload=proposal(cfg,identifier,case["stage"],direction,lease)
    job=queue(db,conn,identifier,direction,payload,pending=True)
    record(db,identifier,user["id"],"containment_preview",job)
    db.commit()
    return {"id":job,**payload}


@router.post("/cases/{identifier}/jobs/{job_id}/{decision}")
def decide(identifier:str,job_id:str,decision:Literal["approve","reject"],user=Depends(roles("admin")),
           db:Session=Depends(database)):
    case,conn=case_context(db,user,identifier,True)
    job=run(db,"SELECT * FROM jobs WHERE id=:job AND case_id=:id",job=job_id,id=identifier).mappings().first()
    if not job:
        raise HTTPException(404,"Preview unavailable")
    if (not conn["enabled"] and job["kind"]!="reverse") or job["state"]!="preview" or job["expires"]<=now():
        raise HTTPException(409,"Preview expired, already decided or connection paused")
    payload=json.loads(job["payload"])
    if decision=="approve":
        active=run(db,"SELECT count(*) FROM jobs WHERE case_id=:id AND state='queued' AND kind NOT IN ('slack','jira')",id=identifier).scalar()
        if active:
            raise HTTPException(409,"Another approved action is still running")
        if job["kind"] in ("restrict","reverse"):
            if payload["stage"] != case["stage"]:
                raise HTTPException(409,"Case changed since preview")
            if job["kind"]=="restrict" and "policy" in payload:
                try:
                    reserve(db,conn,identifier,payload)
                except ReviewRequired as exc:
                    raise HTTPException(409,str(exc)) from exc
            record(db,identifier,user["id"],"restriction_requested" if job["kind"]=="restrict" else "reversal_requested",job_id)
            run(db,"UPDATE cases SET stage='containment_pending' WHERE id=:id",id=identifier)
        elif case["stage"] not in ("contained","containment_skipped","recovered","reversed","partial_recovery"):
            raise HTTPException(409,"Recovery precondition changed")
    run(db,"UPDATE jobs SET state=:state WHERE id=:job",job=job_id,state="queued" if decision=="approve" else "rejected")
    record(db,identifier,user["id"],decision,job_id)
    db.commit()
    return {"decision":decision}


@router.get("/cases/{identifier}/jobs/{job_id}/files/{index}")
def download(identifier:str,job_id:str,index:int,user=Depends(current_user),db:Session=Depends(database)):
    _,conn=case_context(db,user,identifier)
    job=run(db,"SELECT payload,result FROM jobs WHERE case_id=:id AND id=:job AND kind='recover'",
            id=identifier,job=job_id).mappings().first()
    if not job or index<0 or str(index) not in json.loads(job["result"]).get("verified",{}):
        raise HTTPException(404,"Verified file unavailable")
    item=json.loads(job["payload"])["items"][index]
    if conn["mode"]=="replay":
        content=run(db,"SELECT content FROM replay_copies WHERE destination=:d",d=item["destination"]).scalar_one()
    else:
        try:
            version=json.loads(job["result"])["verified"][str(index)]
            cloud=Cloud(json.loads(conn["config"]))
            content,_=cloud.read(cloud.cfg["recovery_bucket"],item["destination"],version)
        except Exception:
            cached=run(db,"SELECT content FROM replay_copies WHERE destination=:d",d=item["destination"]).scalar_one_or_none()
            if cached is not None:
                content=cached
            else:
                raise HTTPException(503,"Recovered object unavailable")
    if digest(content)!=item["sha256"]:
        raise HTTPException(409,"Read-back checksum mismatch")
    return Response(bytes(content),media_type="application/octet-stream",
                    headers={"Content-Disposition":'attachment; filename="recovered-report"'})
