# CYB-03 — Database Schema

## Entity-Relationship Diagram

```
┌───────────┐       ┌────────────────┐       ┌──────────────┐
│   USERS   │       │ MONITORED_     │       │ CANARY_FILES │
│           │       │ BUCKETS        │──────▶│              │
│ id (PK)   │       │                │  1:N  │ id (PK)      │
│ email     │       │ id (PK)        │       │ bucket_id FK │
│ password  │       │ bucket_name    │       │ object_key   │
│ role      │       │ region         │       │ content_hash │
│ created_at│       │ versioning     │       │ planted_at   │
│ is_active │       │ status         │       │ status       │
└───────────┘       │ created_at     │       └──────────────┘
                    └───────┬────────┘
                            │ 1:N
                    ┌───────▼────────┐
                    │ CLOUD_EVENTS   │
                    │                │
                    │ id (PK)        │
                    │ event_id (UK)  │◄── Idempotency key
                    │ bucket_id FK   │
                    │ event_type     │
                    │ object_key     │
                    │ actor_identity │
                    │ object_size    │
                    │ etag           │
                    │ event_time     │
                    │ processed      │
                    │ ingested_at    │
                    └────────────────┘

                    ┌────────────────┐
                    │  INCIDENTS     │
                    │                │       ┌──────────────┐
                    │ id (PK)        │──────▶│   ALERTS     │
                    │ bucket_id FK   │  1:N  │              │
                    │ status         │       │ id (PK)      │
                    │ threat_level   │       │ incident_id  │
                    │ risk_score     │       │ severity     │
                    │ actor_identity │       │ alert_type   │
                    │ detection_     │       │ description  │
                    │   signals      │       │ details JSON │
                    │ detected_at    │       │ created_at   │
                    │ revocation_at  │       │ acknowledged │
                    │ recovery_start │       └──────────────┘
                    │ recovery_end   │
                    │ created_at     │       ┌──────────────────┐
                    │                │──────▶│ AFFECTED_FILES   │
                    └───────┬────────┘  1:N │                  │
                            │               │ id (PK)          │
                            │               │ incident_id FK   │
                            │               │ object_key       │
                            │               │ version_corrupted│
                            │               │ version_clean    │
                            │               │ recovery_status  │
                            │               │ recovered_at     │
                            │               └──────────────────┘
                            │
                            │  1:N    ┌──────────────────┐
                            └────────▶│ REVOCATION_LOG   │
                                      │                  │
                                      │ id (PK)          │
                                      │ incident_id FK   │
                                      │ identity_arn     │
                                      │ access_key_id    │
                                      │ action_taken     │
                                      │ simulated        │
                                      │ executed_at      │
                                      └──────────────────┘

┌──────────────────┐          ┌──────────────────┐
│   AUDIT_LOG      │          │ DETECTION_CONFIG │
│                  │          │                  │
│ id (PK)          │          │ id (PK)          │
│ actor            │          │ config_key (UK)  │
│ action           │          │ config_value JSON│
│ target           │          │ updated_at       │
│ details JSON     │          │ updated_by       │
│ timestamp        │          └──────────────────┘
└──────────────────┘
```

---

## Table Definitions

### `users`
Stores dashboard user accounts (not AWS identities).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default uuid4 | Unique user identifier |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| `hashed_password` | VARCHAR(255) | NOT NULL | Bcrypt-hashed password |
| `full_name` | VARCHAR(255) | | Display name |
| `role` | VARCHAR(20) | NOT NULL, default 'viewer' | `admin` or `viewer` |
| `is_active` | BOOLEAN | default true | Account enabled flag |
| `created_at` | TIMESTAMP | default now() | Account creation time |
| `updated_at` | TIMESTAMP | auto-update | Last modification time |

### `monitored_buckets`
Tracks which S3 buckets we are monitoring.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Bucket record ID |
| `bucket_name` | VARCHAR(255) | UNIQUE, NOT NULL | S3 bucket name |
| `region` | VARCHAR(50) | NOT NULL | AWS region |
| `versioning_enabled` | BOOLEAN | NOT NULL | Whether S3 versioning is on |
| `total_objects` | INTEGER | default 0 | Approximate object count |
| `status` | VARCHAR(20) | default 'active' | `active` / `paused` / `error` |
| `sqs_queue_url` | VARCHAR(500) | | Associated SQS queue URL |
| `last_event_at` | TIMESTAMP | | Timestamp of last received event |
| `created_at` | TIMESTAMP | default now() | When monitoring started |

