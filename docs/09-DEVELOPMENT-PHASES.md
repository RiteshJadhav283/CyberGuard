# CYB-03 — Development Phases & Checklist

> Earlier design proposal. For implementation order, permission scope and recovery behavior, use [the approved plan](12-IMPLEMENTATION-PLAN.md). The [README](../README.md) lists the capabilities available in the current checkout.

## Phase Overview

| Phase | Name | Dependencies | Estimated Effort |
|-------|------|-------------|-----------------|
| 1 | Foundation | None | Backend scaffolding, DB, auth, AWS wrappers |
| 2 | Cloud Monitoring & Events | Phase 1 | SQS polling, event ingestion, canary planting |
| 3 | Detection Engine | Phase 2 | All 5 detectors, risk scoring |
| 4 | Alert, Response & Recovery | Phase 3 | Incidents, revocation, S3 version restore |
| 5 | Real-Time & WebSockets | Phase 4 | WebSocket push, Redis pub/sub bridge |
| 6 | Frontend Dashboard | Phase 5 (can partially parallel from Phase 4) | All pages and components |
| 7 | Simulation & E2E Testing | Phase 6 | Simulation scripts, full workflow test |

---

## Phase 1 — Foundation

### Goal
Set up the project skeleton: Docker Compose, database models, FastAPI application, JWT auth, and AWS SDK wrappers.

### Tasks

- [ ] **1.1** Create project root with `docker-compose.yml`
  - PostgreSQL 16 service
  - Redis 7 service
  - Backend (FastAPI) service
  - Celery worker service
  - Celery beat service
  - Frontend (Next.js) service
  - Proper networking and volume configuration

- [ ] **1.2** Create `.env.example` with all required environment variables

- [ ] **1.3** Create `backend/Dockerfile`
  - Python 3.12 slim base
  - Install dependencies from `requirements.txt`
  - Run with uvicorn

- [ ] **1.4** Create `backend/requirements.txt` with all Python dependencies

- [ ] **1.5** Create `backend/app/config.py`
  - Pydantic `BaseSettings` class
  - Load all env vars with defaults and validation

- [ ] **1.6** Create `backend/app/database.py`
  - Async SQLAlchemy engine and session factory
  - Base model class
  - `get_db` dependency for FastAPI

- [ ] **1.7** Create all SQLAlchemy models (`backend/app/models/`)
  - `user.py` — User model
  - `bucket.py` — MonitoredBucket model
  - `event.py` — CloudEvent model
  - `canary.py` — CanaryFile model
  - `alert.py` — Alert model
  - `incident.py` — Incident model
  - `affected_file.py` — AffectedFile model
  - `revocation.py` — RevocationLog model
  - `audit.py` — AuditLog model
  - `config.py` — DetectionConfig model
  - `__init__.py` — Export all models

- [ ] **1.8** Set up Alembic
  - `alembic.ini` configuration
  - `alembic/env.py` with async support
  - Initial migration: all tables

- [ ] **1.9** Create `backend/app/main.py`
  - FastAPI application instance
  - CORS middleware
  - Lifespan events (startup: run migrations, seed config)
  - Include all routers
  - Health check endpoint

- [ ] **1.10** Create Pydantic schemas (`backend/app/schemas/`)
  - `user.py` — Login, register, user response
  - `bucket.py` — Bucket create/response
  - `event.py` — Event response
  - `alert.py` — Alert response
  - `incident.py` — Incident response, timeline
  - `recovery.py` — Recovery request/response/progress

- [ ] **1.11** Create `backend/app/utils/security.py`
  - Password hashing (bcrypt)
  - JWT token creation and verification
  - `get_current_user` dependency
  - `require_admin` dependency

- [ ] **1.12** Create `backend/app/api/auth.py`
  - POST `/auth/register`
  - POST `/auth/login`
  - GET `/auth/me`

- [ ] **1.13** Create AWS SDK wrappers (`backend/app/aws/`)
  - `s3.py` — S3 client wrapper (get, put, list, list_versions, copy)
  - `sqs.py` — SQS client wrapper (receive, delete, get_attributes)
  - `iam.py` — IAM client wrapper (disable_key, list_keys, get_user)
  - `cloudtrail.py` — CloudTrail wrapper (lookup_events)

- [ ] **1.14** Create `backend/app/api/dashboard.py`
  - GET `/dashboard/stats` — aggregate stats from DB

- [ ] **1.15** Set up Celery (`backend/app/workers/`)
  - `celery_app.py` — Celery instance with Redis broker

