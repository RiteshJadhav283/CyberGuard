"""Bounded, reversible writer restriction with separate AWS and replay adapters."""
import json
import re
from datetime import datetime, timezone
from urllib.parse import unquote

from .canary import receipt
from .cloud import ReviewRequired, code
from .db import run
from .security import now, uid

ACTIONS = ["s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion"]
POLICY_NAME = "AEGISApprovedTestRestriction"


def eligible(cfg, actor):
    if not actor or actor != cfg.get("test_role"):
        return False
    if actor in [cfg.get(k) for k in ("control_role","setup_role","monitor_role","action_role","recovery_role")]:
        return False
    if actor in cfg.get("rules",{}).get("exempt_roles",[]):
        return False
    # The stack's enrolled writer is the only IAM mutation target. Customers must
    # list any organization-specific emergency roles in exempt_roles as well.
    name = actor.rsplit("/",1)[-1].lower()
    return not ("/aws-service-role/" in actor or
                re.search(r"break[^a-z0-9]*glass|emergency|awsservicerolefor|^aegis-(guardian|responder|observer|setup)",name))


def make_policy(cfg, case, until):
    statement = {"Sid":"Case"+case,"Effect":"Deny","Action":ACTIONS,
                 "Resource":f"arn:aws:s3:::{cfg['bucket']}/{cfg['prefix']}*"}
    if until:
        stamp = datetime.fromtimestamp(until,timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        statement["Condition"] = {"DateLessThan":{"aws:CurrentTime":stamp}}
    return {"Version":"2012-10-17","Statement":[statement]}


def proposal(cfg, case, stage, direction, lease=None):
    if direction=="restrict":
        lease=None
    until = lease["until_at"] if lease else (0 if direction=="reverse" else now()+cfg.get("rules",{}).get("ttl_seconds",900))
    policy = json.loads(lease["policy"]) if lease else make_policy(cfg,case,until)
    return dict(actor=cfg["test_role"],bucket=cfg["bucket"],prefix=cfg["prefix"],stage=stage,
                operation=direction,policy=policy,restriction_expires_at=until)


def claim_target(db,conn,case,actor):
    target=actor if conn["mode"]=="aws" else f"replay:{conn['id']}:{actor}"
    run(db,"INSERT INTO action_owners VALUES (:target,:case) ON CONFLICT DO NOTHING",target=target,case=case)
    owner=run(db,"SELECT case_id FROM action_owners WHERE target=:target",target=target).scalar()
    if owner!=case:
        raise ReviewRequired("Another incident holds the enrolled role restriction")


def reserve(db, conn, case, payload):
    if payload["restriction_expires_at"]<=now():
        raise ReviewRequired("Restriction lifetime elapsed. Create a new preview.")
    claim_target(db,conn,case,payload["actor"])
    run(db,"""INSERT INTO restrictions VALUES (:id,:c,:a,:u,'requested',:p)
        ON CONFLICT (case_id) DO UPDATE SET until_at=excluded.until_at,state='requested',policy=excluded.policy
        WHERE restrictions.state IN ('reversed','expired')""",id=case,c=conn["id"],a=payload["actor"],
        u=payload["restriction_expires_at"],p=json.dumps(payload["policy"]))


class AWSActions:
    def __init__(self, cloud, db, conn):
        self.cloud, self.db, self.conn = cloud, db, conn
        self.cfg = cloud.cfg
        self.iam = cloud.client("action_role","iam")
        self.target = dict(RoleName=self.cfg["test_role"].rsplit("/",1)[-1],PolicyName=POLICY_NAME)

    def current(self):
        try:
            doc = self.iam.get_role_policy(**self.target)["PolicyDocument"]
            return json.loads(unquote(doc)) if isinstance(doc,str) else doc
        except Exception as exc:
            if code(exc) != "NoSuchEntity":
                raise
            return None

    def install(self, policy):
        self.iam.put_role_policy(**self.target,PolicyDocument=json.dumps(policy))

    def remove(self):
        self.iam.delete_role_policy(**self.target)

    def probe(self, purpose, case):
        key = f"{self.cfg['prefix']}.aegis-probes/{case}/{uid()}"
        try:
            reply = self.cloud.client(purpose,"s3").put_object(Bucket=self.cfg["bucket"],Key=key,
                ExpectedBucketOwner=self.cfg["account"],Body=b"AEGIS synthetic permission check",IfNoneMatch="*")
            allowed = True
        except Exception as exc:
            if code(exc) not in ("AccessDenied","403"):
                raise
            reply, allowed = exc.response, False
        receipt(self.db,self.conn,reply.get("ResponseMetadata",{}).get("RequestId"),key,"PutObject",self.cfg[purpose])
        return allowed


class ReplayActions:
    def __init__(self, db, conn, cfg):
        self.db,self.conn,self.cfg = db,conn,cfg

    def current(self):
        doc = run(self.db,"SELECT document FROM replay_policies WHERE connection=:c AND actor=:a",
                  c=self.conn,a=self.cfg["test_role"]).scalar()
        return json.loads(doc) if doc else None

    def install(self, policy):
        run(self.db,"INSERT INTO replay_policies VALUES (:c,:a,:p)",c=self.conn,
            a=self.cfg["test_role"],p=json.dumps(policy))

    def remove(self):
        run(self.db,"DELETE FROM replay_policies WHERE connection=:c AND actor=:a",c=self.conn,a=self.cfg["test_role"])

    def probe(self, purpose, case):
        actor = self.cfg.get(purpose,"replay/control")
        doc = run(self.db,"SELECT document FROM replay_policies WHERE connection=:c AND actor=:a",
                  c=self.conn,a=actor).scalar()
        if not doc:
            return True
        statement = json.loads(doc)["Statement"][0]
        deadline = statement.get("Condition",{}).get("DateLessThan",{}).get("aws:CurrentTime")
        resource = f"arn:aws:s3:::{self.cfg['bucket']}/{self.cfg['prefix']}.aegis-probes/{case}"
        denied = ("s3:PutObject" in statement["Action"] and resource.startswith(statement["Resource"][:-1])
                  and (not deadline or datetime.fromisoformat(deadline.replace("Z","+00:00")).timestamp()>now()))
        return not denied


def run_response(db, job, conn, cloud, record):
    cfg, payload = json.loads(conn["config"]), json.loads(job["payload"])
    case, cid, reverse = job["case_id"],conn["id"],job["kind"]=="reverse"
    actor = cfg.get("test_role")
    if not actor or payload.get("actor") != actor or (not reverse and not eligible(cfg,actor)):
        raise ReviewRequired("Enrolled role is unavailable or exempt")
    claim_target(db,conn,case,actor)
    lease = run(db,"SELECT * FROM restrictions WHERE case_id=:id",id=case).mappings().first()
    if not lease:
        # Old approved jobs acquire a bounded plan. Old installed policies can only be removed.
        until = payload.get("restriction_expires_at",0 if reverse else now()+900)
        policy = make_policy(cfg,case,until)
        run(db,"INSERT INTO restrictions VALUES (:id,:c,:a,:u,'requested',:p)",id=case,c=cid,a=actor,
            u=until,p=json.dumps(policy))
    else:
        until,policy = lease["until_at"],json.loads(lease["policy"])
    if payload["bucket"]!=cfg["bucket"] or payload["prefix"]!=cfg["prefix"] or policy!=make_policy(cfg,case,until):
        raise ReviewRequired("Approved restriction scope changed")
    trigger=payload.get("trigger")
    if trigger and not reverse:
        rules=cfg.get("rules",{})
        if trigger not in rules.get("automatic_triggers",[]):
            raise ReviewRequired("Automatic response was disabled before execution")
        if trigger=="rolling_bulk" and payload.get("rule_snapshot")!=rules:
            raise ReviewRequired("Rolling rule changed before execution")
    adapter = AWSActions(cloud,db,cid) if conn["mode"]=="aws" else ReplayActions(db,cid,cfg)
    result = json.loads(job["result"])
    def phase(state):
        run(db,"UPDATE restrictions SET state=:s WHERE case_id=:id",s=state,id=case)
        record(db,case,"worker","restriction_"+state,job["id"])
    if not reverse and until <= now():
        raise ReviewRequired("Restriction lifetime elapsed")
    existing = adapter.current()
    if existing is not None and existing != policy:
        raise ReviewRequired("Reserved policy belongs to another case or was changed")
    if reverse:
        if existing:
            adapter.remove()
        phase("removal_requested")
    elif existing is None:
        baseline = {p:("allowed" if adapter.probe(p,case) else "denied") for p in ("test_role","control_role")}
        result.update(baseline_probes=baseline,mode=conn["mode"])
        run(db,"UPDATE jobs SET result=:r WHERE id=:id",r=json.dumps(result),id=job["id"])
        if any(outcome != "allowed" for outcome in baseline.values()):
            raise ReviewRequired("Both enrolled probes must initially be allowed")
        adapter.install(policy)
        phase("applied")
    elif not lease or lease["state"] not in ("applied","verified"):
        phase("applied")
    probes = {p:("allowed" if adapter.probe(p,case) else "denied") for p in ("test_role","control_role")}
    result.update(probes=probes,mode=conn["mode"])
    run(db,"UPDATE jobs SET result=:r WHERE id=:id",r=json.dumps(result),id=job["id"])
    expected = "allowed" if reverse else "denied"
    if probes["test_role"] != expected or probes["control_role"] != "allowed":
        raise RuntimeError("Probe outcomes awaiting propagation")
    state = "reversed" if reverse else "verified"
    if reverse and payload.get("expiry_cleanup"):
        state = "expired"
    phase(state)
    if reverse:
        run(db,"DELETE FROM action_owners WHERE case_id=:case",case=case)
    run(db,"UPDATE cases SET stage=:s WHERE id=:id",s="reversed" if reverse else "contained",id=case)
    result.pop("error",None)
    result["verification"] = f"{conn['mode']} probes: enrolled PutObject {expected}, control PutObject allowed"
    return result
