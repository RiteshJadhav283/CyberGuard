# Customer onboarding and acceptance

## Prepare the customer environment

Use an existing private versioned S3 bucket in one AWS commercial Region and select a prefix ending in a slash. AEGIS deploys its own connection resources alongside that bucket. The application that writes customer files is independent.

1. Have the customer enable CloudTrail **S3 object-level write data events** for the selected source bucket and prefix on a logging trail. Review AWS costs and retention first. The stack uses CloudTrail events delivered to the regional EventBridge default bus. The connection can pass its queue and versioning checks before a real object event has arrived. [AWS object event logging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-cloudtrail-logging-for-s3.html) · [S3 event sources](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-s3.html)
2. Generate the stack from the repository root with `python3 guardian/template.py > guardian-template.json`. Review it in CloudFormation. Specify the existing bucket, protected prefix, the exact AEGIS runtime role ARN and a unique random external ID for this customer. Deploy in the same account and Region as the bucket. The stack retains the versioned recovery bucket on removal.
3. Keep **TestActions** disabled for monitoring and recovery only. Enabling it creates two dedicated sandbox roles, a permissions boundary limiting their writes, and a responder role that can manage an inline policy on the sandbox test role. Use these roles solely for the demo. AEGIS expects exclusive management of the reserved inline policy name on that role.
4. Give the AEGIS runtime principal permission to assume only the deployed roles. Use the AWS SDK credential chain in both API and worker processes. Prefer workload roles or short-lived sandbox sessions. The web console receives no AWS credentials.
5. Copy `guardian/settings.example.json` to `customer-settings.json`. Enter the stack outputs, account, Region, source bucket, prefix and external ID. Set `read_only_actors` to the exact role ARNs declared to be read-only in the customer's business workflow. For a containment rehearsal use the stack's sandbox TestWriter as one such declared actor and configure `action_role`, `test_role` and `control_role` from the outputs.
6. For each recoverable object, record an independently reviewed baseline in `trusted`. For example, `"reports/example.txt": {"version":"<exact S3 version ID>","sha256":"<64 lowercase hexadecimal characters>"}`. Obtain the checksum from a trusted original. Missing baselines appear as skipped items. Objects encrypted with a customer-managed key also require least-privilege KMS permissions on the relevant roles and key policy.
7. Optional decoy setup uses customer setup credentials with write permission to the selected, unused canary key. From `backend/`, run `python -m aegis.canary ../customer-settings.json > ../customer-settings-ready.json`. This creates a harmless object conditionally and outputs updated settings with its exact version, hash and setup request ID. Use a distinct output filename. If relying on a pre-existing decoy, register its key and baseline manually.
8. From `backend/`, run `python -m aegis.connect --customer demo --label "Customer reports" ../customer-settings-ready.json` against the same database as the API. Use the original settings filename if the decoy step was skipped. In Compose, copy the reviewed settings file into the API container and run the command with its container path. Operator registration binds the customer to a specific role set and queue. Sign in as that customer's administrator, open **Connections**, inspect the bucket and enable it.

## Live rehearsal

Upload a small harmless revision of a synthetic object through the customer's normal upload path. In **Activity**, check the exact key, operation, owning connection and IAM actor. Compare the event and receipt timestamps in the evidence export. A green queue check alone is insufficient evidence that CloudTrail logging and delivery work.

For a canary rehearsal, upload a prepared harmless revision to the pre-existing synthetic decoy using the designated sandbox role. The case should explain which conditions were observed. Live containment requires two corroborating signals and an exact role match. Review the proposed restriction and approve it in the console. The worker checks scoped writes by the test and control roles and records the outcome. If recovery is the only exercise, record the reason to skip containment.

Open a recovery preview and review every selected source version and destination. Approval expires after 15 minutes. The worker checks the currently observed version, verifies trusted source bytes, writes to a separate bucket with a conditional create, and verifies the stored bytes. Delete markers can serve as the observed revision. The trusted historical source must still be readable. An approved job can resume after a process restart by checking its deterministic destination. Downloaded cloud copies are pinned to the verified destination version.

For optional entropy sampling, list only designated synthetic keys under `synthetic_sample_keys`, each with a trusted baseline. Explicitly grant the monitoring role version-read permission for those keys. AEGIS compares up to 64 KiB per pinned version when the event contains a version ID. A missing sample leaves the remaining signals available.

## Integrations

Set `AEGIS_PUBLIC_URL` to the externally reachable authenticated console address. Supply connector secrets through the worker environment or an injected secret store. Configure each customer separately.

- **Slack.** Put the incoming webhook URL in a customer-specific environment variable such as `AEGIS_SLACK_DEMO`. Set `slack_env` in the customer settings to the name of that variable. The worker sends the incident reference, phase and console link. Failed deliveries have bounded retries. A remote acknowledgement lost during a worker crash can result in a repeated Slack message.
- **Jira Cloud.** Supply a `jira` object containing `host` (the customer's atlassian.net hostname), `project`, `issue_type_id`, `email` and `token_env` (for example `AEGIS_JIRA_DEMO`). Set that environment variable to the API token. The account needs issue search, create and edit permissions. AEGIS looks up an incident label and updates the matching issue description. An uncertain create is recorded for review. [Jira issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)

Both delivery types are durable jobs visible in the incident. Connector failures are recorded separately from recovery outcomes. An administrator should reconcile uncertain deliveries with the external tool before another send.

## Failure handling and teardown

- **No events.** Check connection activation, worker health, trail scope, Region, EventBridge rule match and queue access. Inspect failed or malformed records in the dead-letter queue. The worker leaves unsuccessfully processed records on SQS for redelivery.
- **Missing evidence.** A role match is required for containment. Without a suitable source version and trusted digest, the affected object needs manual review. Fixed five-minute boundaries and late delivery can split related changes between cases.
- **Partial action.** Inspect per-file results and download only verified items. Prepare a new preview for unresolved files after correcting the prerequisite. For a failed containment verification, inspect the dedicated test policy, then preview reversal. Record customer policy changes before retrying.
- **Teardown.** Reverse all active test restrictions and verify both probe roles. Pause the connection, review any queued actions, preserve the case export and remove the AEGIS stack after the customer is ready. Check CloudTrail selectors and remove only the ones created for the exercise. The retained recovery bucket, source versions and decoy stay under customer control. Review them separately for retention and cost.

### Connect notifications to a replay workspace

A replay demo can exercise the notification adapters without an AWS account. Open **Connections**, copy the displayed connection ID. Prepare a small JSON file with the `slack_env` and/or `jira` fields described above. From the backend environment run `python -m aegis.integrations --customer demo --connection CONNECTION_ID integrations.json`. This updates the destinations for subsequent incidents. Both connectors use the worker environment. New replay connections start with external notifications off.
