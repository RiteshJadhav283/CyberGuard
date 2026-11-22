"""Process queued approvals, Slack deliveries and AWS audit events."""
import argparse
import http.client
import json
import logging
import os
import time
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from functools import partial

from .canary import receipt
from .cloud import Cloud, ReviewRequired, code, replay_bytes
from .db import engine
from .jira import sync as sync_jira
from .guardian import enrich_entropy, ingest, normalize, notify, queue, record, run
from .security import digest, now
from .response import proposal, run_response


def send_slack(cfg, case, phase):
    url=urlsplit(os.environ.get(cfg["slack_env"],""))
    if url.scheme!="https" or url.netloc!="hooks.slack.com" or not url.path.startswith("/services/"):
        raise ReviewRequired("Slack webhook configuration unavailable")
    base=os.getenv("AEGIS_PUBLIC_URL","http://localhost:3000").rstrip("/")
    client=http.client.HTTPSConnection("hooks.slack.com",timeout=8)
    try:
        client.request("POST",url.path,json.dumps({"text":f"AEGIS incident {phase} · {base}/?case={case}"}),
                       {"Content-Type":"application/json"})
        response=client.getresponse()
        if response.status!=200 or response.read(32).strip()!=b"ok":
            raise RuntimeError("Slack delivery failed")
    finally:
        client.close()


def execute(db,job,conn,cloud_factory=Cloud):
    payload=json.loads(job["payload"])
    result=json.loads(job["result"])
    cfg=json.loads(conn["config"])
    cloud=cloud_factory(cfg)
    cloud.on_verified_read=partial(receipt,db,conn["id"])
    mode=conn["mode"]
    case=job["case_id"]
    kind=job["kind"]
    if kind=="jira":
        stage=run(db,"SELECT stage FROM cases WHERE id=:id",id=case).scalar_one()
        earlier=run(db,"SELECT result FROM jobs WHERE kind='jira' AND case_id=:id AND state='done' LIMIT 1",
                    id=case).scalar()
        known_key=json.loads(earlier).get("issue") if earlier else None
        result={"issue":sync_jira(cfg,case,stage,known_key)}
    elif kind=="slack":
        send_slack(cfg,case,payload["phase"])
    elif kind in ("reverse","restrict"):
        result=run_response(db,job,conn,cloud,record)
    elif kind=="recover":
        verified=result.setdefault("verified",{})
        failed=result.setdefault("failed",{})
        # Commit one file per worker transaction. Resume after the last durable result.
        index=next((i for i in range(len(payload["items"])) if str(i) not in verified and str(i) not in failed),None)
        if index is not None:
            item=payload["items"][index]
            try:
                if mode=="aws":
                    version=cloud.recover(item)
                else:
                    content=replay_bytes(item["key"])
                    if item["source"]!="replay-original":
                        version=run(db,"SELECT version FROM replay_versions WHERE connection=:c AND object_key=:k AND is_current=true",
                                    c=conn["id"],k=item["key"]).scalar()
                        if version!=item["observed"]:
                            raise ReviewRequired("Current replay version changed")
                        content=run(db,"SELECT content FROM replay_versions WHERE connection=:c AND object_key=:k AND version=:v",
                                    c=conn["id"],k=item["key"],v=item["source"]).scalar()
                        if content is None or digest(content)!=item["sha256"]:
                            raise ReviewRequired("Trusted replay checksum mismatch")
                    run(db,"""INSERT INTO replay_copies VALUES (:d,:data) ON CONFLICT (destination) DO NOTHING""",
                        d=item["destination"],data=content)
                    copy=run(db,"SELECT content FROM replay_copies WHERE destination=:d",d=item["destination"]).scalar_one()
                    if digest(copy)!=item["sha256"]:
                        raise ReviewRequired("Replay checksum mismatch")
                    version="replay-copy"
                verified[str(index)]=version
            except ReviewRequired as exc:
                failed[str(index)]=str(exc)
            except Exception as exc:
                if job["attempts"]+1<5:
                    raise
                failed[str(index)]=code(exc) or "Storage unavailable after five attempts"
            record(db,case,"worker","file_verified" if str(index) in verified else "file_failed",
                   f"{job['id']} / {index}")
            if len(verified)+len(failed)<len(payload["items"]):
                run(db,"UPDATE jobs SET state='queued',attempts=0,next_at=0,result=:r WHERE id=:id",
                    r=json.dumps(result),id=job["id"])
                return
        complete=not failed and not payload["skipped"]
        stage="recovered" if complete else "partial_recovery"
        run(db,"UPDATE cases SET stage=:s WHERE id=:id",id=case,s=stage)
        notify(db,conn,case,stage)
        if not complete:
            run(db,"UPDATE jobs SET state='partial',result=:r WHERE id=:id",r=json.dumps(result),id=job["id"])
            record(db,case,"worker",stage,job["id"])
            return
    else:
        raise ReviewRequired("Unknown job")
    run(db,"UPDATE jobs SET state='done',result=:r WHERE id=:id",r=json.dumps(result),id=job["id"])
    record(db,case,"worker",kind+"_completed",job["id"])


