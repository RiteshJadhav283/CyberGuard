"""Bind an operator-provisioned connector to a single customer connection."""
import argparse
import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .cloud import Jira
from .db import engine
from .guardian import run


class Integrations(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slack_env: str = Field(default="", pattern=r"^(AEGIS_SLACK_[A-Z0-9_]+)?$")
    jira: Jira | None = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--customer", required=True)
    parser.add_argument("--connection", required=True)
    parser.add_argument("settings", type=Path)
    args = parser.parse_args()
    change = Integrations.model_validate_json(args.settings.read_text())
    with Session(engine) as db, db.begin():
        updated = run(db, """UPDATE connections SET health=health WHERE id=:id AND customer=:c""",
                      id=args.connection, c=args.customer)
        if not updated.rowcount:
            parser.error("Customer connection unavailable")
        waiting = run(db, """SELECT count(*) FROM jobs WHERE connection=:id AND kind IN ('slack','jira')
            AND state IN ('running','queued')""", id=args.connection).scalar_one()
        if waiting:
            parser.error("Finish pending connector deliveries before changing destinations")
        cfg = json.loads(run(db, "SELECT config FROM connections WHERE id=:id", id=args.connection).scalar_one())
        cfg.update(change.model_dump())
        run(db, "UPDATE connections SET config=:cfg WHERE id=:id", cfg=json.dumps(cfg), id=args.connection)
    print("Integration configuration updated")


if __name__ == "__main__":
    main()
