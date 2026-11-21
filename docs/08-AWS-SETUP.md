# CYB-03 — AWS Infrastructure Setup

> Earlier design proposal. For implementation order, permission scope and recovery behavior, use [the approved plan](12-IMPLEMENTATION-PLAN.md). The [README](../README.md) lists the capabilities available in the current checkout.

## Overview

This document describes how to set up the required AWS resources for the CYB-03 test environment. All resources are created in an isolated test environment — never use production buckets.

---

## Required AWS Resources

| Resource | Service | Purpose |
|----------|---------|---------|
| Test S3 Bucket | S3 | Cloud storage to monitor and protect |
| SQS Queue | SQS | Receive S3 event notifications |
| IAM User (system) | IAM | Credentials for our backend application |
| IAM User (attacker sim) | IAM | Simulated compromised credentials |
| CloudTrail Trail | CloudTrail | API activity audit logs |
| Dead-Letter Queue | SQS | Failed event processing |

---

## Step-by-Step Setup

### 1. Create the Test S3 Bucket

```bash
# Create bucket
aws s3api create-bucket \
  --bucket cyb03-test-bucket \
  --region us-east-1

# Enable versioning (REQUIRED for file recovery)
aws s3api put-bucket-versioning \
  --bucket cyb03-test-bucket \
  --versioning-configuration Status=Enabled

# Verify versioning
aws s3api get-bucket-versioning --bucket cyb03-test-bucket
# Expected: {"Status": "Enabled"}
```

### 2. Create SQS Queue

```bash
# Create the main event queue
aws sqs create-queue \
  --queue-name cyb03-events \
  --attributes '{
    "VisibilityTimeout": "60",
    "MessageRetentionPeriod": "345600",
    "ReceiveMessageWaitTimeSeconds": "10"
  }'

# Create dead-letter queue
aws sqs create-queue \
  --queue-name cyb03-events-dlq \
  --attributes '{
    "MessageRetentionPeriod": "1209600"
  }'

# Get DLQ ARN
DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/cyb03-events-dlq \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' --output text)

# Set redrive policy on main queue
aws sqs set-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/cyb03-events \
  --attributes "{\"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\": \\\"${DLQ_ARN}\\\", \\\"maxReceiveCount\\\": 3}\"}"
```

### 3. Configure SQS Queue Policy

The SQS queue must allow S3 to send messages to it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3ToSendMessage",
      "Effect": "Allow",
      "Principal": {
        "Service": "s3.amazonaws.com"
      },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:cyb03-events",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:s3:::cyb03-test-bucket"
        }
      }
    }
  ]
}
```

```bash
aws sqs set-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/cyb03-events \
  --attributes '{"Policy": "<above JSON as escaped string>"}'
```

### 4. Configure S3 Event Notifications

```bash
aws s3api put-bucket-notification-configuration \
  --bucket cyb03-test-bucket \
  --notification-configuration '{
    "QueueConfigurations": [
      {
        "QueueArn": "arn:aws:sqs:us-east-1:ACCOUNT_ID:cyb03-events",
        "Events": [
          "s3:ObjectCreated:*",
          "s3:ObjectRemoved:*"
        ]
      }
    ]
  }'
```

### 5. Create IAM Users

#### System User (our application)

```bash
# Create user
aws iam create-user --user-name cyb03-system

# Create access key
aws iam create-access-key --user-name cyb03-system
# Save AccessKeyId and SecretAccessKey → put in .env
```

**System user policy** (least privilege):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
        "s3:GetBucketVersioning",
        "s3:ListBucketVersions",
        "s3:GetObjectVersion",
        "s3:CopyObject"
      ],
      "Resource": [
        "arn:aws:s3:::cyb03-test-bucket",
        "arn:aws:s3:::cyb03-test-bucket/*"
      ]
    },
    {
      "Sid": "SQSAccess",
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl"
      ],
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:cyb03-events"
    },
    {
      "Sid": "IAMRevocation",
      "Effect": "Allow",
      "Action": [
        "iam:UpdateAccessKey",
        "iam:ListAccessKeys",
        "iam:GetUser",
        "iam:GetAccessKeyLastUsed"
      ],
      "Resource": "arn:aws:iam::ACCOUNT_ID:user/cyb03-attacker-sim"
    },
    {
      "Sid": "CloudTrailRead",
      "Effect": "Allow",
      "Action": [
        "cloudtrail:LookupEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

```bash
aws iam put-user-policy \
  --user-name cyb03-system \
  --policy-name cyb03-system-policy \
  --policy-document file://cyb03-system-policy.json
```

#### Simulated Attacker User

```bash
# Create user
aws iam create-user --user-name cyb03-attacker-sim

# Create access key
aws iam create-access-key --user-name cyb03-attacker-sim
# Save these credentials — the simulation script will use them