- [ ] **1.16** Write basic tests
  - Database connection test
  - Auth endpoint tests
  - Health check test

- [ ] **1.17** Verify everything starts with `docker-compose up`

### Completion Criteria
- `docker-compose up` starts all services without errors
- Database tables are created via Alembic migration
- `/health` returns 200
- `/auth/register` and `/auth/login` work
- `/dashboard/stats` returns zeroed stats
- AWS wrappers instantiate without error (even without real AWS creds)

---

## Phase 2 — Cloud Monitoring & Event Processing

### Goal
Ingest S3 events from SQS, process them idempotently, and plant canary files.

### Tasks

- [ ] **2.1** Create `backend/app/services/monitoring.py`
  - SQS polling loop (configurable interval)
  - Parse S3 event notification JSON
  - Extract: event type, object key, size, etag, timestamp, identity
  - Handle malformed messages gracefully

- [ ] **2.2** Create `backend/app/services/event_processor.py`
  - Idempotent event storage (check `event_id` uniqueness)
  - Normalise event data
  - Mark events as processed
  - Detect canary file events (flag `is_canary`)

- [ ] **2.3** Create `backend/app/workers/event_tasks.py`
  - Celery task: `process_sqs_events` — calls monitoring + event processor
  - Celery beat schedule: run every 5 seconds

- [ ] **2.4** Create `backend/app/services/canary_manager.py`
  - Plant canary files in S3 (realistic names and content)
  - Register canaries in database
  - Verify canary integrity (periodic check)
  - Remove canary files

- [ ] **2.5** Create `backend/app/api/events.py`
  - GET `/events` — list events (paginated, filterable)
  - GET `/events/{id}` — event details
  - GET `/events/stats` — event statistics

- [ ] **2.6** Create `backend/app/api/canary.py`
  - POST `/canary/plant` — plant canary files
  - GET `/canary` — list canary files
  - POST `/canary/verify` — check integrity

- [ ] **2.7** Create `backend/app/api/buckets.py`
  - CRUD for monitored buckets

- [ ] **2.8** Test: upload a file to S3, verify event appears in database

### Completion Criteria
- SQS polling receives S3 events within 5–10 seconds
- Events are stored in `cloud_events` table with no duplicates
- Canary files are planted in S3 with correct content
- Canary events are flagged as `is_canary=True`
- API endpoints return event data correctly

---

## Phase 3 — Ransomware Detection Engine

### Goal
Build all five detection sub-modules and the risk scorer.

### Tasks

- [ ] **3.1** Create `backend/app/services/detection/burst.py`
  - Count modifications per identity in sliding window
  - Calculate burst score (0–100)

- [ ] **3.2** Create `backend/app/services/detection/entropy.py`
  - Download file content sample from S3
  - Compute Shannon entropy using NumPy
  - Calculate entropy score considering file type
  - Run as async Celery task

- [ ] **3.3** Create `backend/app/services/detection/rename.py`
  - Correlate copy + delete events as renames
  - Detect extension changes
  - Check for known ransomware extensions
  - Calculate rename score (0–100)

- [ ] **3.4** Create `backend/app/services/detection/canary.py`
  - Check events against canary file registry
  - Return triggered status and severity

- [ ] **3.5** Create `backend/app/services/detection/scorer.py`
  - Weighted combination of all signal scores
  - Signal count bonus for multi-signal correlation
  - Determine threat level (LOW/MEDIUM/HIGH/CRITICAL)

- [ ] **3.6** Create `backend/app/services/detection/engine.py`
  - Orchestrate all detectors on new events
  - Group events by identity
  - Trigger detection analysis
  - If risk score exceeds threshold → create incident

- [ ] **3.7** Create `backend/app/services/allowlist.py`
  - Load allowlisted identities from DB config
  - Check identity against allowlist
  - Prevent revocation of allowlisted identities

- [ ] **3.8** Create `backend/app/workers/detection_tasks.py`
  - Celery task: `run_detection_analysis`
  - Celery task: `analyse_file_entropy`

- [ ] **3.9** Write detection unit tests
  - Test burst score calculation with various inputs
  - Test entropy calculation with known data
  - Test rename detection with copy+delete pairs
  - Test risk scorer with various signal combinations
  - Test allowlist filtering

### Completion Criteria
- Burst detector correctly identifies high-frequency modifications
- Entropy analyser correctly flags encrypted vs normal content
- Rename detector correlates copy+delete events
- Canary detector flags canary file events
- Risk scorer produces correct threat levels for test scenarios
- Allowlisted identities bypass revocation

---

## Phase 4 — Alert, Response & Recovery