### `cloud_events`
Every S3 event received and processed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Internal event ID |
| `event_id` | VARCHAR(255) | UNIQUE, NOT NULL | S3 event ID (idempotency key) |
| `bucket_id` | UUID | FK → monitored_buckets | Source bucket |
| `event_type` | VARCHAR(50) | NOT NULL | `ObjectCreated:Put`, `ObjectRemoved:Delete`, etc. |
| `object_key` | VARCHAR(1024) | NOT NULL | S3 object key |
| `object_size` | BIGINT | | File size in bytes |
| `etag` | VARCHAR(255) | | S3 ETag (content hash) |
| `version_id` | VARCHAR(255) | | S3 version ID |
| `actor_identity` | VARCHAR(500) | | IAM ARN or access key ID of the actor |
| `source_ip` | VARCHAR(45) | | Source IP if available |
| `event_time` | TIMESTAMP | NOT NULL | When the event occurred in AWS |
| `processed` | BOOLEAN | default false | Whether detection engine has analysed it |
| `is_canary` | BOOLEAN | default false | Whether this event involves a canary file |
| `ingested_at` | TIMESTAMP | default now() | When we received the event |

**Index**: `event_id` (unique), `bucket_id + event_time`, `actor_identity + event_time`, `processed`

### `canary_files`
Decoy files planted in monitored buckets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Canary record ID |
| `bucket_id` | UUID | FK → monitored_buckets | Bucket containing the canary |
| `object_key` | VARCHAR(1024) | NOT NULL | S3 key of the canary file |
| `content_hash` | VARCHAR(64) | NOT NULL | SHA-256 of original canary content |
| `file_type` | VARCHAR(20) | | `docx`, `xlsx`, `pdf`, etc. |
| `planted_at` | TIMESTAMP | default now() | When the canary was planted |
| `last_verified_at` | TIMESTAMP | | Last integrity check timestamp |
| `status` | VARCHAR(20) | default 'active' | `active` / `triggered` / `removed` |

### `incidents`
Security incidents (potential or confirmed ransomware attacks).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Incident ID |
| `bucket_id` | UUID | FK → monitored_buckets | Affected bucket |
| `status` | VARCHAR(20) | NOT NULL | `detected` / `confirmed` / `responding` / `recovering` / `resolved` / `false_positive` |
| `threat_level` | VARCHAR(20) | | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `risk_score` | FLOAT | | Combined risk score 0–100 |
| `actor_identity` | VARCHAR(500) | | Identified attacker identity |
| `access_key_id` | VARCHAR(50) | | Compromised AWS access key |
| `detection_signals` | JSONB | | `{"burst": 95, "entropy": 90, "canary": true, "rename": 88}` |
| `affected_files_count` | INTEGER | default 0 | Number of files affected |
| `recovered_files_count` | INTEGER | default 0 | Number of files recovered |
| `detected_at` | TIMESTAMP | NOT NULL | When first suspicious activity was spotted |
| `confirmed_at` | TIMESTAMP | | When risk score crossed threshold |
| `revocation_at` | TIMESTAMP | | When access was revoked |
| `recovery_started_at` | TIMESTAMP | | When file recovery began |
| `recovery_completed_at` | TIMESTAMP | | When all files were restored |
| `resolved_at` | TIMESTAMP | | When incident was closed |
| `notes` | TEXT | | Admin notes |
| `created_at` | TIMESTAMP | default now() | Record creation time |

### `alerts`
Individual security alerts belonging to incidents.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Alert ID |
| `incident_id` | UUID | FK → incidents, NULLABLE | Parent incident (null if unassigned) |
| `severity` | VARCHAR(20) | NOT NULL | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `alert_type` | VARCHAR(50) | NOT NULL | `canary_triggered` / `burst_detected` / `high_entropy` / `rename_burst` / `combined_threat` |
| `title` | VARCHAR(255) | NOT NULL | Human-readable alert title |
| `description` | TEXT | | Detailed description |
| `details` | JSONB | | Machine-readable signal data |
| `acknowledged` | BOOLEAN | default false | Whether admin has seen it |
| `acknowledged_by` | UUID | FK → users, NULLABLE | Who acknowledged it |
| `created_at` | TIMESTAMP | default now() | Alert creation time |

