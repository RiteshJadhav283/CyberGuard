"""Provision customer-independent decoys. Durable intent precedes external writes."""
import json
import secrets
from contextlib import closing

from .cloud import Cloud, ReviewRequired, code
from .db import rows, run
from .security import digest, uid


def inventory(db, connection):
    return rows(run(db, """SELECT bucket,object_key,version AS trusted_version_id,sha256,
        setup_request AS setup_request_id,status FROM canaries WHERE connection=:c ORDER BY object_key""",
        c=connection))


def receipt(db, connection, request_id, key, op, actor):
    if request_id and actor:
        run(db, """INSERT INTO receipts VALUES (:c,:r,:k,:op,:actor)
            ON CONFLICT (connection,request_id) DO NOTHING""", c=connection,r=request_id,k=key,op=op,actor=actor)


def register_legacy(db, conn, cfg):
    key = cfg.get("canary")
    if key:
        base = cfg.get("trusted", {}).get(key, {})
        run(db, """INSERT INTO canaries (connection,object_key,bucket,version,sha256,setup_request,status)
            VALUES (:c,:k,:b,:v,:sha,:req,'legacy') ON CONFLICT DO NOTHING""",
            c=conn,k=key,b=cfg["bucket"],v=base.get("version"),sha=base.get("sha256"),
            req=cfg.get("canary_setup_request") or None)


def body_for(intent):
    return f"AEGIS synthetic integrity check\nReference {digest(intent.encode())}\n".encode()


def existing_baseline(client,bucket,item,body,db,cid,cfg):
    key=item["object_key"]
    # Include delete markers. If the current version was deleted, If-None-Match
    # alone would permit a new version at an already-used customer key.
    oldest=None
    for page in client.get_paginator("list_object_versions").paginate(**bucket,Prefix=key):
        for marker in page.get("DeleteMarkers",[]):
            if marker["Key"]==key and (oldest is None or marker["LastModified"]<=oldest[0]):
                oldest=(marker["LastModified"],None)
        for version in page.get("Versions",[]):
            if version["Key"]==key and (oldest is None or version["LastModified"]<oldest[0]):
                oldest=(version["LastModified"],version["VersionId"])
    if oldest is None:
        return None
    if not oldest[1] or oldest[1]=="null":
        return "conflict"
    result=client.get_object(**bucket,Key=key,VersionId=oldest[1],Range=f"bytes=0-{len(body)}")
    receipt(db,cid,result["ResponseMetadata"]["RequestId"],key,"GetObject",cfg["setup_role"])
    with closing(result["Body"]) as stream:
        if result.get("Metadata",{}).get("aegis-intent")!=digest(item["intent"].encode()) or stream.read(len(body)+1)!=body:
            return "conflict"
    return oldest[1]


def provision(db, conn):
    cfg = json.loads(conn["config"])
    cid = conn["id"]
    if conn["mode"] == "aws" and not cfg.get("setup_role"):
        raise ReviewRequired("Register the dedicated setup role for this deployment")
    run(db,"UPDATE connections SET health=health WHERE id=:c",c=cid)
    for index in range(1,4):
        key = f"{cfg['prefix']}.aegis-canaries/{cid}/check-{index}.txt"
        run(db, """INSERT INTO canaries (connection,object_key,bucket,intent,status)
            VALUES (:c,:k,:b,:i,'pending') ON CONFLICT DO NOTHING""",
            c=cid,k=key,b=cfg["bucket"],i=secrets.token_hex(16))
    db.commit()
    keys = list(run(db,"SELECT object_key FROM canaries WHERE connection=:c AND intent IS NOT NULL ORDER BY object_key",
                    c=cid).scalars())
    replacements_this_call=0
    for key in keys:
        run(db,"UPDATE connections SET health=health WHERE id=:c",c=cid)
        item = run(db,"SELECT * FROM canaries WHERE connection=:c AND object_key=:k",c=cid,k=key).mappings().one()
        if item["status"] in ("ready","conflict") or item["version"]:
            db.commit()
            continue
        body = body_for(item["intent"])
        request = item["setup_request"]
        if conn["mode"] == "replay":
            version, request = uid(), uid()
            run(db,"INSERT INTO replay_versions (connection,object_key,version,content) VALUES (:c,:k,:v,:body)",c=cid,k=key,v=version,body=body)
        else:
            cloud = Cloud(cfg, session_name="AEGIS-setup-"+item["intent"])
            client = cloud.client("setup_role","s3")
            # A session name is caller-chosen. Bind its temporary credential ID
            # before the PUT so a lost response can be matched to our actual session.
            run(db,"INSERT INTO setup_sessions VALUES (:c,:k,:h) ON CONFLICT DO NOTHING",
                c=cid,k=key,h=cloud.credential_hashes["setup_role"])
            db.commit()
            run(db,"UPDATE connections SET health=health WHERE id=:c",c=cid)
            item=run(db,"SELECT * FROM canaries WHERE connection=:c AND object_key=:k",c=cid,k=key).mappings().one()
            if item["version"] or item["status"]=="conflict":
                db.commit()
                continue
            request=item["setup_request"]
            bucket = dict(Bucket=cfg["bucket"],ExpectedBucketOwner=cfg["account"])
            if client.get_bucket_versioning(**bucket).get("Status") != "Enabled":
                raise ReviewRequired("Enable bucket versioning before setup")
            version=existing_baseline(client,bucket,item,body,db,cid,cfg)
            if version is None:
                try:
                    result=client.put_object(**bucket,Key=key,Body=body,IfNoneMatch="*",
                                             Metadata={"aegis-intent":digest(item["intent"].encode())})
                    version=result.get("VersionId")
                    request=result["ResponseMetadata"]["RequestId"]
                except Exception as exc:
                    if code(exc) not in ("412","PreconditionFailed"):
                        raise
                    receipt(db,cid,exc.response.get("ResponseMetadata",{}).get("RequestId"),key,"PutObject",cfg["setup_role"])
                    version=existing_baseline(client,bucket,item,body,db,cid,cfg)
            if version=="conflict":
                run(db,"UPDATE canaries SET status='conflict' WHERE connection=:c AND object_key=:k",c=cid,k=key)
                replacement=f"{cfg['prefix']}.aegis-canaries/{cid}/replacement-{uid()}.txt"
                run(db,"""INSERT INTO canaries (connection,object_key,bucket,intent,status)
                    VALUES (:c,:k,:b,:i,'pending')""",c=cid,k=replacement,b=cfg["bucket"],i=secrets.token_hex(16))
                db.commit()
                if replacements_this_call<3:
                    keys.append(replacement)
                    replacements_this_call+=1
                continue
        if not version or version == "null":
            raise ReviewRequired("Storage did not return a versioned object")
        run(db,"""UPDATE canaries SET version=:v,sha256=:sha,setup_request=:r,status=:s
            WHERE connection=:c AND object_key=:k""",v=version,sha=digest(body),r=request,
            s="ready" if request else "awaiting_setup_receipt",c=cid,k=key)
        receipt(db,cid,request,key,"PutObject",cfg.get("setup_role"))
        db.commit()
    return inventory(db,cid)
