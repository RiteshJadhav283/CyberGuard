import json
import unittest
from io import BytesIO
from unittest.mock import patch

import test_recovery as foundation
from sqlalchemy.orm import Session

from aegis.cloud import Cloud, ReviewRequired
from aegis.db import engine
from aegis.guardian import ingest, normalize, run
from aegis.worker import work_job


class OperatorFlow(unittest.IsolatedAsyncioTestCase):
    setUpClass=classmethod(foundation.RecoveryAPI.setUpClass.__func__)
    asyncSetUp=foundation.RecoveryAPI.asyncSetUp
    asyncTearDown=foundation.RecoveryAPI.asyncTearDown

    async def post(self,path,body=None,role="admin"):
        return await self.client.post("ops/"+path,json=body,headers=self.tokens[role])

    async def get(self,path,role="admin"):
        return await self.client.get("ops/"+path,headers=self.tokens[role])

    async def attach(self):
        r=await self.post("connections/replay")
        self.assertEqual(r.status_code,200,r.text)
        return r.json()["id"]

    async def incident(self):
        conn=await self.attach()
        await self.post(f"connections/{conn}/replay/correlated")
        case=(await self.get("overview")).json()["cases"][0]["id"]
        return conn,"cases/"+case

    def process(self,job_id,times=1):
        for _ in range(times):
            with Session(engine) as db,db.begin():
                work_job(db,job_id)

    async def test_replay_signals_and_deduplication(self):
        conn=await self.attach()
        for scenario in ("routine","bulk"):
            r=await self.post(f"connections/{conn}/replay/{scenario}")
            self.assertEqual(r.status_code,200)
            self.assertFalse((await self.get("overview")).json()["cases"])
        await self.post(f"connections/{conn}/replay/canary")
        case=(await self.get("overview")).json()["cases"][0]
        self.assertEqual(case["score"],65)
        self.assertEqual((await self.post(f"cases/{case['id']}/containment/restrict")).status_code,409)
        with Session(engine) as db,db.begin():
            c=run(db,"SELECT * FROM connections WHERE id=:id",id=conn).mappings().one()
            event=run(db,"SELECT * FROM activity WHERE group_id=:g",g=case["id"]).mappings().one()
            ingest(db,c,dict(id=event["event_id"],key=event["object_key"],at=event["at"],actor=event["actor"],op=event["operation"]))
            self.assertEqual(run(db,"SELECT count(*) FROM activity WHERE group_id=:g",g=case["id"]).scalar(),1)

    async def test_full_customer_workflow(self):
        _,case=await self.incident()
        self.assertEqual((await self.get(case,"outsider")).status_code,404)
        restriction=(await self.post(case+"/containment/restrict")).json()["id"]
        self.assertEqual((await self.post(case+"/jobs/"+restriction+"/approve",role="analyst")).status_code,403)
        self.assertEqual((await self.post(case+"/jobs/"+restriction+"/approve")).status_code,200)
        self.process(restriction)
        report=(await self.get(case)).json()
        self.assertEqual(report["stage"],"contained")
        keys=[e["object_key"] for e in report["events"]][:2]
        job=(await self.post(case+"/recovery",{"keys":keys},role="analyst")).json()["id"]
        await self.post(case+"/jobs/"+job+"/approve")
        self.process(job)
        mid=(await self.get(case)).json()
        self.assertEqual(len(next(j for j in mid["jobs"] if j["id"]==job)["result"]["verified"]),1)
        self.process(job,2)
        r=await self.get(case+"/jobs/"+job+"/files/1","viewer")
        self.assertEqual(r.content,("AEGIS synthetic reference\n"+keys[1]+"\n").encode())
        self.assertEqual((await self.post(case+"/step",{"action":"close","reason":"still contained"})).status_code,409)
        undo=(await self.post(case+"/containment/reverse")).json()["id"]
        await self.post(case+"/jobs/"+undo+"/approve")
        self.process(undo)
        r=await self.post(case+"/step",{"action":"close","reason":"Verified selected files and reversed restriction"})
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual((await self.get(case+"/export")).json()["stage"],"closed")

    async def test_connector_retry_survives_worker_restart(self):
        conn = await self.attach()
        with Session(engine) as db, db.begin():
            cfg = json.loads(run(db,"SELECT config FROM connections WHERE id=:id",id=conn).scalar_one())
            cfg["slack_env"] = "AEGIS_SLACK_TEST"
            run(db,"UPDATE connections SET config=:cfg WHERE id=:id",cfg=json.dumps(cfg),id=conn)
        await self.post(f"connections/{conn}/replay/correlated")
        case = (await self.get("overview")).json()["cases"][0]["id"]
        report = (await self.get("cases/"+case)).json()
        job = next(j for j in report["jobs"] if j["kind"]=="slack")["id"]
        with patch("aegis.worker.send_slack",side_effect=OSError("unavailable")):
            self.process(job)
        with Session(engine) as db, db.begin():
            state = run(db,"SELECT state,attempts FROM jobs WHERE id=:id",id=job).one()
            self.assertEqual(tuple(state),("queued",1))
            run(db,"UPDATE jobs SET next_at=0 WHERE id=:id",id=job)
        with patch("aegis.worker.send_slack") as delivery:
            self.process(job,2)
            delivery.assert_called_once()
        self.assertEqual((await self.get("cases/"+case)).json()["jobs"][0]["state"],"done")

    async def test_rename_and_entropy_evidence(self):
        from aegis.guardian import enrich_entropy
        conn_id = await self.attach()
        with Session(engine) as db, db.begin():
            conn=run(db,"SELECT * FROM connections WHERE id=:id",id=conn_id).mappings().one()
            for i in range(3):
                source=f"reports/old-{i}"
                ingest(db,conn,dict(id=f"copy-{i}",key=f"reports/new-{i}",actor="writer",
                                    at=1200+i,op="CopyObject",copy_source="synthetic-files/"+source))
                ingest(db,conn,dict(id=f"delete-{i}",key=source,actor="writer",at=1204+i,op="DeleteObject"))
        case=(await self.get("overview")).json()["cases"][0]
        self.assertIn("copy sources",case["evidence"])
        class Sample:
            cfg={"trusted":{"key":{"version":"before"}},"synthetic_sample_keys":["key"]}
            def sample(self,key,version):
                return b"A"*2048 if version=="before" else bytes(range(256))*8
        event={"key":"key","version":"after"}
        enrich_entropy(Sample(),event)
        self.assertTrue(event["entropy_jump"])

    async def test_queue_acknowledges_only_persisted_valid_events(self):
        from aegis.worker import poll
        conn_id=await self.attach()
        cfg={"account":"111122223333","region":"us-east-1","bucket":"test","prefix":"reports/"}
        with Session(engine) as db,db.begin():
            run(db,"UPDATE connections SET mode='aws',config=:cfg WHERE id=:id",cfg=json.dumps(cfg),id=conn_id)
        event={"source":"aws.s3","detail-type":"AWS API Call via CloudTrail","account":cfg["account"],
               "region":cfg["region"],"detail":{"eventSource":"s3.amazonaws.com","eventName":"PutObject",
               "eventID":"sample","eventTime":"2026-01-01T11:00:00Z",
               "requestParameters":{"bucketName":"test","key":"reports/sample"}}}
        acknowledged=[]
        class Queue:
            def receive_message(self,**kwargs):
                return {"Messages":[{"Body":"invalid","ReceiptHandle":"bad"},
                                    {"Body":json.dumps(event),"ReceiptHandle":"good"}]}
            def delete_message(self,ReceiptHandle,**kwargs):
                with Session(engine) as db:
                    count=run(db,"SELECT count(*) FROM activity WHERE connection=:id",id=conn_id).scalar()
                    assert count==1
                acknowledged.append(ReceiptHandle)
        with patch("aegis.worker.Cloud") as adapter:
            adapter.return_value.queue.return_value=(Queue(),"queue")
            with self.assertRaises(ReviewRequired):
                poll(conn_id)
        self.assertEqual(acknowledged,["good"])

    async def test_scope_pause_and_expiry(self):
        conn,case=await self.incident()
        self.assertEqual((await self.post(case+"/recovery",{"keys":["reports/report-01.txt"]})).status_code,409)
        await self.post(case+"/step",{"action":"skip_containment","reason":"Replay exercise"})
        self.assertEqual((await self.post(case+"/recovery",{"keys":["outside"]})).status_code,422)
        job=(await self.post(case+"/recovery",{"keys":["reports/report-01.txt"]})).json()["id"]
        await self.post(f"connections/{conn}/enabled/false")
        self.assertEqual((await self.post(case+"/jobs/"+job+"/approve")).status_code,409)
        await self.post(f"connections/{conn}/enabled/true")
        with Session(engine) as db,db.begin():
            run(db,"UPDATE jobs SET expires=0 WHERE id=:id",id=job)
        self.assertEqual((await self.post(case+"/jobs/"+job+"/approve")).status_code,409)


