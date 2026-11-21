"""Emit the CloudFormation template for an existing customer's protected S3 prefix."""
import json


def sub(value):
    return {"Fn::Sub":value}


def ref(value):
    return {"Ref":value}


def arn(resource):
    return {"Fn::GetAtt":[resource,"Arn"]}


def allow(actions, resources):
    return {"Effect":"Allow","Action":actions,"Resource":resources}


def policy(statements):
    return {"Version":"2012-10-17","Statement":statements}


def role(statements, sandbox=False):
    trust={"Effect":"Allow","Principal":{"AWS":ref("ProviderRoleArn")},"Action":"sts:AssumeRole",
           "Condition":{"StringEquals":{"sts:ExternalId":ref("ExternalId")}}}
    props={"AssumeRolePolicyDocument":policy([trust]),"Policies":[{"PolicyName":"AEGISScope",
           "PolicyDocument":policy(statements)}]}
    if sandbox:
        props.update(Path="/aegis-sandbox/",PermissionsBoundary=ref("ProbeBoundary"))
    return {"Type":"AWS::IAM::Role","Properties":props}


def build():
    source=sub("arn:aws:s3:::${SourceBucket}")
    prefix=sub("arn:aws:s3:::${SourceBucket}/${Prefix}*")
    probe=sub("arn:aws:s3:::${SourceBucket}/${Prefix}.aegis-probes/*")
    recovery=arn("RecoveryBucket")
    copies=sub("${RecoveryBucket.Arn}/aegis-recovery/*")
    source_list=allow("s3:ListBucketVersions",source)
    source_list["Condition"]={"StringLike":{"s3:prefix":sub("${Prefix}*")}}
    writes=allow("s3:PutObject",prefix)
    resources={
      "RecoveryBucket":{"Type":"AWS::S3::Bucket","DeletionPolicy":"Retain","UpdateReplacePolicy":"Retain",
        "Properties":{"VersioningConfiguration":{"Status":"Enabled"},"PublicAccessBlockConfiguration":{
          k:True for k in ("BlockPublicAcls","BlockPublicPolicy","IgnorePublicAcls","RestrictPublicBuckets")}}},
      "FailedEvents":{"Type":"AWS::SQS::Queue","Properties":{"MessageRetentionPeriod":1209600}},
      "Events":{"Type":"AWS::SQS::Queue","Properties":{"VisibilityTimeout":120,
          "RedrivePolicy":{"deadLetterTargetArn":arn("FailedEvents"),"maxReceiveCount":5}}},
      "AuditWrites":{"Type":"AWS::Events::Rule","Properties":{"EventPattern":{"source":["aws.s3"],
        "detail-type":["AWS API Call via CloudTrail"],"detail":{"eventSource":["s3.amazonaws.com"],
        "eventName":["PutObject","CopyObject","CompleteMultipartUpload","DeleteObject"],
        "requestParameters":{"bucketName":[ref("SourceBucket")]}}},"Targets":[{"Arn":arn("Events"),"Id":"Queue"}]}},
      "QueuePolicy":{"Type":"AWS::SQS::QueuePolicy","Properties":{"Queues":[ref("Events")],
        "PolicyDocument":policy([{"Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},
          "Action":"sqs:SendMessage","Resource":arn("Events"),
          "Condition":{"ArnEquals":{"aws:SourceArn":arn("AuditWrites")}}}])}},
      "Observer":role([allow("s3:GetBucketVersioning",source),allow(["sqs:GetQueueUrl","sqs:ReceiveMessage",
            "sqs:DeleteMessage","sqs:GetQueueAttributes"],arn("Events"))]),
      "Recovery":role([source_list,allow("s3:GetObjectVersion",prefix),allow("s3:GetBucketVersioning",recovery),
        allow("s3:ListBucket",recovery),allow(["s3:PutObject","s3:GetObject","s3:GetObjectVersion"],copies)]),
      "ProbeBoundary":{"Type":"AWS::IAM::ManagedPolicy","Condition":"EnableTestActions",
                       "Properties":{"PolicyDocument":policy([writes])}},
      "TestWriter":role([writes],True),"ControlWriter":role([allow("s3:PutObject",probe)],True),
      "Responder":role([allow(["iam:GetRolePolicy","iam:PutRolePolicy","iam:DeleteRolePolicy"],arn("TestWriter"))])
    }
    for name in ("TestWriter","ControlWriter","Responder"):
        resources[name]["Condition"]="EnableTestActions"
    outputs={name:{"Value":arn(name)} for name in ("Observer","Recovery","TestWriter","ControlWriter","Responder")}
    for name in ("TestWriter","ControlWriter","Responder"):
        outputs[name]["Condition"]="EnableTestActions"
    outputs.update(RecoveryBucket={"Value":ref("RecoveryBucket")},QueueName={"Value":{"Fn::GetAtt":["Events","QueueName"]}})
    return {"AWSTemplateFormatVersion":"2010-09-09","Description":"AEGIS customer-owned monitoring and recovery resources",
      "Parameters":{"SourceBucket":{"Type":"String","AllowedPattern":"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"},
      "Prefix":{"Type":"String","Default":"reports/","AllowedPattern":"[A-Za-z0-9_./-]+/"},
      "ProviderRoleArn":{"Type":"String","AllowedPattern":"arn:aws:iam::[0-9]{12}:role/.+"},
      "ExternalId":{"Type":"String","NoEcho":True,"MinLength":16},
      "TestActions":{"Type":"String","Default":"disabled","AllowedValues":["enabled","disabled"]}},
      "Conditions":{"EnableTestActions":{"Fn::Equals":[ref("TestActions"),"enabled"]}},
      "Resources":resources,"Outputs":outputs}


if __name__=="__main__":
    print(json.dumps(build(),indent=2))
