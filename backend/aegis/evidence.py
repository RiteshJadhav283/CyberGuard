"""Public evidence is structured data. Only static templates generate narrative text."""
import json

from .db import rows, run


def events_for(db, case):
    records=rows(run(db,"""SELECT a.* FROM activity a WHERE a.connection=:c AND
        (a.group_id=:id OR EXISTS (SELECT 1 FROM case_events e WHERE e.case_id=:id
         AND e.connection=a.connection AND e.event_id=a.event_id)) ORDER BY a.at,a.event_id""",
        c=case["connection"],id=case["id"]))
    for event in records:
        event["source"]=json.loads(event["source"])
    return records


def explanation(case, events, jobs, mode):
    metrics=json.loads(case["metrics"])
    by_id={e["event_id"]:e for e in events}
    linked=metrics.get("canary_event_ids") or metrics.get("event_ids") or list(by_id)
    trigger=[by_id[i] for i in linked if i in by_id]
    claims=[]
    if trigger:
        sample=trigger[-1]
        key=json.dumps(sample["object_key"],ensure_ascii=True)
        outcome={"success":"succeeded","denied":"was denied","failed":"failed"}[sample["outcome"]]
        origin="The replay event" if mode=="replay" else "CloudTrail"
        identity=sample["source"]
        actor=json.dumps(sample["actor"],ensure_ascii=True)
        claims.append({"text":f"{origin} recorded {sample['operation']} on {key}. The request {outcome}.",
                       "event_ids":[sample["event_id"]]})
        attribution=f"The recorded principal was {actor}."
        if identity.get("session_arn"):
            attribution+=f" The session was {json.dumps(identity['session_arn'])}."
        if identity.get("source_identity"):
            attribution+=f" AWS supplied source identity {json.dumps(identity['source_identity'])}."
        if identity.get("identity_center_user_id"):
            attribution+=f" The event supplied Identity Center user ID {json.dumps(identity['identity_center_user_id'])}."
        else:
            attribution+=" The event identifies no individual person."
        claims.append({"text":attribution,"event_ids":[sample["event_id"]]})
    for reason in json.loads(case["evidence"]):
        claims.append({"text":reason,"event_ids":linked if case["rule"]=="rolling_bulk" or "canary" in reason.lower() else list(by_id)})
    for job in jobs:
        if job["kind"] not in ("restrict","reverse"):
            continue
        result=job["result"]
        if job["state"]=="done" and result.get("verification"):
            message=result["verification"]
        else:
            message=f"The {job['kind']} job is {job['state']}."
        claims.append({"text":message,"event_ids":linked,"job_ids":[job["id"]]})
    return {"method":"deterministic","mode":mode,"claims":claims}