class Missing(Exception):
    response={"Error":{"Code":"NoSuchKey"}}


class TestCloud(unittest.TestCase):
    def test_readback_and_interrupted_write_reconciliation(self):
        from aegis.security import digest
        cfg={"bucket":"source","recovery_bucket":"copies","account":"123456789012"}
        item=dict(key="reports/a",destination="out/a",source="v1",observed="v2",sha256=digest(b"original"))
        objects={("source","reports/a","v1"):b"original"}
        class S3:
            def get_bucket_versioning(self,**kwargs):
                return {"Status":"Enabled"}
            def get_object(self,Bucket,Key,VersionId=None,**kwargs):
                if (Bucket,Key,VersionId) not in objects:
                    raise Missing()
                return {"Body":BytesIO(objects[Bucket,Key,VersionId]),"VersionId":"copy-version"}
            def put_object(self,Bucket,Key,Body,IfNoneMatch,**kwargs):
                assert IfNoneMatch=="*" and (Bucket,Key,None) not in objects
                objects[Bucket,Key,None]=Body
        cloud=Cloud(cfg)
        cloud.client=lambda *_:S3()
        cloud.current=lambda _:"v2"
        self.assertEqual(cloud.recover(item),"copy-version")
        self.assertEqual(cloud.recover(item),"copy-version")
        objects["copies","out/a",None]=b"changed"
        with self.assertRaises(ReviewRequired):
            cloud.recover(item)
        item["destination"]="out/b"
        cloud.current=lambda _:"v3"
        with self.assertRaises(ReviewRequired):
            cloud.recover(item)

    def test_scoped_aws_restriction_and_reversal(self):
        cfg = {"account":"111122223333","bucket":"source","prefix":"reports/",
               "test_role":"arn:aws:iam::111122223333:role/aegis-sandbox/test"}
        class Error(Exception):
            def __init__(self,name):
                self.response={"Error":{"Code":name}}
        class IAM:
            policy=None
            def get_role_policy(self,**kwargs):
                if self.policy is None:
                    raise Error("NoSuchEntity")
                return {"PolicyDocument":self.policy}
            def put_role_policy(self,RoleName,PolicyName,PolicyDocument):
                self.policy=json.loads(PolicyDocument)
            def delete_role_policy(self,**kwargs):
                self.policy=None
        iam=IAM()
        class Probe:
            def __init__(self,purpose):
                self.purpose=purpose
            def put_object(self,Key,**kwargs):
                assert Key.startswith("reports/.aegis-probes/")
                if self.purpose=="test_role" and iam.policy:
                    raise Error("AccessDenied")
        client=Cloud(cfg)
        client.client=lambda role,svc:iam if svc=="iam" else Probe(role)
        client.restrict("1234")
        self.assertEqual(iam.policy["Statement"][0]["Resource"],"arn:aws:s3:::source/reports/*")
        with self.assertRaises(ReviewRequired):
            client.restrict("5678",reverse=True)
        client.restrict("1234",reverse=True)
        self.assertIsNone(iam.policy)

    def test_jira_create_and_known_issue_update(self):
        from unittest.mock import MagicMock
        from aegis.jira import sync
        cfg={"jira":{"token_env":"AEGIS_JIRA_EXAMPLE","email":"operator@example.test","host":"example.atlassian.net",
                     "project":"DEMO","issue_type_id":"10001"}}
        def reply(status, body):
            response=MagicMock(status=status)
            response.read.return_value=json.dumps(body).encode()
            return response
        with patch.dict("os.environ",{"AEGIS_JIRA_EXAMPLE":"test-token"}), patch("aegis.jira.http.client.HTTPSConnection") as http:
            client=http.return_value
            client.getresponse.side_effect=[reply(200,{"issues":[]}),reply(201,{"key":"DEMO-1"}),reply(204,{})]
            self.assertEqual(sync(cfg,"case1","open"),"DEMO-1")
            self.assertEqual(sync(cfg,"case1","closed","DEMO-1"),"DEMO-1")
            calls=[(args[0],args[1]) for args,kwargs in client.request.call_args_list]
            self.assertEqual(calls,[("POST","/rest/api/3/search/jql"),("POST","/rest/api/3/issue"),("PUT","/rest/api/3/issue/DEMO-1")])

    def test_slack_redacted_link(self):
        from aegis.worker import send_slack
        with patch.dict("os.environ",{"AEGIS_SLACK_EXAMPLE":"https://hooks.slack.com/services/example",
                                      "AEGIS_PUBLIC_URL":"https://console.example.test"}), patch("aegis.worker.http.client.HTTPSConnection") as http:
            client=http.return_value
            client.getresponse.return_value.status=200
            client.getresponse.return_value.read.return_value=b"ok"
            send_slack({"slack_env":"AEGIS_SLACK_EXAMPLE"},"case1","opened")
            payload=json.loads(client.request.call_args.args[2])
            self.assertEqual(payload,{"text":"AEGIS incident opened · https://console.example.test/?case=case1"})

    def test_audit_attribution_and_filtering(self):
        cfg=dict(account="111122223333",region="us-east-1",bucket="source",prefix="reports/")
        event={"source":"aws.s3","detail-type":"AWS API Call via CloudTrail","region":cfg["region"],"account":cfg["account"],
            "detail":{"eventSource":"s3.amazonaws.com","eventName":"PutObject","eventID":"abc",
            "eventTime":"2026-01-01T11:00:00Z","requestParameters":{"bucketName":"source","key":"reports/test.txt"},
            "userIdentity":{"sessionContext":{"sessionIssuer":{"arn":"test-writer"}}}}}
        self.assertEqual(normalize(event,cfg)["actor"],"test-writer")
        event["detail"]["requestParameters"]["key"]="reports/.aegis-probes/test"
        self.assertIsNone(normalize(event,cfg))
        event["account"]="other"
        self.assertIsNone(normalize(event,cfg))