### `affected_files`
Files affected in an incident and their recovery status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Record ID |
| `incident_id` | UUID | FK → incidents | Parent incident |
| `object_key` | VARCHAR(1024) | NOT NULL | S3 object key |
| `version_id_corrupted` | VARCHAR(255) | | Version ID of the encrypted/corrupted file |
| `version_id_clean` | VARCHAR(255) | | Version ID of the last clean version |
| `original_size` | BIGINT | | Size of the clean version |
| `corrupted_size` | BIGINT | | Size of the corrupted version |
| `original_etag` | VARCHAR(255) | | ETag of clean version |
| `recovery_status` | VARCHAR(20) | default 'pending' | `pending` / `restoring` / `restored` / `failed` / `verified` |
| `recovery_error` | TEXT | | Error message if restoration failed |
| `recovered_at` | TIMESTAMP | | When restoration completed |
| `verified_at` | TIMESTAMP | | When integrity was verified |

### `revocation_log`
Audit trail of access-revocation actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Log entry ID |
| `incident_id` | UUID | FK → incidents | Related incident |
| `identity_arn` | VARCHAR(500) | NOT NULL | ARN of the identity targeted |
| `access_key_id` | VARCHAR(50) | | Specific access key disabled |
| `action_taken` | VARCHAR(50) | NOT NULL | `disable_access_key` / `attach_deny_policy` / `none` |
| `simulated` | BOOLEAN | NOT NULL | Whether this was simulation mode |
| `success` | BOOLEAN | | Whether the action succeeded |
| `error_message` | TEXT | | Error details if failed |
| `executed_at` | TIMESTAMP | default now() | When the action was taken |
| `executed_by` | VARCHAR(50) | | `system` or admin user ID |

### `audit_log`
General audit trail for all system actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Log entry ID |
| `actor` | VARCHAR(255) | NOT NULL | Who performed the action (`system`, user email, etc.) |
| `action` | VARCHAR(100) | NOT NULL | `event_processed`, `alert_created`, `access_revoked`, `file_recovered`, `config_changed`, etc. |
| `target` | VARCHAR(500) | | What was acted upon |
| `details` | JSONB | | Additional context |
| `ip_address` | VARCHAR(45) | | Source IP if from API |
| `timestamp` | TIMESTAMP | default now() | When it happened |

**Index**: `actor`, `action`, `timestamp`

### `detection_config`
Configurable detection thresholds and system settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Config entry ID |
| `config_key` | VARCHAR(100) | UNIQUE, NOT NULL | Setting name |
| `config_value` | JSONB | NOT NULL | Setting value |
| `description` | TEXT | | What this setting controls |
| `updated_at` | TIMESTAMP | default now() | Last modification |
| `updated_by` | VARCHAR(255) | | Who changed it |

**Default configuration entries:**

| Key | Default Value | Description |
|-----|--------------|-------------|
| `burst_window_seconds` | `60` | Time window for burst detection |
| `burst_threshold_count` | `50` | Modifications to trigger burst alert |
| `entropy_threshold` | `7.5` | Shannon entropy indicating encryption (max 8.0) |
| `entropy_sample_bytes` | `65536` | Bytes to download for entropy analysis (64KB) |
| `rename_threshold_count` | `20` | Renames in window to trigger alert |
| `rename_window_seconds` | `60` | Time window for rename detection |
| `risk_score_alert_threshold` | `60` | Score to generate alert |
| `risk_score_revoke_threshold` | `85` | Score to trigger auto-revocation |
| `simulation_mode` | `true` | Whether revocation is simulated |
| `canary_check_interval_seconds` | `300` | Canary health check frequency |
| `recovery_batch_size` | `10` | Files to restore concurrently |
| `allowlisted_identities` | `[]` | IAM ARNs that should never be revoked |

---

## Migration Strategy

- **Tool**: Alembic
- **Naming**: `001_initial_schema.py`, `002_add_indexes.py`, etc.
- **On startup**: `alembic upgrade head` runs automatically in Docker entrypoint
- **Rollback**: Each migration includes a `downgrade()` function