### Goal
Create incidents, revoke access, and restore files from S3 versions.

### Tasks

- [ ] **4.1** Create `backend/app/services/alert_manager.py`
  - Create alerts with severity
  - Create or update incidents
  - Group alerts into incidents by identity + time window
  - Track affected files

- [ ] **4.2** Create `backend/app/services/response.py`
  - Identify compromised access key from identity ARN
  - Simulation mode: log revocation without executing
  - Live mode: call IAM to disable access key
  - Record in `revocation_log`
  - Check allowlist before revoking
  - Create audit log entries

- [ ] **4.3** Create `backend/app/services/recovery.py`
  - List all affected files for an incident
  - For each file: find versions, identify last clean version (before attack)
  - Copy clean version as new current version
  - Verify integrity (ETag comparison)
  - Update recovery status per file
  - Track overall recovery progress

- [ ] **4.4** Create `backend/app/api/incidents.py`
  - GET `/incidents` — list incidents
  - GET `/incidents/{id}` — incident details
  - GET `/incidents/{id}/timeline` — attack timeline
  - GET `/incidents/{id}/affected-files` — affected files
  - PUT `/incidents/{id}/status` — update status
  - PUT `/incidents/{id}/resolve` — resolve

- [ ] **4.5** Create `backend/app/api/alerts.py`
  - GET `/alerts` — list alerts
  - PUT `/alerts/{id}/acknowledge` — acknowledge

- [ ] **4.6** Create `backend/app/api/recovery.py`
  - POST `/recovery/initiate/{incident_id}` — start recovery
  - GET `/recovery/status/{incident_id}` — progress
  - POST `/recovery/restore-file` — single file restore
  - POST `/recovery/verify/{incident_id}` — verify integrity

- [ ] **4.7** Create `backend/app/workers/response_tasks.py`
  - Celery task: `execute_access_revocation`

- [ ] **4.8** Create `backend/app/workers/recovery_tasks.py`
  - Celery task: `recover_incident_files`
  - Celery task: `recover_single_file`

- [ ] **4.9** Create audit logging integration
  - Log all alert, response and recovery actions
  - GET `/audit` endpoint
  - GET `/audit/export` endpoint

- [ ] **4.10** Write tests
  - Test incident creation and status transitions
  - Test revocation in simulation mode
  - Test file recovery logic (mock S3 versions)

### Completion Criteria
- Incidents are created when risk score exceeds threshold
- Access revocation works in simulation mode (logged but not executed)
- Recovery engine lists affected files and restores from versions
- Attack timeline is accurately constructed from incident events
- All actions are recorded in audit log

---

## Phase 5 — Real-Time & WebSockets

### Goal
Push live updates to the frontend dashboard via WebSocket.

### Tasks

- [ ] **5.1** Create `backend/app/utils/websocket.py`
  - WebSocket connection manager (track active connections)
  - Broadcast to all connections
  - Send to specific user

- [ ] **5.2** Create `backend/app/api/ws.py`
  - WebSocket endpoint at `/api/v1/ws`
  - JWT authentication on connection
  - Keep-alive ping/pong

- [ ] **5.3** Create Redis pub/sub bridge
  - Celery workers publish events to Redis channel
  - WebSocket handler subscribes to Redis channel
  - Forward messages to connected clients

- [ ] **5.4** Integrate WebSocket notifications into:
  - Alert creation → `alert_created`
  - Incident updates → `incident_updated`
  - Access revocation → `access_revoked`
  - Recovery progress → `recovery_progress`
  - Canary triggers → `canary_triggered`

- [ ] **5.5** Test WebSocket with a simple client

### Completion Criteria
- WebSocket connection establishes with JWT auth
- Real-time alerts appear on connected clients within 1 second of creation
- Recovery progress updates stream to clients
- Connection manager handles disconnects gracefully

---

## Phase 6 — Frontend Dashboard

### Goal
Build the complete Next.js dashboard with all pages and components.

### Tasks

- [ ] **6.1** Next.js project setup
  - Create Next.js 14 project with TypeScript
  - Configure Tailwind CSS (dark theme)
  - Set up project structure

- [ ] **6.2** Create layout components
  - `Sidebar.tsx` — navigation sidebar
  - `Header.tsx` — top bar with user info
  - `DashboardLayout.tsx` — wrap all pages

- [ ] **6.3** Create common components
  - `Badge.tsx` — severity/status badges
  - `Button.tsx` — styled button variants
  - `Modal.tsx` — confirmation modals

