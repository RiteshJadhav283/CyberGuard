"""Provision local demo accounts and optional synthetic case. No AWS access."""
import argparse
import secrets

from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import engine
from .security import digest, now, password_hash, uid

ORIGINAL = b"MediCore synthetic report 001\nReview status: complete\n"
REVISED = b"MediCore synthetic report 001\nReview status: revised\n"


def add_account(db, customer, role, email, password):
    db.execute(text("""INSERT INTO users (id,customer,role,email,password_hash)
        VALUES (:id,:customer,:role,:email,:hash)"""),
        dict(id=uid(), customer=customer, role=role, email=email, hash=password_hash(password)))


def add_case(db, customer):
    case, candidate, observed = uid(), uid(), uid()
    db.execute(text("""INSERT INTO incidents
        (id,customer,title,object_key,observed,candidate,expected_hash)
        VALUES (:id,:customer,:title,:key,:observed,:candidate,:digest)"""),
        dict(id=case, customer=customer, title="Synthetic report revision",
             key="reports/sample-001.txt", observed=observed, candidate=candidate,
             digest=digest(ORIGINAL)))
    for version, content in [(candidate, ORIGINAL), (observed, REVISED)]:
        db.execute(text("INSERT INTO fixture_versions VALUES (:id,:case,:data)"),
                   dict(id=version, case=case, data=content))
    db.execute(text("""INSERT INTO audit (incident,actor,action,at)
        VALUES (:case,'fixture','sample_revision_recorded',:at)"""), dict(case=case, at=now()))
    return case


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--customer", default="medicore")
    parser.add_argument("--case", action="store_true", help="Add one synthetic incident")
    args = parser.parse_args()
    messages = []
    with Session(engine) as db, db.begin():
        for role in ("viewer", "analyst", "admin"):
            email = f"{role}@{args.customer}.test"
            if not db.execute(text("SELECT id FROM users WHERE email=:email"), {"email": email}).first():
                password = secrets.token_urlsafe(18)
                add_account(db, args.customer, role, email, password)
                messages.append(f"{email}  {password}")
        if args.case:
            messages.append("Sample incident " + add_case(db, args.customer))
    print("\n".join(messages) or "Accounts already exist.")


if __name__ == "__main__":
    main()
