# CYB-03 — System Architecture

> Earlier design proposal. For implementation order, permission scope and recovery behavior, use [the approved plan](12-IMPLEMENTATION-PLAN.md). The [README](../README.md) lists the capabilities available in the current checkout.

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         AWS CLOUD                                  │
│                                                                    │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────┐             │
│  │  S3      │───▶│ S3 Event         │───▶│  SQS     │             │
│  │ Buckets  │    │ Notifications    │    │  Queue   │             │
│  │(Versioned│    └──────────────────┘    └────┬─────┘             │
│  │)         │                                 │                    │
│  └──────────┘    ┌──────────────────┐         │                   │
│                  │  CloudTrail      │         │                    │
│  ┌──────────┐    │  (API Audit)     │         │                   │
│  │  IAM     │    └──────────────────┘         │                   │
│  │  (Access │                                 │                    │
│  │  Mgmt)   │    ┌──────────────────┐         │                   │
│  └──────────┘    │  EventBridge     │         │                   │
│                  │  (Optional)      │         │                   │
│                  └──────────────────┘         │                   │
└──────────────────────────────────────────────┼────────────────────┘
                                               │
                    ┌──────────────────────────┐│
                    │      BACKEND             ││
                    │      (FastAPI)            ▼│
                    │  ┌─────────────────────────┤
                    │  │ Cloud Monitoring Service │◄── Polls SQS
                    │  └────────┬────────────────┤
                    │           ▼                 │
                    │  ┌─────────────────────────┤
                    │  │ Event Processing Service │◄── Idempotent ingestion
                    │  └────────┬────────────────┤
                    │           ▼                 │
                    │  ┌─────────────────────────┤
                    │  │ Ransomware Detection     │◄── Multi-signal engine
                    │  │ Engine                   │
                    │  └────────┬────────────────┤
                    │           ▼                 │
                    │  ┌─────────────────────────┤
                    │  │ Alert Management Service │◄── Create incidents
                    │  └────────┬────────────────┤
                    │           ▼                 │
                    │  ┌─────────────────────────┤
                    │  │ Automatic Response Engine │◄── Revoke access
                    │  └────────┬────────────────┤
                    │           ▼                 │
                    │  ┌─────────────────────────┤
                    │  │ Recovery Engine           │◄── Restore from versions
                    │  └─────────────────────────┤
                    │                             │
                    │  ┌─────────────────────────┤
                    │  │ WebSocket Notifier        │───▶ Push to Frontend
                    │  └─────────────────────────┤
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │      FRONTEND               │
                    │      (Next.js + TypeScript)  │
                    │                              │
                    │  Dashboard │ Incidents │      │
                    │  Timeline  │ Recovery  │      │
                    │  Canary    │ Simulation│      │
                    │  Alerts    │ Settings  │      │
                    └──────────────────────────────┘
```

---

## 7 Backend Services (Modules)

### 1. Cloud Monitoring Service (`services/monitoring.py`)
**Responsibility**: Connect to AWS and ingest raw storage activity events.

- Polls SQS queue for S3 event notifications
- Parses S3 event JSON (object key, event type, timestamp, identity)
- Handles connection failures and retries
- Runs as a continuous background loop or Celery beat task

**AWS APIs used**: `sqs.receive_message`, `sqs.delete_message`

### 2. Event Processing Service (`services/event_processor.py`)
**Responsibility**: Clean, deduplicate, and store events.

- Receives raw events from monitoring service
- Checks `event_id` uniqueness to prevent duplicate processing
- Normalises event data (parse rename as copy+delete pair)
- Stores events in `cloud_events` table with `processed=False`
- Dispatches events to detection engine

**Key design**: Idempotent — processing the same event twice has no effect.

### 3. Ransomware Detection Engine (`services/detection/`)
**Responsibility**: Analyse events and detect ransomware patterns.

Five sub-detectors, each producing a signal score:

| Sub-detector | File | Input | Output |
|-------------|------|-------|--------|
| Modification burst | `burst.py` | Event stream per identity | Burst score (0–100) |
| Entropy analyser | `entropy.py` | File content sample (first 64KB) | Entropy score (0–8 bits) + delta |
| Rename burst | `rename.py` | Copy+delete event pairs | Rename score (0–100) |
| Canary trigger | `canary.py` | Events matching canary file keys | Boolean + severity |
| Risk scorer | `scorer.py` | All signal scores | Combined risk score (0–100) + threat level |

**Orchestrator** (`engine.py`): Runs all sub-detectors, feeds results to scorer, decides if threshold is crossed.

**Configurable thresholds** (stored in `detection_config` table):
- `burst_window_seconds`: Time window for burst detection (default: 60)
- `burst_threshold_count`: Modifications to trigger burst (default: 50)
- `entropy_threshold`: Shannon entropy value indicating encryption (default: 7.5)
- `rename_threshold_count`: Renames to trigger alert (default: 20)
- `risk_score_alert_threshold`: Risk score to generate alert (default: 60)
- `risk_score_revoke_threshold`: Risk score to auto-revoke (default: 85)

### 4. Alert Management Service (`services/alert_manager.py`)
**Responsibility**: Create and manage security alerts and incidents.

- Creates alert records with severity (LOW / MEDIUM / HIGH / CRITICAL)
- Groups related alerts into incidents
- Stores affected file information
- Pushes real-time notifications via WebSocket
- Supports alert acknowledgement

### 5. Automatic Response Engine (`services/response.py`)
**Responsibility**: Stop the attack by revoking compromised credentials.

- Receives confirmed threat from alert service
- Identifies the compromised IAM access key from event identity info
- **Simulation mode** (default): Logs what would happen without calling IAM
- **Live mode**: Calls `iam.update_access_key(Status='Inactive')` to disable the key
- Records action in `revocation_log` table
- Checks identity against allowlist before revoking
- Notifies admin via WebSocket

**Safety layers**:
1. Allowlist check — never revoke known-safe identities
2. Risk score threshold — only revoke above configurable threshold
3. Simulation mode — default; must be explicitly toggled to live
4. Audit log — every action recorded

### 6. Recovery Engine (`services/recovery.py`)
**Responsibility**: Restore files to their pre-attack clean versions.

- Queries `affected_files` for an incident
- For each file, calls `s3.list_object_versions` to find versions
- Identifies the latest version before the incident `detected_at` timestamp
- Copies clean version as the new current version (`s3.copy_object`)
- Verifies integrity by comparing ETag / content hash
- Updates `affected_files` recovery status
- Reports progress via WebSocket

**Never deletes any version** — only copies the clean version forward.

### 7. WebSocket Notifier (`utils/websocket.py` + `api/ws.py`)
**Responsibility**: Push real-time updates to the dashboard.

- Maintains active WebSocket connections per authenticated user
- Publishes events: new alert, incident status change, revocation, recovery progress
- Uses Redis pub/sub as bridge from Celery workers to WebSocket handler

---

## Background Processing (Celery Workers)

| Worker | Task | Queue |
|--------|------|-------|
| Event Processor | Process raw SQS events, store, dispatch | `events` |
| Detection Worker | Run entropy analysis (downloads file content) | `detection` |
| Response Worker | Execute access revocation | `response` |
| Recovery Worker | Restore files from S3 versions | `recovery` |

**Broker**: Redis
**Result backend**: Redis

Celery Beat schedules:
- SQS polling every 5 seconds
- Canary file health check every 5 minutes
- Stale event cleanup daily

---

## Data Flow: Attack Scenario

```
1. Attacker uses compromised AWS access key
2. Attacker starts encrypting files in S3 bucket
       │
       ▼
