# Connecting AEGIS to two MediCore environments

**Review draft.** Use the same MediCore release twice. Environment A is the AWS baseline. Environment B uses the same AWS controls plus AEGIS. The first milestone is seeing an ordinary upload from B in AEGIS while an equivalent upload from A stays outside its scope.

## What already works in the code

AEGIS connects to AWS beside the application. MediCore can use Python, Node.js, Java or another language. Its existing upload path must ultimately write to the configured S3 bucket and key prefix (the part of the file name that acts like a folder). The Vercel frontend needs only the correct MediCore endpoint for its environment.

For example, a user uploads a synthetic report through the portal. MediCore writes it to S3. With object-level logging enabled, AWS CloudTrail records the storage operation. EventBridge routes matching records into SQS, a message queue. The AEGIS worker reads that queue, checks the customer, Region, bucket and prefix, and records the activity. Related changes can open an incident. No AEGIS library, API call or password belongs in MediCore's upload handler. An upload directly from the browser using a signed S3 URL can also produce an S3 event. The AWS signing identity and the person using the portal are separate pieces of evidence. [AWS object logging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-cloudtrail-logging-for-s3.html)

| Area | What the current checkout implements | What the live demo still needs |
|---|---|---|
| AWS connection | Customer stack, scoped temporary roles, a queue, a separate versioned recovery bucket and optional sandbox roles. Registration uses a settings file and a command, then an administrator activates the connection. | Verify the trail includes the intended S3 writes and prove actual delivery. The stack assumes the customer has enabled object-level logging. |
| Detection | Successful uploads, copies, multipart completions and individual deletes. Rules combine changed-file counts, decoy activity and identity behavior. Duplicate event IDs count once. | Verify MediCore's exact operations and prefix. A large batch alone scores 35 against a threshold of 60. Simultaneous role sessions can currently be grouped under the same role. |
| Identity | AEGIS extracts the AWS role behind an observed S3 operation when available. Live restriction targets only the explicitly configured sandbox writer after approval. | Role assumption, denied calls, source IP and individual session evidence need additional handling. An application user needs separate application-level attribution if required. |
| File recovery | The administrator approves specific historical versions, the worker restores to a separate bucket, then reads back and verifies each copy. | Enable versioning before seeding data and register a trusted version ID and checksum for each recoverable file. Current limits are 5 MiB per file and 50 selected files per plan. Returning a copy to the live portal is a separate decision. |
| Uploaded malware | A successful write can appear in Activity. | Add a scanner-result connector for a contents verdict. Upload logging alone cannot determine whether a file is malicious or whether anything executed. |
| Database and compute | MediCore can use its own database, compute and internal services alongside S3 monitoring. | Database query monitoring, database restore, server process monitoring and Vercel request monitoring each need separate telemetry. Label those services outside current coverage. |

Local evidence includes a passing 17-test suite, a frontend build and a migration check in the implementation work. AWS adapters were exercised with test doubles. Treat live AWS delivery, external notifications and deployment as acceptance work.

## Deployment layout

| Component | A · Baseline | B · AEGIS connected |
|---|---|---|
| Portal and API | Vercel environment A points to AWS API A | Vercel environment B points to AWS API B |
| Application | Same release, settings policy and synthetic seed data | Same release, settings policy and synthetic seed data |
| Storage and identity | Its own private bucket, database or isolated database instance/schema with dedicated credentials, and scoped workload identity | Separate equivalents with matching permissions limited to B |
| AWS protections | Keep versioning, access restrictions, logging and any selected native detection services enabled | Match A. Add only the AEGIS connection and its scoped response resources. |
| Analyst experience | Use configured AWS logs, scanner results and manual version recovery | Use the same AWS evidence plus the AEGIS investigation, approval and verification workflow |

Separate sandbox accounts give the clearest boundary. If using one account, use distinct stacks, roles, secrets, databases, buckets and allowed frontend origins. Before rehearsal, verify each workload role can use only its own test resources. Keep native scanning settings identical on both sides when measuring AEGIS's added value.

AEGIS itself is a third deployment. For the first live proof it can run on the operator's machine with authorized temporary credentials. For a hosted rehearsal, package the existing API, dashboard and continuously running worker on a dedicated AEGIS host or container service, give AEGIS its own database, provide HTTPS and configure its runtime role. The current Compose file supports local operation. The customer onboarding template provisions connection resources, not the hosted AEGIS application.

## Implementation order and release gates

