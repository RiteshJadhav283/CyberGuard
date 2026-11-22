import json
import unittest
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import test_operations as workflow
from sqlalchemy.orm import Session

from aegis.db import engine, run
from aegis.guardian import ingest, normalize
from aegis.security import digest, now, uid
from aegis.stream import revision
from aegis.worker import expire_jobs, work_job


class CanaryAcceptance(unittest.IsolatedAsyncioTestCase):
    setUpClass=workflow.OperatorFlow.__dict__["setUpClass"]
    asyncSetUp=workflow.OperatorFlow.asyncSetUp
    asyncTearDown=workflow.OperatorFlow.asyncTearDown
    get=workflow.OperatorFlow.get
    post=workflow.OperatorFlow.post
    attach=workflow.OperatorFlow.attach
    process=workflow.OperatorFlow.process

    def conn(self,db,cid):
        return run(db,"SELECT * FROM connections WHERE id=:id",id=cid).mappings().one()

    async def test_dashboard_comparison_replays_both_lanes_once(self):
        path = "exercises/comparison/" + uid()

        async def start(role):
            return await self.client.put("ops/" + path, headers=self.tokens[role])

        self.assertEqual((await start("analyst")).status_code, 403)
        response = await start("admin")
        self.assertEqual(response.status_code, 200, response.text)
        comparison = response.json()
        self.assertEqual(comparison["mode"], "replay")
        self.assertEqual((await start("admin")).json(), comparison)
        self.assertEqual((await self.get(path, "viewer")).json(), comparison)
        self.assertEqual((await self.get(path, "outsider")).status_code, 404)
        protected, baseline = (comparison["lanes"][lane] for lane in ("protected", "baseline"))
        self.assertIsNone(baseline["case_id"])
        self.assertEqual(protected["object_key"], baseline["object_key"])
        for lane in (protected, baseline):
            self.assertEqual(lane["outcome"], "success")
            self.assertNotEqual(lane["trusted_version_id"], lane["observed_version_id"])
            event_path = f"connections/{lane['connection']}/activity/{lane['event_id']}"
            event = await self.get(event_path, "viewer")
            self.assertEqual(event.json()["mode"], "replay")
            self.assertEqual((await self.get(event_path, "outsider")).status_code, 404)
            self.assertEqual((await self.post(f"connections/{lane['connection']}/replay/canary-overwrite")).status_code, 409)
        case = "cases/" + protected["case_id"]
        restrict = (await self.post(case + "/containment/restrict")).json()["id"]
        await self.post(case + "/jobs/" + restrict + "/approve")
        self.process(restrict)
        recovery = (await self.post(case + "/recovery", {"keys": [protected["object_key"]]})).json()["id"]
        await self.post(case + "/jobs/" + recovery + "/approve")
        self.process(recovery)
        content = await self.get(case + f"/jobs/{recovery}/files/0", "viewer")
        self.assertEqual(content.content, b"MediCore synthetic report\nDemo reference: 001\n")
        updated = (await self.get(path)).json()["lanes"]
        self.assertEqual(updated["protected"]["stage"], "recovered")
        self.assertEqual(updated["baseline"], baseline)

    async def rules(self,cid,**fields):
        reply=await self.client.put(f"ops/connections/{cid}/rules",json=fields,headers=self.tokens["admin"])
        self.assertEqual(reply.status_code,200,reply.text)
        return reply.json()

    async def test_replay_auto_and_reversal_with_tenant_boundaries(self):
        cid=await self.attach()
        path="connections/"+cid
        isolated=digest(self.tokens["outsider"]["Authorization"].split()[1].encode())
        before=revision(isolated)
        self.assertEqual((await self.post(path+"/canaries",role="viewer")).status_code,403)
        self.assertEqual((await self.post(path+"/canaries",role="outsider")).status_code,404)
        baseline=(await self.post(path+"/canaries")).json()["canaries"]
        self.assertEqual(len(baseline),3)
        self.assertEqual((await self.post(path+"/canaries")).json()["canaries"],baseline)
        self.assertTrue(all(i["setup_request_id"] and len(i["sha256"])==64 for i in baseline))
        await self.rules(cid,automatic_triggers=["canary"])
        event=(await self.post(path+"/replay/canary-overwrite")).json()
        case="cases/"+event["case_ids"][0]
        detail=(await self.get(case)).json()
        self.assertEqual(detail["stage"],"containment_pending")
        self.assertEqual(detail["restriction"]["state"],"requested")
        observed=detail["events"][0]
        self.assertEqual(observed["source"]["role_arn"],detail["actor"])
        self.assertIn("Mentoring",observed["source"]["session_arn"])
        self.assertEqual(observed["outcome"],"success")
        self.assertEqual(detail["explanation"]["claims"][0]["event_ids"],event["event_ids"])
        job=detail["jobs"][0]
        self.assertEqual(job["payload"]["policy"]["Statement"][0]["Resource"],"arn:aws:s3:::synthetic-files/reports/*")
        self.process(job["id"],2)
        restricted=(await self.get(case)).json()
        self.assertEqual(restricted["restriction"]["state"],"verified")
        self.assertEqual(restricted["jobs"][0]["result"]["probes"],{"test_role":"denied","control_role":"allowed"})
        second=(await self.post(path+"/replay/canary-overwrite")).json()
        attempt=(await self.get("cases/"+second["case_ids"][0])).json()
        self.assertEqual(attempt["events"][0]["outcome"],"denied")
        self.assertEqual(attempt["jobs"],[])
        self.assertEqual(revision(isolated),before)
        self.assertEqual((await self.get("overview","outsider")).json()["activity"],[])
        for endpoint in (case,case+"/export",path):
            self.assertEqual((await self.get(endpoint,"outsider")).status_code,404)
        self.assertEqual((await self.post(case+"/containment/reverse",role="outsider")).status_code,404)
        self.assertEqual((await self.post(case+"/containment/reverse",role="viewer")).status_code,403)
        reversal=(await self.post(case+"/containment/reverse")).json()["id"]
        self.assertEqual((await self.post(case+"/jobs/"+reversal+"/approve",role="analyst")).status_code,403)
        await self.post(case+"/jobs/"+reversal+"/approve")
        self.process(reversal)
        exported=(await self.get(case+"/export","viewer")).json()
        self.assertEqual(exported["restriction"]["state"],"reversed")
        self.assertEqual(next(j for j in exported["jobs"] if j["id"]==reversal)["result"]["probes"],
                         {"test_role":"allowed","control_role":"allowed"})
        with Session(engine) as db:
            for item in baseline:
                data=run(db,"SELECT content FROM replay_versions WHERE connection=:c AND version=:v",
                         c=cid,v=item["trusted_version_id"]).scalar_one()
                self.assertEqual(digest(data),item["sha256"])

    async def test_canary_reads_delete_denial_and_exemption(self):
        cid=await self.attach()
        path="connections/"+cid
        await self.post(path+"/canaries")
        conn=(await self.get(path)).json()
        self.assertEqual(conn["read_monitoring"]["status"],"unconfirmed")
        await self.rules(cid,automatic_triggers=["canary"],exempt_roles=[conn["enrolled_role"]])
        for scenario,op,outcome in (("canary-denied","GetObject","denied"),("canary-read","GetObject","success"),
                                    ("canary-delete","DeleteObject","success")):
            event=(await self.post(path+"/replay/"+scenario)).json()
            report=(await self.get("cases/"+event["case_ids"][0])).json()
            self.assertEqual((report["events"][0]["operation"],report["events"][0]["outcome"]),(op,outcome))
            self.assertEqual(report["jobs"],[])
        self.assertEqual((await self.get(path)).json()["read_monitoring"]["status"],"observed")

    async def test_rolling_distinct_late_overlap_and_scheduled_jobs(self):
        cid=await self.attach()
        role=(await self.get("connections/"+cid)).json()["enrolled_role"]
        await self.rules(cid,bulk_enabled=True,window_seconds=10,threshold=3,automatic_triggers=["rolling_bulk"])
        def event(db,t,key,identifier=None):
            return ingest(db,self.conn(db,cid),dict(id=identifier or uid(),key="reports/"+key,at=t,actor=role,
                op="PutObject",source={"role_arn":role,"session_arn":"replay/rolling"}))
        with Session(engine) as db, db.begin():
            event(db,302,"b","duplicate")
            event(db,302,"b","duplicate")
            event(db,305,"c")
            event(db,304,"b")
            self.assertIsNone(run(db,"SELECT id FROM cases WHERE connection=:c AND rule='rolling_bulk'",c=cid).scalar())
            case=event(db,298,"a")
            self.assertTrue(case)
            event(db,306,"d")
            event(db,307,"e")
            self.assertEqual(run(db,"SELECT count(*) FROM cases WHERE connection=:c AND rule='rolling_bulk'",c=cid).scalar(),1)
        report=(await self.get("cases/"+case)).json()
        self.assertEqual(report["metrics"]["observed_count"],5)
        self.assertEqual(report["metrics"]["threshold"],3)
        self.assertEqual(report["metrics"]["window_seconds"],10)
        self.assertEqual(len(report["events"]),6)
        self.assertEqual(len(report["jobs"]),1)
        await self.rules(cid,bulk_enabled=True,threshold=3,window_seconds=10,scheduled_jobs=[
            dict(role=role,weekdays=list(range(7)),start_minute_utc=0,end_minute_utc=1440)])
        with Session(engine) as db, db.begin():
            for n in range(4):
                event(db,900+n,str(n))
            self.assertEqual(run(db,"SELECT count(*) FROM cases WHERE connection=:c AND rule='rolling_bulk'",c=cid).scalar(),1)

    async def test_expiry_reverses_while_paused(self):
        cid=await self.attach()
        await self.post(f"connections/{cid}/canaries")
        await self.rules(cid,automatic_triggers=["canary"],ttl_seconds=60)
        event=(await self.post(f"connections/{cid}/replay/canary-overwrite")).json()
        case=event["case_ids"][0]
        job=(await self.get("cases/"+case)).json()["jobs"][0]["id"]
        self.process(job)
        await self.post(f"connections/{cid}/enabled/false")
        with patch("aegis.worker.now",return_value=now()+61):
            with Session(engine) as db,db.begin():
                expire_jobs(db)
            with Session(engine) as db:
                cleanup=run(db,"SELECT id FROM jobs WHERE case_id=:id AND kind='reverse'",id=case).scalar_one()
            self.process(cleanup)
        report=(await self.get("cases/"+case)).json()
        self.assertEqual(report["restriction"]["state"],"expired")
        self.assertEqual(report["stage"],"reversed")

    async def test_aws_setup_reconciliation_foreign_collision_and_read_check(self):
        cid=await self.attach()
        path="connections/"+cid
        with Session(engine) as db,db.begin():
            cfg=json.loads(self.conn(db,cid)["config"])
            cfg.update(setup_role="arn:aws:iam::000000000000:role/Setup",canary="")
            run(db,"UPDATE connections SET mode='aws',config=:cfg WHERE id=:c",cfg=json.dumps(cfg),c=cid)
        data={}
        keys=[f"reports/.aegis-canaries/{cid}/check-{i}.txt" for i in range(1,4)]
        data[keys[2]]=(b"customer-owned",{},"foreign")
        requests=[]
        class S3:
            interrupted=False
            def get_bucket_versioning(self,**kwargs):
                return {"Status":"Enabled"}
            def get_paginator(self,name):
                return self
            def paginate(self,Prefix,**kwargs):
                return [{"Versions":[dict(Key=k,VersionId=v[2],LastModified=1) for k,v in data.items() if k==Prefix]}]
            def put_object(self,Key,Body,Metadata,IfNoneMatch,**kw):
                assert IfNoneMatch=="*" and Key not in data
                version=uid()
                data[Key]=(Body,Metadata,version)
                if Key==keys[1] and not self.interrupted:
                    self.interrupted=True
                    raise TimeoutError()
                return {"VersionId":version,"ResponseMetadata":{"RequestId":uid()}}
            def get_object(self,Key,**kwargs):
                body,meta,version=data[Key]
                request=uid()
                requests.append((Key,request))
                return {"VersionId":version,"Metadata":meta,"Body":BytesIO(body),"ResponseMetadata":{"RequestId":request}}
        s3=S3()
        def client(cloud,*args):
            cloud.credential_hashes["setup_role"]=digest(b"fixture access id")
            return s3
        with patch("aegis.canary.Cloud.client",client):
            self.assertEqual((await self.post(path+"/canaries")).status_code,503)
            statuses=(await self.post(path+"/canaries")).json()["canaries"]
            self.assertEqual([x["status"] for x in statuses],["ready","awaiting_setup_receipt","conflict","ready"])
            self.assertEqual(data[keys[2]][0],b"customer-owned")
            with Session(engine) as db,db.begin():
                intent=run(db,"SELECT intent FROM canaries WHERE connection=:c AND object_key=:k",c=cid,k=keys[1]).scalar_one()
                event=dict(id=uid(),credential_hash=digest(b"fixture access id"),op="PutObject",key=keys[1],actor=cfg["setup_role"],at=now(),outcome="success",
                    source={"request_id":"original","session_arn":"arn:aws:sts::000000000000:assumed-role/Setup/AEGIS-setup-"+intent})
                ingest(db,self.conn(db,cid),event)
                self.assertEqual(run(db,"SELECT setup_request FROM canaries WHERE connection=:c AND object_key=:k",
                                     c=cid,k=keys[1]).scalar(),"original")
                # Same identity, different request is still a canary incident.
                event.update(id=uid(),source={"request_id":"unexpected"})
                self.assertTrue(ingest(db,self.conn(db,cid),event))
            result=await self.post(path+"/read-check")
            self.assertEqual(result.status_code,202,result.text)
            self.assertEqual(result.json()["status"],"awaiting_delivery")
        with Session(engine) as db,db.begin():
            for key,request in requests[-3:]:
                ingest(db,self.conn(db,cid),dict(id=uid(),op="GetObject",key=key,actor=cfg["setup_role"],
                    at=now(),outcome="success",source={"request_id":request}))
            self.assertEqual(run(db,"SELECT count(*) FROM activity WHERE connection=:c",c=cid).scalar(),1)
        self.assertEqual((await self.get(path)).json()["read_monitoring"]["status"],"observed")

    async def test_aws_action_adapter_propagation_conflict_and_verified_undo(self):
        cid=await self.attach()
        path="connections/"+cid
        item=(await self.post(path+"/canaries")).json()["canaries"][0]
        await self.rules(cid,automatic_triggers=["canary"])
        with Session(engine) as db,db.begin():
            cfg=json.loads(self.conn(db,cid)["config"])
            cfg["action_role"]="arn:aws:iam::000000000000:role/responder"
            run(db,"UPDATE connections SET mode='aws',config=:cfg WHERE id=:c",c=cid,cfg=json.dumps(cfg))
            message={"source":"aws.s3","detail-type":"AWS API Call via CloudTrail","account":cfg["account"],
                "region":cfg["region"],"detail":{"eventSource":"s3.amazonaws.com","eventName":"PutObject",
                "eventID":uid(),"eventTime":datetime.now(timezone.utc).isoformat(),"sourceIPAddress":"192.0.2.22",
                "userIdentity":{"type":"AssumedRole","arn":"arn:aws:sts::000000000000:assumed-role/DemoWriter/fixture",
                                "sessionContext":{"sessionIssuer":{"arn":cfg["test_role"]}}},
                "requestParameters":{"bucketName":cfg["bucket"],"key":item["object_key"]}}}
            case=ingest(db,self.conn(db,cid),normalize(message,cfg))
            self.assertIsNone(ingest(db,self.conn(db,cid),normalize(message,cfg)))
        class Error(Exception):
            def __init__(self,code):
                self.response={"Error":{"Code":code},"ResponseMetadata":{"RequestId":uid()}}
        class IAM:
            policy=None
            propagation=False
            def get_role_policy(self,RoleName,**kw):
                assert RoleName=="DemoWriter"
                if self.policy is None:
                    raise Error("NoSuchEntity")
                return {"PolicyDocument":self.policy}
            def put_role_policy(self,RoleName,PolicyDocument,**kw):
                assert RoleName=="DemoWriter"
                self.policy=json.loads(PolicyDocument)
            def delete_role_policy(self,RoleName,**kw):
                assert RoleName=="DemoWriter"
                self.policy=None
        iam=IAM()
        class Probe:
            def __init__(self,role):
                self.role=role
            def put_object(self,Key,**kw):
                assert Key.startswith("reports/.aegis-probes/")
                if self.role=="test_role" and iam.policy and iam.propagation:
                    raise Error("AccessDenied")
                return {"ResponseMetadata":{"RequestId":uid()}}
        class Adapter:
            def __init__(self,cfg):
                self.cfg=cfg
            def client(self,purpose,service):
                return iam if service=="iam" else Probe(purpose)
        def process(job):
            with Session(engine) as db,db.begin():
                run(db,"UPDATE jobs SET next_at=0 WHERE id=:id",id=job)
                work_job(db,job,Adapter)
        case_path="cases/"+case
        job=(await self.get(case_path)).json()["jobs"][0]["id"]
        process(job)
        report=(await self.get(case_path)).json()
        self.assertEqual(report["restriction"]["state"],"applied")
        self.assertEqual(report["jobs"][0]["state"],"queued")
        self.assertIn("DateLessThan",iam.policy["Statement"][0]["Condition"])
        iam.propagation=True
        process(job)
        self.assertEqual((await self.get(case_path)).json()["restriction"]["state"],"verified")
        reversal=(await self.post(case_path+"/containment/reverse")).json()["id"]
        await self.post(case_path+"/jobs/"+reversal+"/approve")
        owned=iam.policy
        iam.policy={"customer":"edited"}
        process(reversal)
        report=(await self.get(case_path)).json()
        self.assertEqual(iam.policy,{"customer":"edited"})
        self.assertEqual(report["restriction"]["state"],"failed")
        self.assertEqual(report["stage"],"containment_uncertain")
        iam.policy=owned
        redo=(await self.post(case_path+"/containment/reverse")).json()["id"]
        await self.post(case_path+"/jobs/"+redo+"/approve")
        process(redo)
        self.assertIsNone(iam.policy)
        self.assertEqual((await self.get(case_path)).json()["restriction"]["state"],"reversed")

    async def test_missing_read_telemetry_and_role_scoped_onboarding(self):
        cid=await self.attach()
        with Session(engine) as db,db.begin():
            cfg=json.loads(self.conn(db,cid)["config"])
            run(db,"UPDATE connections SET mode='aws',enabled=false WHERE id=:c",c=cid)
        selection={k:cfg[k] for k in ("account","region","bucket","prefix")}
        selection["connection_id"]=cid
        self.assertEqual((await self.post("connections/aws",selection,role="outsider")).status_code,404)
        self.assertEqual((await self.post("connections/aws",selection,role="analyst")).status_code,403)
        self.assertEqual((await self.post("connections/aws",{**selection,"prefix":"other/"})).status_code,409)
        with patch("aegis.operations.Cloud.check") as check:
            reply=await self.post("connections/aws",selection)
            check.assert_called_once()
        self.assertEqual(reply.json()["read_monitoring"]["status"],"unconfirmed")
        with Session(engine) as db,db.begin():
            run(db,"INSERT INTO read_checks VALUES (:c,'sample','receipt',:at,NULL)",c=cid,at=now()-1000)
        self.assertEqual((await self.get("connections/"+cid)).json()["read_monitoring"]["status"],"missing_after_probe")