def check_reads(db, conn):
    """Make pinned, harmless reads. Queue delivery is verified asynchronously."""
    from .security import now
    cfg=json.loads(conn["config"])
    if conn["mode"]!="aws" or not cfg.get("setup_role") or not conn["enabled"]:
        raise ReviewRequired("Read checks require an enabled AWS connection with its setup role")
    cid=conn["id"]
    run(db,"UPDATE connections SET health=health WHERE id=:c",c=cid)
    client=Cloud(cfg).client("setup_role","s3")
    items=run(db,"""SELECT object_key,version FROM canaries WHERE connection=:c
        AND intent IS NOT NULL AND version IS NOT NULL""",c=cid).mappings().all()
    if not items:
        raise ReviewRequired("Provision versioned canaries before starting a read check")
    for item in items:
        key=item["object_key"]
        result=client.get_object(Bucket=cfg["bucket"],Key=key,VersionId=item["version"],
                                 ExpectedBucketOwner=cfg["account"],Range="bytes=0-31")
        with closing(result["Body"]) as stream:
            stream.read(32)
        request=result["ResponseMetadata"]["RequestId"]
        receipt(db,cid,request,key,"GetObject",cfg["setup_role"])
        run(db,"""INSERT INTO read_checks VALUES (:c,:k,:r,:at,NULL)
            ON CONFLICT (connection,object_key) DO UPDATE SET request_id=excluded.request_id,
            requested_at=excluded.requested_at,event_id=NULL""",c=cid,k=key,r=request,at=now())
        # Persist each AWS receipt before the next external operation.
        db.commit()
        run(db,"UPDATE connections SET health=health WHERE id=:c",c=cid)
    db.commit()


def read_health(db, conn, cfg):
    from .security import now
    cid=conn["id"]
    observed=rows(run(db,"SELECT object_key,at,event_id FROM read_observations WHERE connection=:c ORDER BY object_key",c=cid))
    checks=rows(run(db,"SELECT object_key,requested_at,event_id FROM read_checks WHERE connection=:c ORDER BY object_key",c=cid))
    if cfg.get("read_logging_available") is False:
        state="unavailable"
    elif any(not c["event_id"] and now()-c["requested_at"]>=900 for c in checks):
        state="missing_after_probe"
    elif any(not c["event_id"] for c in checks):
        state="awaiting_delivery"
    elif observed:
        state="observed"
    else:
        state="unconfirmed"
    return {"status":state,"mode":conn["mode"],"observations":observed,"checks":checks}
def main():
    """Repeat provisioning from an operator terminal against a registered deployment."""
    import argparse
    from pathlib import Path
    from sqlalchemy.orm import Session
    from .cloud import Settings
    from .db import engine

    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("settings",type=Path)
    args=parser.parse_args()
    cfg=Settings.model_validate_json(args.settings.read_text()).model_dump()
    arn=f"arn:aws:sqs:{cfg['region']}:{cfg['account']}:{cfg['queue_name']}"
    with Session(engine) as db:
        conn=run(db,"""SELECT c.* FROM connections c JOIN cloud_bindings b ON b.connection=c.id
            WHERE b.queue_arn=:arn AND b.external_id=:external""",arn=arn,external=cfg["external_id"]).mappings().first()
        if not conn:
            parser.error("Register the authorized deployment with aegis.connect before provisioning")
        cfg=json.loads(conn["config"])
        try:
            items=provision(db,conn)
        except ReviewRequired as exc:
            parser.error(str(exc))
        for item in items:
            if item["status"]=="ready":
                cfg["trusted"][item["object_key"]]={"version":item["trusted_version_id"],"sha256":item["sha256"]}
        cfg.pop("rule_approval",None)
        print(json.dumps(cfg,indent=2))


if __name__=="__main__":
    main()
