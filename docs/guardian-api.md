# Guardian dashboard API

The FastAPI service hosts the interactive request schema at `/docs`. Sign in with `POST /api/v1/auth/login` using `{"email":"…","password":"…"}`. Send the returned opaque `access_token` as a Bearer token. Each request resolves the session, its customer membership and its current role in SQL. Connection IDs, case IDs and job IDs are opaque. The server binds the AWS queue, external ID, roles and protected prefix during operator registration.

The paths below are relative to `/api/v1/ops`.

| Method and route | Allowed roles | Request and result |
|---|---|---|
| GET `/overview` | Viewer, analyst, admin | Customer connections, latest 100 cases and latest 40 activity records. Each activity row includes source mode, operation, outcome, key, actor, event ID, event time, receipt time and source evidence. |
| GET `/connections/{id}` | Viewer, analyst, admin | One authorized deployment with read delivery status, canary inventory, enrolled role and effective response settings. |
| GET `/connections/{id}/activity/{event_id}` | Viewer, analyst, admin | One persisted AWS or replay activity record, including source mode and provenance. |
| POST `/connections/replay` | Admin | Open the customer's practice connection. Repeating the call returns the same connection. |
| POST `/connections/aws` | Admin | Send `connection_id`, `account`, `region`, `bucket`, `prefix` from an operator-registered deployment. Checks versioning and queue access and activates that deployment. |
| POST `/connections/{id}/enabled/{true-or-false}` | Admin | Enable or pause polling. Pending reversals and expiry cleanup can run while paused. |
| POST `/connections/{id}/canaries` | Admin | No body. Returns `{mode,canaries}`. Each item has `bucket, object_key, trusted_version_id, sha256, setup_request_id, status`. The connection ID is in the route. |
| POST `/connections/{id}/read-check` | Admin | AWS only. Reads up to 32 bytes from each managed, pinned canary. Returns HTTP 202 with the read requests and delivery status. Poll connection detail for matching CloudTrail events. |
| PUT `/connections/{id}/rules` | Admin | Replace the complete rule settings. Omitted fields take their defaults. Returns the validated settings. |
| POST `/connections/{id}/replay/{scenario}` | Analyst, admin | Returns `{mode:"replay",scenario,recorded,event_ids,case_ids}`. For the mentoring case use `canary-overwrite` after provisioning. Additional cases include `canary-read`, `canary-denied`, `canary-delete` and `enrolled-bulk`. The original four scenarios remain available. |
| GET `/cases/{id}` or `/cases/{id}/export` | Viewer, analyst, admin | Same JSON evidence. Export sets a download filename. |
| POST `/cases/{id}/containment/{restrict-or-reverse}` | Analyst, admin | Preview the named action. Returns `id,actor,bucket,prefix,operation,stage,policy,restriction_expires_at`. |
| POST `/cases/{id}/jobs/{job}/{approve-or-reject}` | Admin | Decide on a preview. Approval queues work. Poll case detail for the applied result. |
| POST `/cases/{id}/step`, POST `/cases/{id}/recovery` | Analyst, admin | Advance a case with `{action,reason}`, or preview recovery with `{keys:[…]}`. Recovery uses the same administrator decision route. |
| GET `/cases/{id}/jobs/{job}/files/{index}` | Viewer, analyst, admin | Download a verified recovery copy from this customer's case. |
| WebSocket `/stream` | Viewer, analyst, admin | Send the session token as the first text frame. Receive `{"changed":true}` when a customer activity, case timeline or connection-count revision changes. Refresh REST resources on notifications and periodically for health and configuration. |

HTTP 401 indicates an absent or expired session, 403 an unauthorized role, 404 an unavailable customer resource, 409 an unmet precondition or expired decision, 422 invalid input, and 503 a storage or setup failure. A provisioning 503 can follow a partial success. Read the inventory and repeat the same POST to resume.

## Rule settings

Both rolling alerts and automatic restrictions start disabled. The existing five-minute correlation score remains active. This example enables a rolling alert and automatic containment for a successful canary touch. A bulk alert still requires approval in this example.

```json
{
  "bulk_enabled": true,
  "threshold": 10,
  "window_seconds": 120,
  "automatic_triggers": ["canary"],
  "ttl_seconds": 900,
  "exempt_roles": [],
  "scheduled_jobs": []
}
```

Add `rolling_bulk` to `automatic_triggers` to opt in for that rule. The threshold counts distinct keys changed successfully by the same recorded role in the event-time interval `(end - window, end]`. Retries and repeated writes to one key have separate handling. Exact duplicates count once in activity and multiple writes to one key count once toward the threshold. A late event can complete an earlier window. Overlapping windows reuse an incident ID. If late evidence connects two existing incidents, their existing action histories remain accessible. For AWS, an event older than the configured window can update evidence and needs human review for a new restriction.

