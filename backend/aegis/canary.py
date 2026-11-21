"""Plant a new decoy using the customer's setup identity before registering the connection."""
import argparse
import json
from pathlib import Path

from .cloud import Settings
from .security import digest


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("settings",type=Path)
    args=parser.parse_args()
    cfg=Settings.model_validate_json(args.settings.read_text()).model_dump()
    if not cfg["canary"]:
        parser.error("Choose a canary key under the protected prefix first")
    import boto3
    body=b"AEGIS synthetic decoy document. Registered for integrity monitoring.\n"
    s3=boto3.client("s3",region_name=cfg["region"])
    if s3.get_bucket_versioning(Bucket=cfg["bucket"],ExpectedBucketOwner=cfg["account"]).get("Status")!="Enabled":
        parser.error("Enable source versioning before planting the decoy")
    created=s3.put_object(Bucket=cfg["bucket"],Key=cfg["canary"],Body=body,IfNoneMatch="*",
                          ExpectedBucketOwner=cfg["account"])
    version=created.get("VersionId")
    if not version or version=="null":
        parser.error("AWS did not return a usable object version")
    cfg["canary_setup_request"]=created["ResponseMetadata"]["RequestId"]
    cfg["trusted"][cfg["canary"]]={"version":version,"sha256":digest(body)}
    # Print the updated non-secret settings to a distinct file for operator review.
    print(json.dumps(cfg,indent=2))


if __name__=="__main__":
    main()
