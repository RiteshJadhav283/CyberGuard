# CYB-03 — Technical Considerations & Pitfalls

> Earlier design proposal. For implementation order, permission scope and recovery behavior, use [the approved plan](12-IMPLEMENTATION-PLAN.md). The [README](../README.md) lists the capabilities available in the current checkout.

## Critical Technical Details

This document collects the non-obvious technical details, edge cases and pitfalls that any agent or developer working on this project must understand.

---

## 1. S3 Does Not Have a Native Rename Operation

**Problem:** S3 has no `rename` API. When a user "renames" a file, the client performs:
1. `CopyObject` — copies the object to the new key
2. `DeleteObject` — deletes the original key

**Impact on detection:**
- S3 event notifications will fire two separate events: `ObjectCreated:Copy` and `ObjectRemoved:Delete`
- The detection engine must correlate these two events as a single "rename" operation
- Correlation uses: same `actor_identity`, close timestamps (within a few seconds), and the delete key matching the copy source

**Implementation in `services/detection/rename.py`:**
```python
# Correlate by:
# 1. Same actor_identity
# 2. Delete event's key == Copy event's copy source
# 3. Timestamps within 5 seconds of each other
# 4. Compare old extension vs new extension
```

---

## 2. S3 Events Can Be Duplicated and Out of Order

**Problem:** S3 → SQS event delivery is "at-least-once" for standard queues. The same event may arrive multiple times, and events may arrive out of chronological order.

**Solution — Idempotent Processing:**
- Each S3 event has a unique `responseElements.x-amz-request-id` or similar identifier
- We store this as `event_id` with a UNIQUE constraint in the database
- Before processing, check if `event_id` already exists
- If it does → skip (idempotent)
- If not → insert and process

```python
async def process_event(event_data: dict, db: AsyncSession) -> bool:
    event_id = extract_event_id(event_data)
    
    # Check for duplicate
    existing = await db.execute(
        select(CloudEvent).where(CloudEvent.event_id == event_id)
    )
    if existing.scalar_one_or_none():
        return False  # Already processed — idempotent skip
    
    # Process and store
    cloud_event = CloudEvent(event_id=event_id, ...)
    db.add(cloud_event)
    await db.commit()
    return True
```

---

## 3. File Entropy Analysis Requires File Content

**Problem:** S3 event notifications contain only metadata (key, size, ETag). They do NOT contain file content. To compute entropy, we must download (at least a portion of) the file.

**Solution:**
- Download only the first N bytes (configurable, default 64KB) using an S3 range request:
  ```python
  response = s3_client.get_object(
      Bucket=bucket_name,
      Key=object_key,
      Range=f'bytes=0-{sample_bytes - 1}'
  )
  data = response['Body'].read()
  ```
- Run entropy analysis asynchronously in a Celery worker (I/O-bound task)
- For very small files (< 1KB), skip entropy analysis as there's not enough data for meaningful entropy
- For already-compressed file types (`.zip`, `.jpg`, `.png`, `.gz`), skip entropy — their natural entropy is high

**Cost consideration:** Downloading file content for every PutObject event could be expensive. Only trigger entropy analysis when other signals (burst, rename) are also elevated. The detection engine orchestrator decides when to request entropy analysis.

---

## 4. Actor Identity Attribution

**Problem:** Identifying WHO performed an S3 operation is crucial for revoking the right credentials and not disrupting legitimate users.

**S3 Event Notification Identity:**
The S3 event JSON includes identity info:
```json
{
  "userIdentity": {
    "principalId": "AIDAEXAMPLEID:username"
  }
}
```

This gives us the IAM principal. For IAM users, this includes the access key ID prefix.

**CloudTrail for Richer Identity:**
CloudTrail data events provide:
```json
{
  "userIdentity": {
    "type": "IAMUser",
    "arn": "arn:aws:iam::123456789:user/attacker-sim",
    "accountId": "123456789",
    "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "userName": "attacker-sim"
  }
}
```

**Strategy:**
1. Primary: Use `principalId` from S3 events for fast identity grouping
2. Secondary: Look up CloudTrail for specific `accessKeyId` when revoking (CloudTrail may have ~5-15 min delay)
3. For simulation: The simulation script uses a known attacker access key, so identity is predetermined

