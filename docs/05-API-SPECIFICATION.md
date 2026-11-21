# CYB-03 — API Specification

## Base URL
```
http://localhost:8000/api/v1
```

## Authentication
All endpoints (except `/auth/login`, `/auth/register`, `/health`) require a JWT Bearer token.

```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | System health status |

**Response 200:**
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "monitoring": "active",
  "version": "1.0.0"
}
```

---

### Authentication (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create a new user account |
| POST | `/auth/login` | No | Login and receive JWT token |
| GET | `/auth/me` | Yes | Get current user info |

**POST `/auth/login`** — Request:
```json
{
  "email": "admin@cyb03.local",
  "password": "securepassword"
}
```
Response 200:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "admin@cyb03.local",
    "role": "admin",
    "full_name": "Admin User"
  }
}
```

---

### Dashboard (`/dashboard`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard/stats` | Yes | Aggregate dashboard statistics |
| GET | `/dashboard/activity` | Yes | Recent file activity timeline |
| GET | `/dashboard/threat-level` | Yes | Current system threat level |

**GET `/dashboard/stats`** — Response 200:
```json
{
  "total_monitored_files": 1247,
  "connected_buckets": 2,
  "monitoring_status": "active",
  "total_alerts": 15,
  "active_incidents": 1,
  "suspicious_modifications": 87,
  "canary_files_total": 10,
  "canary_files_triggered": 1,
  "compromised_identities": 1,
  "revoked_credentials": 1,
  "affected_files": 45,
  "recovered_files": 42,
  "recovery_success_rate": 93.3,
  "last_updated": "2026-11-21T10:30:00Z"
}
```

---

### Buckets (`/buckets`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/buckets` | Yes | List all monitored buckets |
| POST | `/buckets` | Admin | Add a bucket to monitoring |
| GET | `/buckets/{id}` | Yes | Get bucket details |
| PUT | `/buckets/{id}` | Admin | Update bucket configuration |
| DELETE | `/buckets/{id}` | Admin | Remove bucket from monitoring |

**POST `/buckets`** — Request:
```json
{
  "bucket_name": "cyb03-test-bucket",
  "region": "us-east-1",
  "sqs_queue_url": "https://sqs.us-east-1.amazonaws.com/123456789/cyb03-events"
}
```

---

### Events (`/events`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/events` | Yes | List cloud events (paginated) |
| GET | `/events/stats` | Yes | Event statistics |
| GET | `/events/{id}` | Yes | Get event details |

**Query Parameters for GET `/events`:**
- `bucket_id` — Filter by bucket
- `event_type` — Filter by type (`ObjectCreated:Put`, etc.)
- `actor_identity` — Filter by IAM identity
- `start_time` / `end_time` — Time range
- `is_canary` — Filter canary events only
- `page` / `page_size` — Pagination (default 1 / 50)

---

### Alerts (`/alerts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/alerts` | Yes | List alerts (paginated, filterable) |
| GET | `/alerts/{id}` | Yes | Get alert details |
| PUT | `/alerts/{id}/acknowledge` | Yes | Acknowledge an alert |

**Query Parameters for GET `/alerts`:**
- `severity` — `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `alert_type` — Filter by type
- `acknowledged` — `true` / `false`
- `incident_id` — Filter by incident
- `page` / `page_size`

---

### Incidents (`/incidents`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/incidents` | Yes | List all incidents |
| GET | `/incidents/{id}` | Yes | Get incident details |
| GET | `/incidents/{id}/timeline` | Yes | Get attack timeline for an incident |
| GET | `/incidents/{id}/affected-files` | Yes | List affected files |
| PUT | `/incidents/{id}/status` | Admin | Update incident status |
| PUT | `/incidents/{id}/resolve` | Admin | Mark incident as resolved / false positive |

**GET `/incidents/{id}/timeline`** — Response 200:
```json
{
  "incident_id": "uuid",
  "timeline": [
    {
      "timestamp": "2026-11-21T10:00:05Z",
      "event": "first_suspicious_activity",
      "description": "First file modification burst detected",
      "details": {"files_modified": 15, "window_seconds": 10}
    },
    {
      "timestamp": "2026-11-21T10:00:12Z",
      "event": "canary_triggered",
      "description": "Canary file 'Q3-Financial-Report.docx' was modified",
      "details": {"canary_key": "reports/Q3-Financial-Report.docx"}
    },
    {
      "timestamp": "2026-11-21T10:00:15Z",
      "event": "detection_confirmed",
      "description": "Risk score 93/100 — CRITICAL threat level",
      "details": {"risk_score": 93, "signals": {"burst": 95, "entropy": 90, "canary": true, "rename": 88}}
    },
    {
      "timestamp": "2026-11-21T10:00:16Z",
      "event": "alert_generated",
      "description": "CRITICAL alert generated",
      "details": {"alert_id": "uuid"}
    },
    {
      "timestamp": "2026-11-21T10:00:18Z",
      "event": "access_revoked",
      "description": "Access key AKIA... disabled for user attacker-test",
      "details": {"access_key_id": "AKIA...", "simulated": false}
    },
    {
      "timestamp": "2026-11-21T10:00:25Z",
      "event": "recovery_initiated",
      "description": "File recovery started for 45 affected files",
      "details": {"affected_count": 45}
    },
    {
      "timestamp": "2026-11-21T10:01:30Z",
      "event": "recovery_completed",
      "description": "42 of 45 files successfully restored",
      "details": {"recovered": 42, "failed": 3, "success_rate": 93.3}
    }
  ]
}
```

