# AEGIS project plan for ToyGuard

**Review draft · 21 November 2026 · CYB-03**

## What the first release should prove

MediCore Hospital already has a working report portal on AWS. A hospital administrator connects AEGIS and selects the bucket where synthetic reports are stored. When a test report and a decoy file change unexpectedly, an analyst can see what happened, which files were affected and how confident AEGIS is about who made the changes. A customer administrator reviews the proposed response, approves recovery of selected reports and opens a verified copy. The demo ends with a downloadable record of that incident.

**First engineering checkpoint:** follow one synthetic report from its original upload through a second version, an observed event, a recovery preview, customer approval and a byte-for-byte verified copy. Build this narrow path before expanding the dashboard or tuning every detection signal. It tests the part of the product on which its recovery promise depends.

## Starting point and decisions for review

The inspected ToyGuard checkout is on the `docs` branch. It contains a short README, the eleven numbered design documents and `docs/feature.md`. The application, deployment and tests are planned work. Use the feature brief for customer-facing behavior, the numbered documents for engineering detail and `09-DEVELOPMENT-PHASES.md` as the implementation checklist after reconciling the following differences.

| Decision | Proposed choice | Why it matters |
|---|---|---|
| Product and customer | AEGIS lives in ToyGuard. MediCore is an independently deployable demo application with its own infrastructure and identity. | The judges can see MediCore working before AEGIS connects. |
| First protected asset | One versioned S3 bucket, one AWS Region, synthetic reports only. EC2 hosts the portal and RDS stores metadata. | A working report portal gives the demo business context. Only S3 file activity is covered in this release. |
| Permissions | Customer-controlled temporary access. Separate observation, canary setup, containment and recovery permissions. | Monitoring can keep working when a customer withholds action permissions. |
| Containment | Start in monitor-only mode. Offer an administrator-approved, reversible restriction for one designated test role on the selected report prefix. | The numbered design proposes disabling access keys. The test-role case needs its own action and verification. |
| Recovery destination | Copy approved historical versions into a separate recovery location. Return the verified copies for customer review. | The original object history stays available. Making recovered files live in the hospital portal is a separate promotion decision. |
| First integration | Deliver Slack incident and outcome notifications. Add Jira ticket creation and updates once the end-to-end demo passes. | A single reliable integration satisfies the feature brief’s one-or-two connector target. |
| Deployment | Run AEGIS with Docker Compose locally for the first demo. Host MediCore and the customer-side connection on AWS. | The team can prove a real customer connection without first operating a second hosted web stack. |

## Build sequence and effort

Estimates are focused **person-days**, assuming access to an AWS sandbox, a Slack test channel and an engineer familiar with the proposed stack. They exclude account provisioning delays. Team size, deadline and budget are open. Treat the estimates as a planning baseline and revise them after the first live AWS event.

| Milestone | Depends on | Effort | Reviewable result |
|---|---|---:|---|
| 1. Contract and local foundation | Plan approval | 1–2 | A user signs in and sees the correct permissions and an empty incident list. |
| 2. Existing customer and onboarding | Agreed AWS topology; can start alongside 1 | 2–3 | MediCore works independently. Connecting AEGIS records the first real report change. |
| 3. First verified restore | 1 and 2 | 2–3 | One selected report is restored to a separate location after approval and matches its reference bytes. |
| 4. Detection and investigation | 2 and the event contract from 1 | 2–3 | Normal hospital work and a suspicious fixture produce different, explainable outcomes. |
| 5. Customer-controlled response | 3 and 4 | 1–2 | An authorized administrator contains the test role, verifies the effect and reverses the restriction. |
| 6. Dashboard, Slack and playbook | Contracts from 1; live integration after 3–5 | 2–3 | An analyst follows the entire incident from Slack through the dashboard to its final report. |
| 7. Rehearsal and handover | 1–6 | 1–2 | A second operator reproduces the demo and its failure cases from the runbook. |

Total baseline effort is **11–18 person-days**. With parallel contributors, one can own MediCore and onboarding, another the AEGIS API and worker, and a third the dashboard against agreed example responses. With one contributor, follow the milestone order. If time is short, retain the live file recovery, approval, detection explanation and evidence. Cut Jira, additional charts and advanced detection tuning first. Label simulated containment explicitly if live verification misses the demo deadline.

## Milestone 1 · Define the contracts and start AEGIS locally