def work_job(db,identifier,cloud_factory=Cloud):
    job=run(db,"SELECT * FROM jobs WHERE id=:id",id=identifier).mappings().one()
    # Same lock order as operator actions. Uncommitted claims disappear on worker death.
    lock=run(db,"UPDATE connections SET health=health WHERE id=:id AND (enabled=true OR :undo=true)",undo=job["kind"]=="reverse",id=job["connection"])
    if not lock.rowcount:
        return
    claimed=run(db,"UPDATE jobs SET state='running' WHERE id=:id AND state='queued' AND next_at<=:at",
                id=identifier,at=now())
    if not claimed.rowcount:
        return
    job=run(db,"SELECT * FROM jobs WHERE id=:id",id=identifier).mappings().one()
    conn=run(db,"SELECT * FROM connections WHERE id=:id",id=job["connection"]).mappings().one()
    try:
        if job["kind"] not in ("slack","jira","reverse") and job["expires"]<=now():
            raise ReviewRequired("Approval expired before completion")
        execute(db,job,conn,cloud_factory)
    except Exception as exc:
        attempts=job["attempts"]+1
        terminal=isinstance(exc,ReviewRequired) or attempts>=5
        reason=str(exc) if isinstance(exc,ReviewRequired) else (code(exc) or type(exc).__name__)
        result=json.loads(run(db,"SELECT result FROM jobs WHERE id=:id",id=identifier).scalar_one())
        result["error"]=reason
        run(db,"UPDATE jobs SET state=:s,attempts=:n,next_at=:at,result=:r WHERE id=:id",
            s="failed" if terminal else "queued",n=attempts,at=now()+min(120,2**attempts),
            r=json.dumps(result),id=identifier)
        if terminal:
            record(db,job["case_id"],"worker",job["kind"]+"_failed",reason)
            if job["kind"] in ("restrict","reverse"):
                lease=run(db,"SELECT state FROM restrictions WHERE case_id=:id",id=job["case_id"]).scalar()
                if lease:
                    result["last_confirmed_state"]=lease
                    run(db,"UPDATE jobs SET result=:r WHERE id=:id",id=identifier,r=json.dumps(result))
                    run(db,"UPDATE restrictions SET state='failed' WHERE case_id=:id",id=job["case_id"])
                run(db,"UPDATE cases SET stage='containment_uncertain' WHERE id=:id",id=job["case_id"])


