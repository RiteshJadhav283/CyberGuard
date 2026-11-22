"""Register a customer-approved AWS deployment from a trusted operator terminal."""
import argparse
import json
from pathlib import Path

from sqlalchemy.orm import Session

from .cloud import Settings
from .canary import register_legacy
from .db import engine
from .guardian import run
from .security import uid


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--customer",required=True)
    parser.add_argument("--label",required=True)
    parser.add_argument("--upgrade-setup",action="store_true",help="Attach the new setup role to this existing binding")
    parser.add_argument("settings",type=Path)
    args=parser.parse_args()
    cfg=Settings.model_validate_json(args.settings.read_text()).model_dump()
    if cfg["rules"]["automatic_triggers"] and not args.upgrade_setup:
        parser.error("Enable automatic containment after registration as the signed-in customer administrator")
    with Session(engine) as db,db.begin():
        if not run(db,"SELECT id FROM users WHERE customer=:c AND role='admin' LIMIT 1",c=args.customer).first():
            parser.error("Provision the customer administrator first")
        identifier=uid()
        queue_arn=f"arn:aws:sqs:{cfg['region']}:{cfg['account']}:{cfg['queue_name']}"
        if args.upgrade_setup:
            row=run(db,"""SELECT n.* FROM connections n JOIN cloud_bindings b ON n.id=b.connection
                WHERE b.queue_arn=:arn AND b.external_id=:ext AND n.customer=:c""",
                    arn=queue_arn,ext=cfg["external_id"],c=args.customer).mappings().first()
            if not row:
                parser.error("No matching registered customer deployment")
            run(db,"UPDATE connections SET health=health WHERE id=:id",id=row["id"])
            current=json.loads(run(db,"SELECT config FROM connections WHERE id=:id",id=row["id"]).scalar_one())
            if any(cfg[k]!=current.get(k,"") for k in ("account","region","bucket","prefix","monitor_role","recovery_role","test_role","control_role","action_role")):
                parser.error("The existing scope and enrolled roles must match")
            current.update(setup_role=cfg["setup_role"],read_logging_available=cfg["read_logging_available"])
            run(db,"UPDATE connections SET config=:cfg WHERE id=:id",id=row["id"],cfg=json.dumps(current))
            print(row["id"])
            return
        bound=run(db,"""INSERT INTO cloud_bindings (queue_arn,external_id,connection)
            VALUES (:arn,:external,:id) ON CONFLICT DO NOTHING""",arn=queue_arn,external=cfg["external_id"],id=identifier)
        if not bound.rowcount:
            parser.error("This queue or external ID already belongs to a connection")
        run(db,"""INSERT INTO connections VALUES (:id,:c,:label,'aws',:cfg,false,'Awaiting customer activation',0)""",
            id=identifier,c=args.customer,label=args.label,cfg=json.dumps(cfg))
        register_legacy(db,identifier,cfg)
    print(identifier)


if __name__=="__main__":
    main()