- [ ] **6.4** Set up API client and types
  - `lib/api.ts` — Axios instance with JWT interceptor
  - `lib/types.ts` — TypeScript interfaces matching backend schemas
  - `context/AuthContext.tsx` — auth state management

- [ ] **6.5** Create auth pages
  - `login/page.tsx` — login form

- [ ] **6.6** Create dashboard page (`page.tsx`)
  - `StatCard.tsx` — metric card component
  - `ThreatGauge.tsx` — threat level visualisation
  - `FileActivityChart.tsx` — Recharts line chart
  - `AlertFeed.tsx` — real-time alert list
  - `AttackTimeline.tsx` — timeline component
  - `RecoveryProgress.tsx` — progress bar
  - Compose all components in dashboard layout

- [ ] **6.7** Create incidents pages
  - `incidents/page.tsx` — incident table with filtering
  - `incidents/[id]/page.tsx` — incident detail with tabs
  - `IncidentTable.tsx`
  - `IncidentDetail.tsx`

- [ ] **6.8** Create alerts page
  - `alerts/page.tsx` — alert feed with filtering and acknowledgement

- [ ] **6.9** Create canary page
  - `canary/page.tsx` — canary file list, plant form, health check

- [ ] **6.10** Create recovery page
  - `recovery/page.tsx` — recovery console with progress and one-click restore

- [ ] **6.11** Create simulation page
  - `simulation/page.tsx` — simulation controls and live log

- [ ] **6.12** Create settings page
  - `settings/page.tsx` — detection thresholds, allowlist, simulation mode toggle

- [ ] **6.13** Set up WebSocket hook
  - `hooks/useWebSocket.ts` — connect, receive, handle events

- [ ] **6.14** Create `frontend/Dockerfile`
  - Node 20 alpine base
  - Build and run Next.js

- [ ] **6.15** Integration test: verify frontend talks to backend

### Completion Criteria
- Dashboard loads and displays all stat cards
- Charts render with real or test data
- WebSocket connection shows real-time updates
- All pages are navigable and functional
- Authentication flow works end-to-end

---

## Phase 7 — Simulation & End-to-End Testing

### Goal
Create safe simulation scripts and demonstrate the full attack-detect-revoke-recover workflow.

### Tasks

- [ ] **7.1** Create `scripts/setup_test_bucket.py`
  - Create S3 bucket (or verify it exists)
  - Enable versioning
  - Upload 50 dummy files with realistic content
  - Set up SQS queue and event notifications

- [ ] **7.2** Create `scripts/plant_canaries.py`
  - Plant 5–10 canary files via the API
  - Verify they appear in S3 and database

- [ ] **7.3** Create `scripts/simulate_ransomware.py`
  - Use attacker simulation credentials
  - For each file in the bucket:
    - Download the file
    - "Encrypt" it (replace content with random bytes using `os.urandom`)
    - Upload the encrypted version
    - Optionally rename with `.locked` extension (copy + delete)
  - Include configurable delay between files
  - Include canary file modification
  - Log all actions

- [ ] **7.4** Create `backend/app/api/simulation.py`
  - POST `/simulation/start` — trigger simulation from dashboard
  - GET `/simulation/status` — current status
  - POST `/simulation/reset` — restore test bucket to clean state

- [ ] **7.5** End-to-end test walkthrough
  1. Start the system (`docker-compose up`)
  2. Register and login
  3. Add test bucket to monitoring
  4. Plant canary files
  5. Verify dashboard shows healthy state
  6. Run ransomware simulation
  7. Watch dashboard detect the attack in real-time
  8. Verify alert is generated
  9. Verify access is revoked (or logged in simulation mode)
  10. Initiate file recovery
  11. Verify files are restored
  12. View complete attack timeline
  13. Download audit report

- [ ] **7.6** Document the demo flow in a README or guide

### Completion Criteria
- Full attack simulation runs successfully
- System detects attack within 10–20 seconds
- All five detection signals fire correctly
- Alert is generated with correct severity
- Access revocation is recorded
- Files are recovered from S3 versions
- Attack timeline shows all steps with timestamps
- Dashboard displays the complete incident lifecycle

---

## Post-MVP Enhancements (Future)

These are not required for the initial deliverable but could be added later:

- [ ] Google Cloud Storage + Azure Blob Storage support
- [ ] Activity baseline learning (normal patterns per identity)
- [ ] Email / Slack notifications
- [ ] Multi-bucket monitoring
- [ ] User management (admin can add/remove dashboard users)
- [ ] Scheduled audit report generation
- [ ] Rate limiting on API
- [ ] Kubernetes deployment configuration
- [ ] CI/CD pipeline

