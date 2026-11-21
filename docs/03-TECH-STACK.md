# CYB-03 — Technology Stack

## Overview

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | Next.js | 14+ | React framework with App Router |
| Frontend | TypeScript | 5+ | Type-safe JavaScript |
| Frontend | Tailwind CSS | 3+ | Utility-first styling |
| Frontend | Recharts | 2+ | Charts and data visualizations |
| Frontend | Axios | 1+ | HTTP client for API calls |
| Frontend | Lucide React | latest | Icon library |
| Frontend | WebSocket API | native | Real-time server push |
| Backend | Python | 3.12+ | Primary backend language |
| Backend | FastAPI | 0.110+ | Async REST API framework |
| Backend | Pydantic | 2+ | Request/response validation |
| Backend | SQLAlchemy | 2+ | ORM for database access |
| Backend | Alembic | 1.13+ | Database migrations |
| Backend | Boto3 | 1.34+ | AWS SDK for Python |
| Backend | NumPy | 1.26+ | Entropy calculations |
| Backend | python-jose | 3+ | JWT token handling |
| Backend | passlib | 1.7+ | Password hashing (bcrypt) |
| Background | Celery | 5+ | Distributed task queue |
| Background | Redis | 7+ | Message broker + cache + pub/sub |
| Database | PostgreSQL | 16+ | Relational database |
| Deployment | Docker | 24+ | Containerization |
| Deployment | Docker Compose | 2+ | Multi-container orchestration |

---

## Frontend Details

### Next.js (App Router)
- **Why**: Server-side rendering capability, file-based routing, API routes as fallback, excellent TypeScript support
- **Router**: App Router (`src/app/` directory)
- **Rendering**: Client components for interactive dashboard; server components for static layouts

### Tailwind CSS
- **Why**: Rapid UI development, consistent design system, dark-mode support built-in
- **Theme**: Cybersecurity dark theme with accent colours for severity levels
  - Background: slate-900 / slate-950
  - Critical: red-500
  - High: orange-500
  - Medium: yellow-500
  - Low: blue-500
  - Safe: green-500

### Recharts
- **Used for**:
  - File activity line chart (modifications over time)
  - Alert severity distribution (bar chart)
  - Recovery progress (radial / progress bar)
  - Entropy distribution histogram
  - Attack timeline (custom composed chart)

### Lucide React Icons
- **Why**: Consistent, clean icon set that matches cybersecurity aesthetic
- **Key icons**: Shield, AlertTriangle, FileWarning, Lock, Unlock, RefreshCw, Activity, Database, Eye, Terminal

---

## Backend Details

### FastAPI
- **Why**: Native async support, automatic OpenAPI docs, Pydantic integration, WebSocket support
- **API prefix**: `/api/v1/`
- **Docs**: Available at `/docs` (Swagger) and `/redoc`
- **WebSocket**: Endpoint at `/api/v1/ws`

### Pydantic v2
- **Why**: Data validation, serialization, settings management
- **Usage**: All request bodies, response models, settings classes
- **Config**: `BaseSettings` for environment variable loading

### SQLAlchemy 2.0
- **Why**: Mature ORM, async support, Alembic integration
- **Style**: Declarative mapping with `mapped_column`
- **Session**: Async session factory with dependency injection

### Boto3 (AWS SDK)
- **Services used**:
  - `s3` — Object operations, versioning, listing
  - `sqs` — Receive/delete event messages
  - `iam` — Disable access keys, get user info
  - `cloudtrail` — Lookup API activity events (supplementary)
- **Configuration**: Credentials from environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`)
- **Error handling**: Botocore exceptions with retry logic

### NumPy
- **Why**: Fast Shannon entropy calculation on file content bytes
- **Usage**: `services/detection/entropy.py` — compute byte-frequency distribution and entropy value

---

## AWS Services Details

### S3 (Simple Storage Service)
- **Role**: The cloud storage being monitored and protected
- **Versioning**: MUST be enabled on all monitored buckets (required for recovery)
- **Event Notifications**: Configured to send `s3:ObjectCreated:*`, `s3:ObjectRemoved:*` events to SQS

### SQS (Simple Queue Service)
- **Role**: Reliable event delivery buffer between S3 and our backend
- **Queue type**: Standard (not FIFO — S3 events don't support FIFO)
- **Visibility timeout**: 60 seconds
- **Dead-letter queue**: Configured for events that fail processing 3 times
- **Message retention**: 4 days

### IAM (Identity and Access Management)
- **Role**: Access revocation target
- **API used**: `update_access_key(AccessKeyId=..., Status='Inactive', UserName=...)`
- **Our system's own role needs**:
  - `s3:GetObject`, `s3:PutObject`, `s3:ListBucket`, `s3:ListBucketVersions`, `s3:GetObjectVersion`
  - `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`
  - `iam:UpdateAccessKey`, `iam:ListAccessKeys`, `iam:GetUser` (for the target user only — scoped by policy)
  - `cloudtrail:LookupEvents` (read-only)

### CloudTrail
- **Role**: Supplementary identity attribution — who did what
- **Usage**: Look up `PutObject` / `DeleteObject` events to identify the IAM user/role behind S3 operations
- **Note**: CloudTrail data events for S3 must be enabled (they are not on by default and incur cost)

### EventBridge (Optional)
- **Role**: Can route CloudTrail events to SQS or Lambda for enriched event processing
- **Status**: Nice-to-have; primary path is S3 → SQS directly

---

## Database Details (PostgreSQL)

### Why PostgreSQL
- Robust JSONB support for flexible event/detail storage
- UUID primary key support
- Full-text search capability for audit logs
- Mature, reliable, free

### Connection
- Connection string: `postgresql+asyncpg://user:pass@host:5432/cyb03`
- Async driver: `asyncpg`
- Pool size: 10 (configurable)

### Key Tables
See `04-DATABASE-SCHEMA.md` for complete schema.

---

## Background Processing Details

### Celery
- **Broker**: Redis (`redis://redis:6379/0`)
- **Result backend**: Redis (`redis://redis:6379/1`)
- **Queues**: `events`, `detection`, `response`, `recovery`
- **Concurrency**: 4 workers (configurable)

### Redis
- **DB 0**: Celery broker
- **DB 1**: Celery results
- **DB 2**: WebSocket pub/sub channel
- **DB 3**: Rate-limiting / caching (event dedup, identity activity counters)

---

## Deployment Details

### Docker Compose Services

| Service | Image | Port | Depends On |
|---------|-------|------|------------|
| `db` | postgres:16-alpine | 5432 | — |
| `redis` | redis:7-alpine | 6379 | — |
| `backend` | custom (Dockerfile) | 8000 | db, redis |
| `celery-worker` | same as backend | — | db, redis |
| `celery-beat` | same as backend | — | db, redis |
| `frontend` | custom (Dockerfile) | 3000 | backend |

### Environment Variables

```env
# Database
DATABASE_URL=postgresql+asyncpg://cyb03:password@db:5432/cyb03

# Redis
REDIS_URL=redis://redis:6379/0

# AWS
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1

# Monitored Bucket
S3_MONITORED_BUCKET=cyb03-test-bucket
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/ACCOUNT/cyb03-events

# Auth
JWT_SECRET_KEY=...
JWT_ALGORITHM=HS256
JWT_EXPIRY_MINUTES=60

# System
SIMULATION_MODE=true
LOG_LEVEL=INFO
```