# Give it access to the test bucket only
aws iam put-user-policy \
  --user-name cyb03-attacker-sim \
  --policy-name cyb03-attacker-policy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::cyb03-test-bucket",
        "arn:aws:s3:::cyb03-test-bucket/*"
      ]
    }]
  }'
```

### 6. Upload Test Files

```bash
# Create dummy test files
for i in $(seq 1 50); do
  echo "This is test document $i with important company data." > /tmp/test-file-$i.txt
done

# Upload to S3
for i in $(seq 1 50); do
  aws s3 cp /tmp/test-file-$i.txt s3://cyb03-test-bucket/documents/test-file-$i.txt
done

# Upload some "realistic" files
echo "Q3 Budget: Revenue \$2.3M, Expenses \$1.8M, Profit \$500K" > /tmp/Q3-Budget.csv
echo "Employee: John Doe, Department: Engineering, Salary: \$120K" > /tmp/HR-Records.csv
aws s3 cp /tmp/Q3-Budget.csv s3://cyb03-test-bucket/finance/Q3-Budget.csv
aws s3 cp /tmp/HR-Records.csv s3://cyb03-test-bucket/hr/HR-Records.csv
```

### 7. Enable CloudTrail (Optional for Enhanced Identity Attribution)

```bash
# Create trail for data events on the test bucket
aws cloudtrail create-trail \
  --name cyb03-trail \
  --s3-bucket-name cyb03-cloudtrail-logs \
  --is-multi-region-trail false

# Enable data events for S3
aws cloudtrail put-event-selectors \
  --trail-name cyb03-trail \
  --event-selectors '[{
    "ReadWriteType": "WriteOnly",
    "IncludeManagementEvents": false,
    "DataResources": [{
      "Type": "AWS::S3::Object",
      "Values": ["arn:aws:s3:::cyb03-test-bucket/"]
    }]
  }]'

aws cloudtrail start-logging --name cyb03-trail
```

> **Note:** S3 data events in CloudTrail incur additional cost. For the prototype, identity information from S3 event notifications (which include the `principalId`) is usually sufficient.

---

## Environment Variables

After setup, populate the `.env` file:

```env
# AWS Credentials (System User)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1

# Monitored Bucket
S3_MONITORED_BUCKET=cyb03-test-bucket
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/cyb03-events

# Attacker Simulation Credentials (separate!)
SIM_AWS_ACCESS_KEY_ID=AKIA...
SIM_AWS_SECRET_ACCESS_KEY=...
```

---

## Cleanup

When done, remove all test resources:

```bash
# Empty and delete bucket (including all versions)
aws s3api list-object-versions --bucket cyb03-test-bucket \
  --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
  --output json | \
  aws s3api delete-objects --bucket cyb03-test-bucket --delete file:///dev/stdin

aws s3api delete-bucket --bucket cyb03-test-bucket

# Delete SQS queues
aws sqs delete-queue --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/cyb03-events
aws sqs delete-queue --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/cyb03-events-dlq

# Delete IAM users
aws iam delete-user-policy --user-name cyb03-system --policy-name cyb03-system-policy
aws iam delete-access-key --user-name cyb03-system --access-key-id AKIA...
aws iam delete-user --user-name cyb03-system

aws iam delete-user-policy --user-name cyb03-attacker-sim --policy-name cyb03-attacker-policy
aws iam delete-access-key --user-name cyb03-attacker-sim --access-key-id AKIA...
aws iam delete-user --user-name cyb03-attacker-sim

# Delete CloudTrail
aws cloudtrail delete-trail --name cyb03-trail
```

---

## Architecture Diagram (AWS-Specific)

```
┌────────────────────────────────────────────────────┐
│                    AWS Account                      │
│                                                     │
│  ┌─────────────────────┐                           │
│  │  S3: cyb03-test-     │                           │
│  │  bucket              │                           │
│  │  (Versioning ON)     │                           │
│  │                      │──── Event Notification ──▶│
│  └──────────────────────┘                     │     │
│                                               │     │
│  ┌─────────────────────┐                     │     │
│  │  SQS: cyb03-events   │◀────────────────────┘     │
│  │  (Standard Queue)    │                           │
│  └──────────┬───────────┘                           │
│             │                                       │
│  ┌──────────▼───────────┐                           │
│  │  SQS: cyb03-events-  │                           │
│  │  dlq (Dead Letter)   │                           │
│  └──────────────────────┘                           │
│                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐│
│  │  IAM: cyb03-system   │  │ IAM: cyb03-attacker- ││
│  │  (App credentials)   │  │ sim (Test attacker)  ││
│  └──────────────────────┘  └──────────────────────┘│
│                                                     │
│  ┌──────────────────────┐                           │
│  │  CloudTrail:          │                           │
│  │  cyb03-trail          │  (Optional)              │
│  └──────────────────────┘                           │
└─────────────────────────────────────────────────────┘
```