- Reuse the planned Next.js and TypeScript dashboard, Python FastAPI service, PostgreSQL database, Redis and Celery background worker. Use Docker Compose for local startup and Alembic for database migrations. Confirm supported dependency versions when implementation starts.
- In the existing schema and API designs, identify the minimum additions for customer connections, identity evidence, version-specific recovery plans, approvals, per-file attempts and integration delivery status. Define ownership of every record by customer and carry one incident ID across logs, screens and messages.
- Define the roles. A viewer can inspect the case. An analyst can acknowledge it and prepare a plan. A customer administrator with the relevant action permission can approve containment or recovery. Enforce access in the API and worker. Limit live dashboard subscriptions to the same customer.
- Agree the API operations needed for connection checks, event lookup, incident review, preview, approval, execution and verification. Include examples for missing evidence, stale approval and partial success. Build a thin incident page early so each later milestone has a place to show its result.

**Gate:** Start from a clean database, migrate, sign in and load the empty dashboard. A viewer’s direct request to approve recovery is denied. A user from a second test customer cannot retrieve the first customer’s case.

## Milestone 2 · Deploy MediCore, then connect it

- Build a small Node.js report portal with a synthetic patient list, report upload and report download. Deploy the app to EC2, keep patient/report metadata in RDS PostgreSQL and store the files in versioned S3. Record the expected digest of a few known-good sample documents in a trusted demo manifest. Demonstrate upload and download before onboarding.
- Create a repeatable customer setup template. Define private storage, the allowed report prefix, a separate recovery destination, the event queue, a queue for repeatedly failed messages and scoped access roles. Preserve any existing bucket notifications when adding the integration. Tag demo resources, agree a spending limit and write the cleanup sequence before provisioning.
- For this prototype, implement Guardian as the customer-side AWS configuration and restricted roles, with the AEGIS worker consuming events through temporary credentials. The connection screen shows requested permissions and checks identity, bucket scope, versioning, queue delivery and recovery readiness separately. Use an external ID where a separate AEGIS account assumes a customer role.
- Deliver object-change events from S3 to Amazon Simple Queue Service (SQS). Enable CloudTrail S3 object-level data events for the selected scope and consume their delivered records for actor evidence. Correlate request identifiers where available. Leave attribution pending or unknown when evidence is insufficient. CloudTrail Event History does not provide these data events. [AWS object-level logging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-cloudtrail-logging-for-s3.html)
- Store each event before acknowledging its queue message. Deduplicate individual records, tolerate late arrivals and retry failed processing. Record event time and receipt time separately. Compare sequence values only for the same object key. [AWS event structure](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html)

**Gate:** Upload a synthetic report through MediCore. Find its bucket, key, version and event in AEGIS. Redelivering that event leaves one logical change. Disconnect monitoring and confirm that the hospital portal still works and AEGIS reports degraded coverage.

## Milestone 3 · Prove one approved recovery

1. Upload two harmless prepared versions of a report. Use a test case linked to the real events while the full detection engine is under construction.
2. Build a preview showing the affected key, observed change, exact candidate version, reason for selection, expected digest and recovery destination. A version from before the incident is a candidate. For the demo, establish trust by checking it against the known-good manifest. Mark missing history or uncertain content for review.
3. Bind approval to the customer, incident, exact set of source versions, destination and expiry. Store who approved and when. Changing the selection creates a new plan requiring approval. A rejected, expired or already completed plan cannot start a new restore.
4. Have the recovery worker copy the pinned source into a unique incident destination. Record the destination version and compare its SHA-256 content digest with the trusted expected value. Record skipped, unavailable, failed and verified files separately.
5. Make retries resume unfinished work. If the worker stops after writing a file, inspect the recorded destination and verify it before issuing another write. Prevent concurrent workers from executing the same approved item. Keep recovery writes outside the monitored report prefix.

**Gate:** Download the recovered report, match its digest to the original and show both original source versions still available. Submit the approval twice and interrupt the worker once. Each selected item finishes with one logical result. An item without a known-good candidate stays visibly unresolved.

## Milestone 4 · Explain an incident

- Plant and register a decoy report, also called a canary. Record its setup event so AEGIS can distinguish initial placement from an unexpected change.
- Implement a configurable count of distinct modified keys within a time window, canary changes and IntentGuard rules for two demo identities. For example, the report uploader normally creates reports, while the reporting job normally reads them. Record observed history separately from declared permissions and show when history is limited.
- Extend the existing detector design with copy-and-delete correlation for likely renames, and optional bounded content sampling on synthetic files for changes in byte randomness. Treat compressed PDFs and images as benign comparison cases. Missing content access or a delayed audit event should reduce available evidence.
- Group related changes into one case, keep file and identity evidence, and explain each score contribution in plain language. A canary change can alert immediately. Require corroborating signals and attributable evidence before presenting a containment option. Use the customer’s configured policy and record which policy version produced the decision.