| Order | Work | Acceptance gate |
|---|---|---|
| 1 · Establish the baseline | Deploy the two MediCore environments independently. Record release ID, account, Region, bucket, prefix, API URL and workload role for each. Enable versioning and seed known-good synthetic files. | Both portals can upload and retrieve their own file. A cannot read B's test object or use B's database credentials. |
| 2 · Connect B using existing code | Deploy the customer stack for B, configure scoped object logging, register B and start AEGIS. Use the portal's normal upload route. | A uniquely named upload from B appears with its expected key, time and identity. Confirm an A upload in A's own logs and verify that AEGIS has no access or matching records for A. Verify B keeps serving reports if AEGIS is offline. |
| 3 · Simplify onboarding | Add a connection wizard using the existing settings model and stack outputs. Expose separate checks for permissions, bucket versioning, queue access, receipt of an actual test event, trusted recovery readiness and optional integrations. | A new operator can connect an existing bucket without editing MediCore. When an event never arrives, the UI identifies the missing proof and offers checks for trail scope, Region, prefix and worker health. |
| 4 · Add identity evidence | Extend the worker, database and incident screen to preserve the session identifier, role issuer, request ID, source address when available, and success or denial. Route selected AWS Security Token Service role-assumption events as a separate event type. Keep denied attempts separate from successful file changes. Correlate sessions only when identifiers match. | Two authorized sessions using the same role stay distinguishable. One expected denied request appears as denied and leaves file-change counts unchanged. Missing source IP is displayed as unknown. An unfamiliar IP alone cannot suspend a role. |
| 5 · Add optional upload scanning | Connect GuardDuty Malware Protection for S3 scan-result events. Extend the event rule and parser, store scan results by customer, bucket, key and version where supplied, handle duplicates and out-of-order results, and show pending, threat detected, no threats found or unable to scan. | A harmless scanner test artifact produces the expected verdict for the correct upload. A later clean version has its own result. A skipped or failed scan stays visible. If the requirement is to prevent reads before scanning finishes, design a separate restricted intake prefix and enforce access before enabling that claim. |
| 6 · Rehearse and measure | Use the same labelled test inputs on both sides. Start with a handful of small files, then characterize bulk behavior. Record action time, AWS event time, AEGIS receipt, incident opening, approval and verified recovery. Export evidence and reverse test restrictions before teardown. | Report actual times and per-file results for each side. Label simulated, live and unavailable evidence explicitly. Verify a recovered file opens and matches the independently trusted original. |

Changes in steps 3–5 belong in AEGIS. Start with the customer template in [guardian/template.py](../guardian/template.py), the event handling in [guardian.py](../backend/aegis/guardian.py), the worker in [worker.py](../backend/aegis/worker.py), then update the database migration, operator API and dashboard together. Preserve the current replay workflow and add regression cases for cross-environment access, delayed evidence and clean/flagged versions of the same key.

## Rehearsal scenarios

| Test input | Evidence to collect from A | Evidence to collect from B |
|---|---|---|
| One ordinary report upload | Application success and a matching AWS write record | Matching AWS record and one AEGIS Activity entry |
| Legitimate bulk upload | Number of distinct report changes and the native alerts actually observed | Same counts, score explanation and resulting incident status |
| A harmless revision to a registered decoy by the designated test role | Matching revision to the equivalent synthetic object in A and the AWS evidence | Decoy alert, role evidence, scoped approval if eligible, and independent proof the unaffected role can still write |
| Approved role use and one expected permission denial | Role/session records and the denied operation | Current supported write evidence, then the distinct session and denial evidence after step 4 |
| Harmless EICAR antivirus test artifact | Native scanner verdict if scanning is enabled | Same native verdict, linked AEGIS case and notification after step 5. Use a dedicated synthetic intake location. |
| Recovery of two revised reports | Time and manual steps to identify, copy and verify the same known-good versions | Approved version IDs, destination versions, per-file checksums and elapsed time |

**First deployment handoff.** Collect the AWS Region, compute service, database engine, source bucket/prefix, workload role identifier, versioning and logging status, and whether uploads pass through the API or use signed URLs. No access keys, passwords or patient data are needed for planning. The first proof uses only a normal synthetic upload. Record live findings before changing detection thresholds or expanding coverage.

**AWS references.** [CloudTrail record fields](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html) · [How S3 malware scanning works](https://docs.aws.amazon.com/guardduty/latest/ug/how-malware-protection-for-s3-gdu-works.html) · [Scan result event examples](https://docs.aws.amazon.com/guardduty/latest/ug/monitor-with-eventbridge-s3-malware-protection.html)