---

## 5. S3 Versioning Must Be Enabled Before Attack

**Problem:** Recovery depends on S3 versioning. If versioning is not enabled, there are no previous versions to restore.

**Rules:**
- When adding a bucket to monitoring, verify versioning is enabled
- If versioning is not enabled, warn the admin and refuse to monitor
- The setup script enables versioning automatically
- Versioning must be enabled BEFORE any files are uploaded for the clean versions to be available

**Verification:**
```python
response = s3_client.get_bucket_versioning(Bucket=bucket_name)
if response.get('Status') != 'Enabled':
    raise ValueError(f"Versioning is not enabled on bucket {bucket_name}")
```

---

## 6. Never Delete Version History

**Problem:** If the attacker or a bug deletes version history, recovery becomes impossible.

**Rules:**
- Our system NEVER calls `s3.delete_object(VersionId=...)` on a monitored bucket
- Recovery works by COPYING the clean version forward (creating a new current version), not by deleting the corrupted version
- The corrupted version remains in version history (for forensic analysis)
- Consider enabling MFA Delete on the bucket for extra protection (manual setup)

**Recovery operation:**
```python
# DO: Copy clean version as new current
s3_client.copy_object(
    Bucket=bucket_name,
    Key=object_key,
    CopySource={'Bucket': bucket_name, 'Key': object_key, 'VersionId': clean_version_id}
)

# DO NOT: Delete the corrupted version
# s3_client.delete_object(Bucket=bucket_name, Key=object_key, VersionId=corrupted_version_id)  # NEVER
```

---

## 7. Legitimate Bulk Operations vs Ransomware

**Problem:** The following legitimate operations look similar to ransomware:
- CI/CD pipeline deploying hundreds of files
- Data migration uploading thousands of files
- Backup service synchronising files
- Bulk data processing writing results

**Mitigations:**
1. **Allowlist**: Known service accounts (CI/CD, backup) are allowlisted → no auto-revocation
2. **Multi-signal requirement**: Burst alone is not enough — need entropy + rename or canary
3. **Entropy check**: Legitimate uploads usually don't have max entropy (unless they're compressed, which we exempt)
4. **Canary files**: Legitimate services don't touch canary files
5. **Thresholds**: Configurable — can be tuned per environment

**Example scenarios:**

| Activity | Burst? | High Entropy? | Renames? | Canary? | Verdict |
|----------|--------|---------------|----------|---------|---------|
| CI/CD deploy (100 JS files) | Yes | No (source code ≈ 4-5 entropy) | No | No | LOW ✅ |
| Backup sync (200 files) | Yes | Mixed | No | No | LOW ✅ (allowlisted) |
| Ransomware (encrypt 100 files) | Yes | Yes (≈ 7.9) | Yes (.locked) | Yes | CRITICAL ✅ |
| User renames 5 files | No | No | Minimal | No | LOW ✅ |

---

## 8. Simulation Mode Is the Default

**Problem:** Automatically revoking AWS credentials is a destructive action. If the system has a false positive, it could lock out legitimate users or services.

**Rules:**
- `SIMULATION_MODE=true` by default in `.env`
- In simulation mode, the response engine:
  - Logs what it WOULD do
  - Records the action in `revocation_log` with `simulated=true`
  - Sends a WebSocket notification saying "simulation: would revoke key AKIA..."
  - Does NOT call `iam.update_access_key`
- To enable real revocation:
  - Set `SIMULATION_MODE=false` in `.env` or via `/config` API
  - Or set the `simulation_mode` key in `detection_config` table to `false`
  - Config API change requires `admin` role

---

## 9. Measuring System Performance

Track these metrics:

| Metric | How to Measure | Target |
|--------|---------------|--------|
| **Detection latency** | Time from S3 event timestamp to alert creation | < 20 seconds |
| **False positive rate** | (Incidents resolved as false_positive) / (Total incidents) | < 5% |
| **Recovery success rate** | (Files successfully restored) / (Total affected files) | > 95% |
| **Event processing throughput** | Events processed per second | > 100/sec |
| **WebSocket latency** | Time from alert creation to dashboard display | < 1 second |

