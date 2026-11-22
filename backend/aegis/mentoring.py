"""Run the authenticated mentoring scenario in a disposable, offline SQLite database."""
import argparse
import json
import os
import secrets
import tempfile
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export",type=Path,help="Save the final synthetic evidence report")
    args=parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        os.environ["DATABASE_URL"] = "sqlite:///"+str(Path(directory)/"mentoring.db")
        from alembic import command
        from alembic.config import Config
        from fastapi.testclient import TestClient
        from sqlalchemy.orm import Session
        from .db import engine
        from .demo import add_account
        from .main import app
        from .worker import tick
        command.upgrade(Config("alembic.ini"),"head")
        password = secrets.token_urlsafe(24)
        with Session(engine) as db, db.begin():
            add_account(db,"medicore","admin","admin@medicore.test",password)
        with TestClient(app,base_url="http://replay/api/v1/") as client:
            def post(path):
                reply=client.post(path)
                reply.raise_for_status()
                return reply.json()
            login=client.post("auth/login",json={"email":"admin@medicore.test","password":password})
            login.raise_for_status()
            client.headers["Authorization"]="Bearer "+login.json()["access_token"]
            conn=post("ops/connections/replay")
            path="ops/connections/"+conn["id"]
            baseline=post(path+"/canaries")["canaries"]
            if len(baseline)!=3 or post(path+"/canaries")["canaries"]!=baseline:
                raise RuntimeError("Provisioning did not yield three stable baselines")
            event=post(path+"/replay/canary-overwrite")
            case_path="ops/cases/"+event["case_ids"][0]
            results={}
            for direction,stage in (("restrict","contained"),("reverse","reversed")):
                job=post(case_path+"/containment/"+direction)["id"]
                post(case_path+"/jobs/"+job+"/approve")
                tick()
                report=client.get(case_path).json()
                result=next(j for j in report["jobs"] if j["id"]==job)
                if report["stage"]!=stage or result["state"]!="done":
                    raise RuntimeError("Worker did not verify "+direction)
                results[direction]=result["result"]
            if args.export:
                evidence=client.get(case_path+"/export")
                evidence.raise_for_status()
                args.export.write_bytes(evidence.content+b"\n")
            print(json.dumps({"mode":"replay","customer":"medicore","provisioned":len(baseline),
                "case_id":report["id"],"event_id":event["event_ids"][0],"actor":report["actor"],
                "results":results,"stage":report["stage"]},indent=2))
        engine.dispose()


if __name__=="__main__":
    main()