---

### Canary Files (`/canary`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/canary` | Yes | List all canary files |
| POST | `/canary/plant` | Admin | Plant new canary files in a bucket |
| GET | `/canary/{id}` | Yes | Get canary file details |
| DELETE | `/canary/{id}` | Admin | Remove a canary file |
| POST | `/canary/verify` | Admin | Manually verify all canary file integrity |

**POST `/canary/plant`** — Request:
```json
{
  "bucket_id": "uuid",
  "count": 5,
  "file_types": ["docx", "xlsx", "pdf"],
  "prefix": "reports/"
}
```
Response 201:
```json
{
  "planted": 5,
  "canary_files": [
    {"id": "uuid", "object_key": "reports/Q3-Budget-Summary.xlsx", "status": "active"},
    {"id": "uuid", "object_key": "reports/Annual-Review-2024.docx", "status": "active"}
  ]
}
```

---

### Recovery (`/recovery`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/recovery/initiate/{incident_id}` | Admin | Start file recovery for an incident |
| GET | `/recovery/status/{incident_id}` | Yes | Get recovery progress |
| POST | `/recovery/restore-file` | Admin | Restore a single specific file |
| POST | `/recovery/verify/{incident_id}` | Admin | Verify restored file integrity |

**POST `/recovery/initiate/{incident_id}`** — Response 202:
```json
{
  "incident_id": "uuid",
  "status": "recovery_started",
  "affected_files": 45,
  "message": "Recovery task queued. Progress will be pushed via WebSocket."
}
```

**GET `/recovery/status/{incident_id}`** — Response 200:
```json
{
  "incident_id": "uuid",
  "status": "recovering",
  "total_files": 45,
  "restored": 30,
  "failed": 2,
  "pending": 13,
  "progress_percent": 66.7,
  "files": [
    {
      "object_key": "data/file1.csv",
      "recovery_status": "verified",
      "version_id_clean": "v1abc",
      "recovered_at": "2026-11-21T10:01:00Z"
    }
  ]
}
```

---

### Simulation (`/simulation`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/simulation/start` | Admin | Start a safe ransomware simulation |
| GET | `/simulation/status` | Yes | Get current simulation status |
| POST | `/simulation/stop` | Admin | Abort a running simulation |
| POST | `/simulation/reset` | Admin | Reset test bucket to clean state |

**POST `/simulation/start`** — Request:
```json
{
  "bucket_id": "uuid",
  "file_count": 50,
  "include_canary_modification": true,
  "include_rename": true,
  "delay_between_files_ms": 100
}
```

---

### Configuration (`/config`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/config` | Admin | Get all detection configuration |
| PUT | `/config/{key}` | Admin | Update a configuration value |
| GET | `/config/allowlist` | Admin | Get allowlisted identities |
| PUT | `/config/allowlist` | Admin | Update allowlisted identities |

---

### Audit Log (`/audit`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/audit` | Admin | List audit log entries (paginated) |
| GET | `/audit/export` | Admin | Download audit log as CSV/JSON |

---

## WebSocket Endpoint

```
ws://localhost:8000/api/v1/ws?token=<jwt_token>
```

### Message Format (Server → Client)
```json
{
  "type": "alert_created",
  "data": {
    "alert_id": "uuid",
    "severity": "CRITICAL",
    "title": "Ransomware activity detected",
    "incident_id": "uuid",
    "timestamp": "2026-11-21T10:00:15Z"
  }
}
```

### Event Types
| Type | When |
|------|------|
| `alert_created` | New security alert generated |
| `incident_updated` | Incident status changed |
| `access_revoked` | Credential revocation executed |
| `recovery_progress` | File restoration progress update |
| `recovery_completed` | All files restored |
| `canary_triggered` | Canary file was modified |
| `threat_level_changed` | System threat level changed |
| `monitoring_status` | Monitoring service status change |

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "detail": "Human-readable error message",
  "error_code": "INCIDENT_NOT_FOUND",
  "timestamp": "2026-11-21T10:00:00Z"
}
```

Standard HTTP status codes:
- `400` — Bad request / validation error
- `401` — Not authenticated
- `403` — Insufficient permissions
- `404` — Resource not found
- `409` — Conflict (duplicate)
- `422` — Validation error (Pydantic)
- `500` — Internal server error