Store timestamps at each step to enable latency calculation:
- `cloud_events.event_time` — when S3 event occurred
- `cloud_events.ingested_at` — when we received it
- `incidents.detected_at` — when detection engine flagged it
- `incidents.confirmed_at` — when risk score crossed threshold
- `incidents.revocation_at` — when access was revoked
- `incidents.recovery_started_at` — when recovery began
- `incidents.recovery_completed_at` — when recovery finished

---

## 10. SQS Message Format (S3 Event Notification)

The actual JSON structure received from SQS (S3 event notification):

```json
{
  "Records": [
    {
      "eventVersion": "2.1",
      "eventSource": "aws:s3",
      "awsRegion": "us-east-1",
      "eventTime": "2026-11-21T10:00:05.000Z",
      "eventName": "ObjectCreated:Put",
      "userIdentity": {
        "principalId": "AIDAEXAMPLEID"
      },
      "requestParameters": {
        "sourceIPAddress": "203.0.113.42"
      },
      "responseElements": {
        "x-amz-request-id": "C3D13FE58DE4C810",
        "x-amz-id-2": "FMyUVURIY8/IgAtTv8xRjskZQpcIZ..."
      },
      "s3": {
        "s3SchemaVersion": "1.0",
        "configurationId": "testConfigRule",
        "bucket": {
          "name": "cyb03-test-bucket",
          "ownerIdentity": {
            "principalId": "EXAMPLE"
          },
          "arn": "arn:aws:s3:::cyb03-test-bucket"
        },
        "object": {
          "key": "documents/test-file-1.txt",
          "size": 1024,
          "eTag": "d41d8cd98f00b204e9800998ecf8427e",
          "versionId": "096fKKXTRTtl3on89fVO.nfljtsv6qko",
          "sequencer": "0055AED6DCD90281E5"
        }
      }
    }
  ]
}
```

**Key fields to extract:**
- `eventName` → `event_type`
- `eventTime` → `event_time`
- `userIdentity.principalId` → `actor_identity`
- `requestParameters.sourceIPAddress` → `source_ip`
- `responseElements.x-amz-request-id` → `event_id` (uniqueness key)
- `s3.bucket.name` → resolve to `bucket_id`
- `s3.object.key` → `object_key`
- `s3.object.size` → `object_size`
- `s3.object.eTag` → `etag`
- `s3.object.versionId` → `version_id`

**Note:** The SQS message body wraps this in another JSON layer:
```json
{
  "Type": "Notification",
  "Message": "<the above JSON as an escaped string>",
  ...
}
```
Parse accordingly — the actual S3 event is inside `Message` and may need `json.loads()` twice.

---

## 11. Docker Networking

All services communicate over a Docker bridge network:

| Service | Hostname | Port |
|---------|----------|------|
| PostgreSQL | `db` | 5432 |
| Redis | `redis` | 6379 |
| Backend | `backend` | 8000 |
| Frontend | `frontend` | 3000 |

The frontend calls the backend at `http://backend:8000` during server-side rendering, and at `http://localhost:8000` from the browser. Use `NEXT_PUBLIC_API_URL` for client-side and an internal URL for SSR.

---

## 12. Concurrency and Race Conditions

**Event processing races:**
- Multiple Celery workers might pick up the same SQS message if visibility timeout expires
- Solution: `event_id` UNIQUE constraint — second insert attempt fails → worker skips

**Incident creation races:**
- Two detection runs for the same identity might try to create an incident simultaneously
- Solution: Use `SELECT ... FOR UPDATE` or `INSERT ... ON CONFLICT` to handle concurrent incident creation

**Recovery races:**
- Multiple recovery tasks for the same file must not run simultaneously
- Solution: Use `recovery_status` as a state machine — only transition from `pending` → `restoring` atomically

---

## 13. What NOT to Build

To stay focused on the problem statement:

- ❌ No actual malware or ransomware code
- ❌ No encryption/decryption of real company data
- ❌ No scanning of local filesystems
- ❌ No network intrusion detection
- ❌ No endpoint protection
- ❌ No email/phishing detection
- ❌ No real-time antivirus scanning
- ❌ No multi-tenant SaaS infrastructure
- ❌ No payment or billing system
- ❌ No mobile application

The simulation script uses `os.urandom()` to generate random bytes that LOOK like encrypted data — it does NOT actually encrypt anything with a real cipher.