class DeploymentChecks(unittest.TestCase):
    def test_selector_and_routing_contract(self):
        import runpy
        from aegis.guardian import WRITES, READS
        template=runpy.run_path(str(Path(__file__).resolve().parents[2]/"guardian/template.py"))["build"]()
        resources=template["Resources"]
        for name,ops in (("AuditReads",READS),("AuditWrites",WRITES)):
            detail=resources[name]["Properties"]["EventPattern"]["detail"]
            self.assertEqual(set(detail["eventName"]),ops)
            self.assertIn("key",detail["requestParameters"])
        trail=resources["CanaryTrail"]["Properties"]
        self.assertEqual(len(trail["AdvancedEventSelectors"]),3)
        self.assertIn(".aegis-canaries/",json.dumps(trail["AdvancedEventSelectors"][1]))
        self.assertNotIn("iam:",json.dumps(resources["Setup"]))
        self.assertNotIn("s3:PutObject",json.dumps(resources["Observer"]))

    def test_role_exclusions(self):
        from aegis.response import eligible
        for role in ("arn:aws:iam::111122223333:role/aws-service-role/example/AWSServiceRoleForS3",
                     "arn:aws:iam::111122223333:role/aegis-sandbox/BreakGlass",
                     "arn:aws:iam::111122223333:role/aegis-sandbox/EmergencyWriter"):
            self.assertFalse(eligible({"test_role":role},role))
        self.assertFalse(eligible({"test_role":"writer","setup_role":"writer"},"writer"))
        self.assertFalse(eligible({"test_role":"writer"},"other"))

    def test_0002_upgrade_preserves_legacy_baseline_and_active_policy(self):
        import os
        import sqlite3
        import subprocess
        import sys
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"migration.db"
            env={**os.environ,"DATABASE_URL":"sqlite:///"+str(path)}
            def migrate(version):
                subprocess.run([sys.executable,"-m","alembic","upgrade",version],env=env,check=True,capture_output=True)
            migrate("0002")
            key="reports/old.txt"
            cfg=dict(bucket="source",prefix="reports/",canary=key,canary_setup_request="aws-receipt",
                     trusted={key:dict(version="v1",sha256=digest(b"sample"))})
            with sqlite3.connect(path) as db:
                db.execute("INSERT INTO connections VALUES ('c','customer','label','replay',?,1,'Ready',0)",(json.dumps(cfg),))
                db.execute("INSERT INTO cases VALUES ('a','c','writer',80,'[]','contained',1,2)")
                plan=json.dumps(dict(actor="writer",bucket="source",prefix="reports/"))
                db.execute("INSERT INTO jobs VALUES ('job','c','a','restrict',?,'done',1,0,0,'{}')",(plan,))
                db.execute("INSERT INTO case_log (case_id,at,actor,action,detail) VALUES ('a',1,'worker','restrict_completed','job')")
            migrate("head")
            with sqlite3.connect(path) as db:
                row=db.execute("SELECT object_key,version,sha256,setup_request,status FROM canaries").fetchone()
                self.assertEqual(row,(key,"v1",digest(b"sample"),"aws-receipt","legacy"))
                state,until,policy=db.execute("SELECT state,until_at,policy FROM restrictions").fetchone()
                self.assertEqual((state,until),("verified",0))
                self.assertNotIn("Condition",json.loads(policy)["Statement"][0])
                self.assertEqual(db.execute("SELECT case_id FROM action_owners").fetchone(),("a",))
