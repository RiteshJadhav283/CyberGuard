"""Temporary, purpose-specific AWS sessions. Imported lazily for offline replay."""
import json
import re
from contextlib import closing
from urllib.parse import unquote

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .security import digest

MAX_FILE = 5 * 1024 * 1024


class Baseline(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class Jira(BaseModel):
    model_config = ConfigDict(extra="forbid")
    host: str = Field(pattern=r"^[a-z0-9-]+\.atlassian\.net$")
    project: str = Field(pattern=r"^[A-Z][A-Z0-9_]+$")
    issue_type_id: str = Field(pattern=r"^[0-9]+$")
    email: str = Field(min_length=3,max_length=254)
    token_env: str = Field(pattern=r"^AEGIS_JIRA_[A-Z0-9_]+$")


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account: str = Field(pattern=r"^\d{12}$")
    region: str = Field(pattern=r"^[a-z]{2}-[a-z]+-[0-9]+$")
    bucket: str = Field(pattern=r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
    prefix: str = Field(pattern=r"^[a-zA-Z0-9_./-]+/$")
    recovery_bucket: str = Field(pattern=r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
    queue_name: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    external_id: str = Field(min_length=16, max_length=128)
    monitor_role: str
    recovery_role: str
    action_role: str = ""
    test_role: str = ""
    control_role: str = ""
    canary: str = ""
    read_only_actors: list[str] = []
    burst_threshold: int = Field(default=6, ge=2, le=1000)
    trusted: dict[str, Baseline] = {}
    synthetic_sample_keys: list[str] = []
    canary_setup_request: str = ""
    jira: Jira | None = None
    slack_env: str = Field(default="",pattern=r"^(AEGIS_SLACK_[A-Z0-9_]+)?$")

    @model_validator(mode="after")
    def scope(self):
        if not set(self.synthetic_sample_keys).issubset(self.trusted):
            raise ValueError("Sampled synthetic files require a trusted reference")
        if self.bucket == self.recovery_bucket:
            raise ValueError("Recovery requires a separate bucket")
        if any(not k.startswith(self.prefix) for k in [*self.trusted, *([self.canary] if self.canary else [])]):
            raise ValueError("Canary and trusted keys must be under the protected prefix")
        optional = [self.action_role,self.test_role,self.control_role]
        if any(optional) and not all(optional):
            raise ValueError("Containment requires all three dedicated roles")
        roles = [self.monitor_role,self.recovery_role,*filter(None,optional)]
        pattern = rf"arn:aws:iam::{self.account}:role/[A-Za-z0-9_+=,.@/-]+"
        if self.test_role and not all(":role/aegis-sandbox/" in name for name in (self.test_role,self.control_role)):
            raise ValueError("Containment requires dedicated sandbox roles")
        if len(set(roles)) != len(roles) or not all(re.fullmatch(pattern,r) for r in roles):
            raise ValueError("Use distinct customer-owned roles")
        return self


class ReviewRequired(Exception):
    """A changed precondition requires another operator decision."""


def code(exc):
    return str(getattr(exc,"response",{}).get("Error",{}).get("Code",""))


class Cloud:
    def __init__(self, cfg):
        self.cfg = cfg
        self.sessions = {}

    def client(self, purpose, service):
        import boto3
        role = self.cfg[purpose]
        if role not in self.sessions:
            creds = boto3.client("sts",region_name=self.cfg["region"]).assume_role(
                RoleArn=role,ExternalId=self.cfg["external_id"],RoleSessionName="AEGIS-Guardian"
            )["Credentials"]
            self.sessions[role] = boto3.Session(aws_access_key_id=creds["AccessKeyId"],
                aws_secret_access_key=creds["SecretAccessKey"],aws_session_token=creds["SessionToken"],
                region_name=self.cfg["region"])
        return self.sessions[role].client(service)

    def queue(self):
        client = self.client("monitor_role","sqs")
        url = client.get_queue_url(QueueName=self.cfg["queue_name"],
            QueueOwnerAWSAccountId=self.cfg["account"])["QueueUrl"]
        return client,url

    def check(self):
        s3 = self.client("monitor_role","s3")
        state = s3.get_bucket_versioning(Bucket=self.cfg["bucket"],ExpectedBucketOwner=self.cfg["account"])
        if state.get("Status") != "Enabled":
            raise ReviewRequired("Source bucket versioning is not enabled")
        self.queue()

    def sample(self,key,version):
        client=self.client("monitor_role","s3")
        result=client.get_object(Bucket=self.cfg["bucket"],Key=key,VersionId=version,
                                 ExpectedBucketOwner=self.cfg["account"],Range="bytes=0-65535")
        with closing(result["Body"]) as body:
            return body.read(65536)

    def current(self, key):
        s3 = self.client("recovery_role","s3")
        paginator = s3.get_paginator("list_object_versions")
        for page in paginator.paginate(Bucket=self.cfg["bucket"],Prefix=key,ExpectedBucketOwner=self.cfg["account"]):
            for item in page.get("Versions",[])+page.get("DeleteMarkers",[]):
                if item["Key"] == key and item["IsLatest"]:
                    return item["VersionId"]
            if not page.get("IsTruncated") or page.get("NextKeyMarker","") > key:
                break
        raise ReviewRequired("Current version unavailable")

    def read(self, bucket, key, version=None):
        s3 = self.client("recovery_role","s3")
        args = dict(Bucket=bucket,Key=key,ExpectedBucketOwner=self.cfg["account"])
        if version:
            args["VersionId"] = version
        result = s3.get_object(**args)
        with closing(result["Body"]) as body:
            content = body.read(MAX_FILE+1)
        if len(content)>MAX_FILE:
            raise ReviewRequired("File exceeds the five MiB recovery limit")
        return content,result.get("VersionId","")

    def recover(self, item):
        cfg = self.cfg
        s3 = self.client("recovery_role","s3")
        dest = cfg["recovery_bucket"]
        if s3.get_bucket_versioning(Bucket=dest,ExpectedBucketOwner=cfg["account"]).get("Status") != "Enabled":
            raise ReviewRequired("Recovery bucket versioning is required")
        # First reconcile a previous write whose worker stopped before recording success.
        try:
            content,version = self.read(dest,item["destination"])
        except Exception as exc:
            if code(exc) not in ("404","NoSuchKey","NotFound"):
                raise
            if self.current(item["key"]) != item["observed"]:
                raise ReviewRequired("Current source version changed")
            content,_ = self.read(cfg["bucket"],item["key"],item["source"])
            if digest(content) != item["sha256"]:
                raise ReviewRequired("Trusted checksum mismatch")
            try:
                s3.put_object(Bucket=dest,Key=item["destination"],Body=content,IfNoneMatch="*",
                              ExpectedBucketOwner=cfg["account"])
            except Exception as write_error:
                if code(write_error) not in ("PreconditionFailed","412"):
                    raise
            content,version = self.read(dest,item["destination"])
        if digest(content) != item["sha256"] or version in ("","null"):
            raise ReviewRequired("Destination verification failed")
        return version

    def restrict(self, case_id, reverse=False):
        cfg = self.cfg
        iam = self.client("action_role","iam")
        role = cfg["test_role"].split("/")[-1]
        # The dedicated policy name and case-specific statement prevent another case from reversing it.
        name = "AEGISApprovedTestRestriction"
        policy = {"Version":"2012-10-17","Statement":[{"Sid":"Case"+case_id,"Effect":"Deny",
                  "Action":["s3:PutObject","s3:DeleteObject","s3:DeleteObjectVersion"],
                  "Resource":f"arn:aws:s3:::{cfg['bucket']}/{cfg['prefix']}*"}]}
        try:
            existing = iam.get_role_policy(RoleName=role,PolicyName=name)["PolicyDocument"]
            if isinstance(existing,str):
                existing=json.loads(unquote(existing))
        except Exception as exc:
            if code(exc)!="NoSuchEntity":
                raise
            existing=None
        if existing is not None and existing != policy:
            raise ReviewRequired("Dedicated policy changed or belongs to another case")
        if reverse:
            if existing:
                iam.delete_role_policy(RoleName=role,PolicyName=name)
        elif existing is None:
            self.probe("test_role",case_id)
            self.probe("control_role",case_id)
            iam.put_role_policy(RoleName=role,PolicyName=name,PolicyDocument=json.dumps(policy))
        self.probe("control_role",case_id)
        if reverse:
            self.probe("test_role",case_id)
        else:
            try:
                self.probe("test_role",case_id)
            except Exception as exc:
                if code(exc) in ("AccessDenied","403"):
                    return
                raise
            raise RuntimeError("Restriction is awaiting propagation")

    def probe(self, purpose, case_id):
        client = self.client(purpose,"s3")
        client.put_object(Bucket=self.cfg["bucket"],ExpectedBucketOwner=self.cfg["account"],
            Key=self.cfg["prefix"]+".aegis-probes/"+case_id+"/"+purpose,Body=b"AEGIS access check")


def replay_bytes(key):
    return ("AEGIS synthetic reference\n"+key+"\n").encode()