def poll(connection_id):
    with Session(engine) as db:
        conn=run(db,"SELECT * FROM connections WHERE id=:id AND enabled=true",id=connection_id).mappings().first()
        if not conn:
            return
        cfg=json.loads(conn["config"])
        cloud=Cloud(cfg)
        cloud.on_verified_read=partial(receipt,db,connection_id)
        cloud.check()
        sqs,url=cloud.queue()
        messages=sqs.receive_message(QueueUrl=url,MaxNumberOfMessages=10,WaitTimeSeconds=1).get("Messages",[])
        failures=0
        for msg in messages:
            try:
                event=normalize(json.loads(msg["Body"]),cfg)
                if event:
                    if event["outcome"]=="success" and event["op"] in ("PutObject","CopyObject","CompleteMultipartUpload"):
                        enrich_entropy(cloud,event)
                    ingest(db,conn,event)
                db.commit()
                sqs.delete_message(QueueUrl=url,ReceiptHandle=msg["ReceiptHandle"])
            except Exception:
                db.rollback()
                failures+=1
        if failures:
            raise ReviewRequired("Queue records awaiting retry")
        run(db,"UPDATE connections SET health='Queue reachable',checked_at=:at WHERE id=:id AND enabled=true",
            at=now(),id=connection_id)
        db.commit()


def expire_jobs(db):
    for job in run(db,"SELECT id,case_id FROM jobs WHERE state='preview' AND expires<=:at",at=now()).mappings():
        changed=run(db,"UPDATE jobs SET state='expired' WHERE id=:id AND state='preview'",id=job["id"])
        if changed.rowcount:
            record(db,job["case_id"],"worker","preview_expired",job["id"])
    leases=run(db,"""SELECT r.* FROM restrictions r WHERE r.until_at>0 AND r.until_at<=:at
        AND r.state NOT IN ('reversed','expired') AND NOT EXISTS
        (SELECT 1 FROM jobs j WHERE j.case_id=r.case_id AND j.kind='reverse' AND
        (j.state IN ('queued','running') OR j.id=r.case_id || :suffix || CAST(r.until_at AS VARCHAR)))""",at=now(),suffix=":expiry:").mappings().all()
    for lease in leases:
        cid,case=lease["connection"],lease["case_id"]
        run(db,"UPDATE connections SET health=health WHERE id=:id",id=cid)
        current=run(db,"SELECT state FROM restrictions WHERE case_id=:id",id=case).scalar_one()
        if current in ("reversed","expired"):
            continue
        conn=run(db,"SELECT * FROM connections WHERE id=:id",id=cid).mappings().one()
        cfg=json.loads(conn["config"])
        run(db,"UPDATE jobs SET state='expired' WHERE case_id=:id AND kind='restrict' AND state='queued'",id=case)
        payload=proposal(cfg,case,"expiry","reverse",lease)
        payload["expiry_cleanup"]=True
        job=queue(db,conn,case,"reverse",payload,job_id=f"{case}:expiry:{lease['until_at']}")
        record(db,case,"worker","expiry_cleanup_requested",job)


def tick():
    with Session(engine) as db, db.begin():
        expire_jobs(db)
        ids=list(run(db,"""SELECT j.id FROM jobs j JOIN connections c ON c.id=j.connection
            WHERE (c.enabled=true OR j.kind='reverse') AND j.state='queued' AND j.next_at<=:at ORDER BY j.next_at,j.expires LIMIT 64""",
            at=now()).scalars())
        connections=list(run(db,"SELECT id FROM connections WHERE mode='aws' AND enabled=true").scalars())
    for identifier in ids:
        with Session(engine) as db, db.begin():
            work_job(db,identifier)
    for identifier in connections:
        try:
            poll(identifier)
        except Exception as exc:
            with Session(engine) as db,db.begin():
                run(db,"UPDATE connections SET health=:s,checked_at=:at WHERE id=:id AND enabled=true",
                    s="Degraded: "+(code(exc) or type(exc).__name__),at=now(),id=identifier)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--once",action="store_true")
    args=parser.parse_args()
    while True:
        try:
            tick()
        except Exception as exc:
            if args.once:
                raise
            logging.error("Worker iteration failed (%s)",type(exc).__name__)
        if args.once:
            break
        time.sleep(2)


if __name__=="__main__":
    main()