Scheduled job entries take the form `{"role":"<exact role ARN>","weekdays":[0,1,2,3,4],"start_minute_utc":60,"end_minute_utc":90}`. This exempts that role's successful changes from the rolling count on weekdays from 01:00 inclusive to 01:30 exclusive UTC. Split an overnight interval into two entries. Canary evidence remains visible. List organization-specific emergency roles under `exempt_roles`. The only eligible mutation target is the stack's pre-enrolled test writer.

## Incident and telemetry fields

- `events[].outcome` is `success`, `denied` or `failed`. A denied overwrite has no demonstrated object change. `events[].source` contains the available account, region, bucket, principal, issuer role ARN, STS session ARN, request ID, error code, source address, user agent, version and AWS identity fields. Older records can have an empty source object. All event and job times use Unix seconds.
- `rule` identifies `canary`, `rolling_bulk` or `correlation`. Rolling `metrics` include the observed distinct count, threshold, window length, event-time boundaries and supporting event IDs. Canary metrics identify each triggering event.
- `explanation.claims[]` contains plain text, `event_ids` and, for action claims, `job_ids`. Render these fields and object names as text. An STS session name does not identify a person on its own.
- `restriction` contains the enrolled actor, exact IAM policy, state and `until_at`. The policy denies `PutObject`, `DeleteObject` and `DeleteObjectVersion` on the protected prefix. It has an absolute AWS time condition. It leaves object contents and prior versions intact. The worker tests `PutObject` on harmless probe keys under that prefix with both enrolled roles.
- The timeline records request, installation, verification and reversal. A job in `queued` may still be awaiting IAM propagation. `result.probes` gives each observed outcome. A failure includes the last confirmed restriction state when available. An expiry cleanup checks both roles after removing the owned policy and records `expired`. A changed reserved policy requires operator review. An approval deadline in `jobs[].expires` and an enforcement deadline in `restriction.until_at` serve different purposes.
- `read_monitoring.status` starts `unconfirmed`. `observed` means the supplied keys have delivered read events at the listed times. `awaiting_delivery` identifies an outstanding read check. After 15 minutes without its receipt, the status becomes `missing_after_probe`. Explicitly unavailable customer logging is shown as `unavailable`. `checks` and `observations` identify coverage per key. Replay has its own source label.
- Canary inventory states include `pending`, `ready`, `awaiting_setup_receipt`, `conflict` and `legacy`. A lost PUT response can leave the original CloudTrail request ID pending until delivery. A collision preserves the customer's object. A legacy registration may have no independently recorded baseline.

## Mentoring acceptance

### Dashboard comparison exercise

Generate a UUID when an administrator starts a comparison. Send an authenticated `PUT /api/v1/ops/exercises/comparison/{uuid}` with no body. Reuse the UUID on retry. The API creates two isolated local fixture lanes and records one synthetic overwrite in each. Only the protected lane opens an Aegis case. Both lanes preserve the original fixture version. The endpoint uses the replay adapter and has no AWS mutation path.

Use `GET /api/v1/ops/exercises/comparison/{uuid}` to refresh the comparison. The response has `mode: "replay"` and `lanes.protected` and `lanes.baseline`. Each lane has a connection ID, event ID, object key, operation, outcome, event time, trusted version ID and observed version ID. The protected lane includes `case_id` and the current `stage`. The baseline lane models manual intervention and has null case and stage fields. A different customer receives HTTP 404. A fresh UUID starts a new exercise.

Use the protected case's existing endpoints for approval, recovery, reversal and export. The case report supplies provenance, probe outcomes and the action timeline. Render the comparison as Replay. In the live AWS view, match the S3 request ID returned by MediCore's synthetic upload endpoint to an AWS activity row from `/ops/overview`. Use the event detail endpoint to reopen the matched record after it leaves the recent activity list. Match the canary incident by case ID. Use timestamps from AWS activity and Aegis jobs for elapsed time, and show unknown stages as awaiting evidence.

### Existing replay workflow

From `backend/` with `requirements-test.txt` installed, run `python -m aegis.mentoring`. This command signs in, provisions the three synthetic canaries twice, replays one overwrite, approves the restriction, runs the worker and approves and verifies reversal. It uses a disposable SQLite database. Pass `--export PATH` to save the final synthetic case for review. To keep an interactive case in the dashboard, follow the mentoring steps in the repository README.

Run `python -m unittest discover -s tests -v` for customer and role isolation, duplicate delivery, setup reconciliation and collisions, read telemetry, rolling windows, response failure, expiry and reversal. AWS adapter checks in this suite use test doubles.
