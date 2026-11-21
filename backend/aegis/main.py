import secrets

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import database
from .security import bearer, DUMMY_HASH, current_user, digest, matches, now, roles, uid

app = FastAPI(title="AEGIS")
api = APIRouter(prefix="/api/v1")


class Login(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


@api.get("/health")
def health(db: Session = Depends(database)):
    db.execute(text("SELECT id FROM incidents LIMIT 1"))
    return {"database": "ready", "mode": "local fixture", "aws_connected": False}


@api.post("/auth/login")
def login(body: Login, db: Session = Depends(database)):
    user = db.execute(text("SELECT * FROM users WHERE email=:email"),
                      {"email": body.email.strip().lower()}).mappings().first()
    valid = matches(body.password, user["password_hash"] if user else DUMMY_HASH)
    if not (valid and user):
        raise HTTPException(401, "Invalid sign-in details")
    token = secrets.token_urlsafe(32)
    db.execute(text("INSERT INTO sessions VALUES (:token,:user,:expires)"),
               dict(token=digest(token.encode()), user=user["id"], expires=now() + 3600))
    db.commit()
    return {"access_token": token, "token_type": "bearer"}


@api.post("/auth/logout", status_code=204)
def logout(user=Depends(current_user), token=Depends(bearer), db: Session = Depends(database)):
    db.execute(text("DELETE FROM sessions WHERE digest=:digest AND user_id=:user"),
               dict(digest=digest(token.credentials.encode()), user=user["id"]))
    db.commit()
    return Response(status_code=204)


@api.get("/auth/me")
def me(user=Depends(current_user)):
    return user


def lookup_case(db, user, case_id):
    record = db.execute(text("SELECT * FROM incidents WHERE id=:id AND customer=:customer"),
                        dict(id=case_id, customer=user["customer"])).mappings().first()
    if not record:
        raise HTTPException(404, "Incident unavailable")
    return record


def lookup_plan(db, user, plan_id):
    row = db.execute(text("""SELECT p.* FROM plans p JOIN incidents i ON p.incident=i.id
        WHERE p.id=:id AND i.customer=:customer"""),
        dict(id=plan_id, customer=user["customer"])).mappings().first()
    if not row:
        raise HTTPException(404, "Plan unavailable")
    return row


def audit(db, incident, user, action, plan):
    db.execute(text("""INSERT INTO audit (incident,actor,action,plan,at)
        VALUES (:incident,:actor,:action,:plan,:at)"""),
        dict(incident=incident, actor=user["id"], action=action, plan=plan, at=now()))


@api.get("/incidents")
def incidents(user=Depends(current_user), db: Session = Depends(database)):
    return db.execute(text("""SELECT id,title,object_key FROM incidents
        WHERE customer=:customer ORDER BY id"""), user).mappings().all()


@api.get("/incidents/{case_id}")
def details(case_id: str, user=Depends(current_user), db: Session = Depends(database)):
    case = lookup_case(db, user, case_id)
    plans = db.execute(text("SELECT * FROM plans WHERE incident=:id ORDER BY expires,id"),
                       {"id": case_id}).mappings().all()
    trail = db.execute(text("SELECT action,actor,plan,at FROM audit WHERE incident=:id ORDER BY id"),
                       {"id": case_id}).mappings().all()
    return {**case, "plans": plans, "timeline": trail}


@api.post("/incidents/{case_id}/plans", status_code=201)
def preview(case_id: str, user=Depends(roles("analyst", "admin")), db: Session = Depends(database)):
    case = lookup_case(db, user, case_id)
    plan = uid()
    source = db.execute(text("SELECT content FROM fixture_versions WHERE id=:id AND incident=:case"),
                        dict(id=case["candidate"], case=case_id)).scalar_one_or_none()
    if source is None or digest(source) != case["expected_hash"]:
        raise HTTPException(409, "No verified recovery candidate for this report")
    db.execute(text("""INSERT INTO plans (id,incident,source,observed,expected_hash,destination,expires,status)
        VALUES (:plan,:id,:candidate,:observed,:expected_hash,:destination,:expires,'pending')"""),
        {**case, "plan": plan, "destination": f"recovery/{case_id}/{plan}/sample-001.txt",
         "expires": now() + 900})
    audit(db, case_id, user, "preview_created", plan)
    db.commit()
    return lookup_plan(db, user, plan)


@api.post("/plans/{plan_id}/approve")
def approve(plan_id: str, user=Depends(roles("admin")), db: Session = Depends(database)):
    plan = lookup_plan(db, user, plan_id)
    if plan["status"] == "verified":
        return plan
    if plan["status"] != "pending":
        raise HTTPException(409, "Create a new preview to retry")
    # The compare-and-set claim and the local copy share one transaction.
    # A crash rolls back both. A second approval observes the committed result.
    timestamp = now()
    updated = db.execute(text("""UPDATE plans SET status='approved',approved_by=:actor,approved_at=:at
        WHERE id=:id AND status='pending' AND expires>:at"""),
        dict(actor=user["id"], at=timestamp, id=plan_id))
    if updated.rowcount != 1:
        db.rollback()
        latest = lookup_plan(db, user, plan_id)
        if latest["status"] == "verified":
            return latest
        raise HTTPException(409, "Plan expired or changed. Review a new preview.")
    case = lookup_case(db, user, plan["incident"])
    if case["observed"] != plan["observed"]:
        raise HTTPException(409, "Report changed after preview. Review a new preview.")
    audit(db, case["id"], user, "approved", plan_id)
    source = db.execute(text("SELECT content FROM fixture_versions WHERE id=:id AND incident=:case"),
                        dict(id=plan["source"], case=case["id"])).scalar_one_or_none()
    verified = False
    if source is not None and digest(source) == plan["expected_hash"]:
        db.execute(text("INSERT INTO recovered VALUES (:plan,:content)"),
                   dict(plan=plan_id, content=bytes(source)))
        copy = db.execute(text("SELECT content FROM recovered WHERE plan=:id"),
                          {"id": plan_id}).scalar_one()
        verified = digest(copy) == plan["expected_hash"]
    status = "verified" if verified else "failed"
    db.execute(text("UPDATE plans SET status=:status WHERE id=:id"), dict(status=status, id=plan_id))
    audit(db, case["id"], user, status, plan_id)
    db.commit()
    return lookup_plan(db, user, plan_id)


@api.get("/plans/{plan_id}/file")
def download(plan_id: str, user=Depends(current_user), db: Session = Depends(database)):
    plan = lookup_plan(db, user, plan_id)
    if plan["status"] != "verified":
        raise HTTPException(409, "Verified copy unavailable")
    data = db.execute(text("SELECT content FROM recovered WHERE plan=:id"), {"id": plan_id}).scalar_one()
    if digest(data) != plan["expected_hash"]:
        raise HTTPException(409, "Stored copy failed integrity check")
    return Response(bytes(data), media_type="application/octet-stream",
                    headers={"Content-Disposition": 'attachment; filename="sample-001.txt"'})


app.include_router(api)