3. S3 Event Notification fires for each PutObject / DeleteObject / CopyObject
       │
       ▼
4. Events land in SQS queue
       │
       ▼
5. Monitoring Service polls SQS, receives events
       │
       ▼
6. Event Processor deduplicates and stores events
       │
       ▼
7. Detection Engine analyses:
   ├── Burst detector: "87 modifications in 30 seconds" → score 95
   ├── Canary detector: "canary-report-2024.docx modified" → TRIGGERED
   ├── Entropy analyser: "new file entropy 7.9/8.0" → score 90
   ├── Rename detector: "45 files renamed to .locked" → score 88
   └── Risk scorer: combined score = 93 → CRITICAL
       │
       ▼
8. Alert Manager creates CRITICAL incident
       │
       ▼
9. WebSocket pushes alert to dashboard in real-time
       │
       ▼
10. Response Engine:
    ├── Checks identity against allowlist → NOT allowlisted
    ├── Risk score 93 > revoke threshold 85 → REVOKE
    ├── Simulation mode? → If yes: log only. If no: disable access key
    └── Records in revocation_log + audit_log
       │
       ▼
11. Recovery Engine:
    ├── Lists all files modified by compromised identity since attack start
    ├── For each file: find latest clean version before attack timestamp
    ├── Copy clean version as new current version
    ├── Verify integrity
    └── Report progress via WebSocket
       │
       ▼
12. Dashboard shows complete attack timeline
```

---

## Infrastructure Components

| Component | Purpose | Docker Service |
|-----------|---------|---------------|
| PostgreSQL 16 | Primary database | `db` |
| Redis 7 | Celery broker + cache + pub/sub | `redis` |
| FastAPI | REST API + WebSocket server | `backend` |
| Celery Worker | Background task processing | `celery-worker` |
| Celery Beat | Scheduled task execution | `celery-beat` |
| Next.js | Frontend dashboard | `frontend` |

---

## Communication Patterns

| From | To | Protocol |
|------|----|----------|
| Frontend → Backend | REST API | HTTP (Axios) |
| Frontend ← Backend | Real-time push | WebSocket |
| Backend → AWS | SDK calls | HTTPS (Boto3) |
| Backend → PostgreSQL | ORM queries | TCP (SQLAlchemy) |
| Backend → Redis | Broker / cache | TCP |
| Backend → Celery | Task dispatch | Redis (broker) |
| Celery → Backend | WebSocket bridge | Redis (pub/sub) |
| S3 → SQS | Event notifications | AWS internal |

---

## Security Architecture

1. **JWT Authentication**: All API endpoints require valid JWT (except health check)
2. **Role-Based Access**: `admin` can configure and trigger recovery; `viewer` is read-only
3. **AWS Credentials**: Stored in environment variables only, never in code or database
4. **Least Privilege**: The system's own IAM role only has permissions it needs
5. **Audit Trail**: Every action (alert, revocation, recovery, config change) is logged
6. **Simulation Mode**: Destructive actions (revocation) default to simulation
7. **CORS**: Configured to allow only the frontend origin