**Gate:** Replay four labelled cases covering routine upload, legitimate bulk import, unexpected canary change and a correlated modification burst. Show the evidence and expected outcome for each. Duplicate delivery cannot increase the score. Measure queue-to-alert and upload-to-alert times separately on live runs.

## Milestone 5 · Contain and verify a scoped incident

- Present the identity evidence, proposed restriction, affected bucket and prefix, expected effect and reversal procedure. Keep action controls unavailable when the actor is unresolved or protected by customer policy.
- Have the customer approve one time-limited response plan. Limit the demo action to a prepared, reversible write restriction for the designated test role. Record the previous policy state and check for intervening customer changes before applying or undoing it.
- Verify using harmless writes to designated probe objects. Record the denial for the affected role and success for an unaffected role. Distinguish requested, applied, verified, failed and reversed. Handle permission propagation with bounded retries and show the last observation.

**Gate:** The monitor-only run logs its recommendation. In the approved live run the designated writer loses write access to the scoped probe, another permitted writer retains access and reversal restores the designated writer’s original behavior.

## Milestone 6 · Deliver the operator workflow

| Surface | What the user must be able to answer or do |
|---|---|
| Connections and dashboard | Which bucket is covered? Is versioning enabled? When did AEGIS last receive an event? Are any actions unavailable? |
| Incident detail | What changed first, how many distinct reports are involved, why did AEGIS raise the alert, and how certain is the actor identity? |
| Recovery center | Inspect candidates, select files, approve the exact plan, follow per-file results and open a verified recovered copy. |
| Audit and integrations | Trace every approval and action to a person or worker. See whether Slack received the update and export a report with timestamps, outcomes and outstanding items. |

Implement one persisted playbook that advances from detection through notification, analyst review, containment decision, recovery approval, verification and closure. Allow the customer to skip containment with a recorded reason. Use authenticated WebSocket updates with a fresh API snapshot after reconnect. Queue Slack sends, deduplicate incident notifications and retry transient failures. Send severity, counts and an authenticated incident link. Keep report content and patient identifiers out of messages. Integrate Jira as a second connector only after this workflow passes.

**Gate:** An analyst can follow a Slack alert to the same case, understand the evidence and prepare recovery. An administrator can complete it. A Slack outage or closed browser leaves the durable incident workflow intact.

## Milestone 7 · Acceptance, demo and handover

| Test situation | Evidence required for sign-off |
|---|---|
| Healthy customer workload | Routine uploads are visible. A legitimate bulk import alone causes no containment. |
| Suspicious activity | Use labelled event fixtures plus a few ordinary uploads of prewritten synthetic report revisions to designated demo keys. Show live and replayed evidence distinctly. |
| Lost permission, delayed actor or malformed event | Connection health or evidence status explains the gap. A failed queue item remains inspectable. Actor-specific response is blocked when attribution is unresolved. |
| Recovery edge cases | Exercise a delete marker, missing earlier version, denied read, digest mismatch, expired approval and worker restart. Verified counts match the files actually verified. |
| Operator and customer isolation | Attempt unauthorized approval, cross-customer case access and duplicate execution. Record each outcome without changing out-of-scope resources. |
| Reproducibility and cost | Rehearse twice with fresh fixtures. Record observed latency, distinct files affected, verified/selected counts and outstanding failures. Review resource inventory and test scoped teardown against disposable demo resources. |

**Judge walkthrough (target five minutes).** Open a report in MediCore. Show its connected bucket and healthy status in AEGIS. Introduce the prepared changes, open the incident from Slack and explain the canary and identity evidence. Show the customer’s containment decision. Approve a specific report version, open the recovered document and finish on its verified digest and audit timeline. Keep a clearly labelled recorded run available if cloud delivery is delayed.

**Handover package after implementation.** A working Compose setup, separate MediCore deployment instructions, customer onboarding template, synthetic fixtures, test results, a short operator runbook and a teardown guide. Document which functionality was demonstrated live, which used replay and which remains planned.

## Decisions to settle at review

1. **Scope and deadline.** Is the judging deadline compatible with the 11–18 person-day baseline, and how many people are available? If the team has a single weekend, prioritize milestones 1–3, a canary-plus-burst rule, one incident screen and Slack.
2. **AWS access and spend.** Which sandbox account, Region and spend ceiling can the team use? Two accounts demonstrate customer-to-provider trust most faithfully. A one-account rehearsal can retain separate roles and clearly label that topology.
3. **Demo completion.** Recommended acceptance is a customer-approved, verified copy in a recovery location, a scoped containment demonstration and a Slack alert. Returning a recovered report to the live portal, Jira, further cloud services and enterprise deployment can be estimated separately.

**First task after approval:** align the conflicting response and recovery contracts in the existing docs, define the single-report test fixture and start milestone 1. This document is the planning deliverable for review.
