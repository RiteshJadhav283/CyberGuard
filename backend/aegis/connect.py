"""Register a customer-approved AWS deployment from a trusted operator terminal."""
import argparse
import json
from pathlib import Path

from sqlalchemy.orm import Session

from .cloud import Settings
from .db import engine
from .guardian import run
from .security import uid


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--customer",required=True)
    parser.add_argument("--label",required=True)
    parser.add_argument("settings",type=Path)
    args=parser.parse_args()
    cfg=Settings.model_validate_json(args.settings.read_text()).model_dump()
    with Session(engine) as db,db.begin():
        if not run(db,"SELECT id FROM users WHERE customer=:c AND role='admin' LIMIT 1",c=args.customer).first():
            parser.error("Provision the customer administrator first")
        identifier=uid()
        queue_arn=f"arn:aws:sqs:{cfg['region']}:{cfg['account']}:{cfg['queue_name']}"
        bound=run(db,"""INSERT INTO cloud_bindings (queue_arn,external_id,connection)
            VALUES (:arn,:external,:id) ON CONFLICT DO NOTHING""",arn=queue_arn,external=cfg["external_id"],id=identifier)
        if not bound.rowcount:
            parser.error("This queue or external ID already belongs to a connection")
        run(db,"""INSERT INTO connections VALUES (:id,:c,:label,'aws',:cfg,false,'Awaiting customer activation',0)""",
            id=identifier,c=args.customer,label=args.label,cfg=json.dumps(cfg))
    print(identifier)


if __name__=="__main__":
    main()
