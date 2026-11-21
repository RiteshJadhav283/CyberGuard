# CYB-03 — Folder Structure

## Complete Project Tree

```
cyb-03/
│
├── docker-compose.yml              # All services: db, redis, backend, celery, frontend
├── .env.example                    # Template for environment variables
├── .env                            # Actual env vars (git-ignored)
├── .gitignore
├── README.md                       # Project overview and quick start
│
├── docs/                           # Documentation (you are reading these)
│   ├── 01-PROJECT-OVERVIEW.md
│   ├── 02-SYSTEM-ARCHITECTURE.md
│   ├── 03-TECH-STACK.md
│   ├── 04-DATABASE-SCHEMA.md
│   ├── 05-API-SPECIFICATION.md
│   ├── 06-DETECTION-ENGINE.md
│   ├── 07-FRONTEND-DESIGN.md
│   ├── 08-AWS-SETUP.md
│   ├── 09-DEVELOPMENT-PHASES.md
│   └── 10-FOLDER-STRUCTURE.md
│
├── backend/
│   ├── Dockerfile                  # Python 3.12 slim, uvicorn
│   ├── requirements.txt            # All Python dependencies
│   ├── alembic.ini                 # Alembic configuration
│   │
│   ├── alembic/                    # Database migrations
│   │   ├── env.py                  # Alembic environment (async SQLAlchemy)
│   │   ├── script.py.mako          # Migration template
│   │   └── versions/               # Migration files
│   │       └── 001_initial_schema.py
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI application entry point
│   │   │                           #   - CORS middleware
│   │   │                           #   - Lifespan (startup: DB init, seed config)
│   │   │                           #   - Include all routers
│   │   │                           #   - Health check endpoint
│   │   │
│   │   ├── config.py               # Pydantic BaseSettings
│   │   │                           #   - DATABASE_URL
│   │   │                           #   - REDIS_URL
│   │   │                           #   - AWS credentials
│   │   │                           #   - JWT settings
│   │   │                           #   - SIMULATION_MODE flag
│   │   │
│   │   ├── database.py             # SQLAlchemy async engine + session
│   │   │                           #   - create_async_engine
│   │   │                           #   - async_sessionmaker
│   │   │                           #   - get_db dependency
│   │   │                           #   - Base declarative class
│   │   │
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── __init__.py         # Exports all models
│   │   │   ├── user.py             # User (email, password, role)
│   │   │   ├── bucket.py           # MonitoredBucket (name, region, status)
│   │   │   ├── event.py            # CloudEvent (event_id UK, type, key, actor)
│   │   │   ├── canary.py           # CanaryFile (key, hash, status)
│   │   │   ├── alert.py            # Alert (severity, type, description)
│   │   │   ├── incident.py         # Incident (status, threat, risk_score, signals)
│   │   │   ├── affected_file.py    # AffectedFile (key, versions, recovery_status)
│   │   │   ├── revocation.py       # RevocationLog (identity, action, simulated)
│   │   │   ├── audit.py            # AuditLog (actor, action, target, details)
│   │   │   └── config.py           # DetectionConfig (key, value)
│   │   │
│   │   ├── schemas/                # Pydantic request/response models
│   │   │   ├── __init__.py
│   │   │   ├── user.py             # UserCreate, UserLogin, UserResponse, Token
│   │   │   ├── bucket.py           # BucketCreate, BucketResponse
│   │   │   ├── event.py            # EventResponse, EventStats
│   │   │   ├── alert.py            # AlertResponse
│   │   │   ├── incident.py         # IncidentResponse, TimelineEvent, IncidentDetail
│   │   │   └── recovery.py         # RecoveryInitiate, RecoveryStatus, FileRecoveryStatus
│   │   │
│   │   ├── api/                    # FastAPI routers (one per domain)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py             # /auth — register, login, me
│   │   │   ├── dashboard.py        # /dashboard — stats, activity, threat-level
│   │   │   ├── buckets.py          # /buckets — CRUD for monitored buckets
│   │   │   ├── events.py           # /events — list, detail, stats
│   │   │   ├── alerts.py           # /alerts — list, acknowledge
│   │   │   ├── incidents.py        # /incidents — list, detail, timeline, files, resolve
│   │   │   ├── canary.py           # /canary — plant, list, verify
│   │   │   ├── recovery.py         # /recovery — initiate, status, restore, verify
│   │   │   ├── simulation.py       # /simulation — start, status, stop, reset
│   │   │   ├── config.py           # /config — get/set detection thresholds
│   │   │   ├── audit.py            # /audit — list, export
│   │   │   └── ws.py               # WebSocket endpoint (/ws)
│   │   │
│   │   ├── services/               # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── monitoring.py       # SQS polling, S3 event parsing
│   │   │   │                       #   - poll_sqs_queue()
│   │   │   │                       #   - parse_s3_event()
│   │   │   │
│   │   │   ├── event_processor.py  # Idempotent event ingestion
│   │   │   │                       #   - process_event()
│   │   │   │                       #   - check_duplicate()
│   │   │   │                       #   - flag_canary_event()
│   │   │   │
│   │   │   ├── detection/          # Ransomware detection engine
│   │   │   │   ├── __init__.py
│   │   │   │   ├── engine.py       # Detection orchestrator
│   │   │   │   │                   #   - analyse_events()
│   │   │   │   │                   #   - run_all_detectors()
│   │   │   │   │                   #   - evaluate_threat()
│   │   │   │   │
│   │   │   │   ├── burst.py        # Modification burst detector
│   │   │   │   │                   #   - count_modifications_in_window()
│   │   │   │   │                   #   - calculate_burst_score()
│   │   │   │   │
│   │   │   │   ├── entropy.py      # File entropy analyser
│   │   │   │   │                   #   - shannon_entropy()
│   │   │   │   │                   #   - entropy_score()
│   │   │   │   │                   #   - analyse_file_entropy()
│   │   │   │   │
│   │   │   │   ├── rename.py       # Rename burst detector
│   │   │   │   │                   #   - correlate_copy_delete()
│   │   │   │   │                   #   - detect_extension_changes()
│   │   │   │   │                   #   - calculate_rename_score()
│   │   │   │   │
│   │   │   │   ├── canary.py       # Canary trigger detector
│   │   │   │   │                   #   - check_canary()
│   │   │   │   │                   #   - get_canary_keys()
│   │   │   │   │
│   │   │   │   └── scorer.py       # Risk scorer and correlator
│   │   │   │                       #   - calculate_risk_score()
│   │   │   │                       #   - determine_threat_level()
│   │   │   │
│   │   │   ├── alert_manager.py    # Alert and incident management
│   │   │   │                       #   - create_alert()
│   │   │   │                       #   - create_or_update_incident()
│   │   │   │                       #   - track_affected_files()
│   │   │   │
│   │   │   ├── response.py         # Automatic access revocation
│   │   │   │                       #   - identify_compromised_key()
│   │   │   │                       #   - revoke_access()
│   │   │   │                       #   - check_simulation_mode()
│   │   │   │                       #   - record_revocation()
│   │   │   │
│   │   │   ├── recovery.py         # File recovery engine
│   │   │   │                       #   - list_affected_files()
│   │   │   │                       #   - find_clean_version()
│   │   │   │                       #   - restore_file()
│   │   │   │                       #   - verify_integrity()
│   │   │   │                       #   - recover_incident()
│   │   │   │
│   │   │   ├── canary_manager.py   # Canary file operations
│   │   │   │                       #   - plant_canary_files()
│   │   │   │                       #   - generate_canary_content()
│   │   │   │                       #   - verify_canary_integrity()
│   │   │   │
│   │   │   └── allowlist.py        # Identity allowlist management
│   │   │                           #   - is_allowlisted()
│   │   │                           #   - get_allowlist()
│   │   │                           #   - update_allowlist()
│   │   │
│   │   ├── workers/                # Celery background tasks
│   │   │   ├── __init__.py
│   │   │   ├── celery_app.py       # Celery instance + configuration
│   │   │   │                       #   - broker = Redis
│   │   │   │                       #   - queues: events, detection, response, recovery
│   │   │   │                       #   - beat schedule
│   │   │   │
│   │   │   ├── event_tasks.py      # Event processing tasks
│   │   │   │                       #   - process_sqs_events (periodic)
│   │   │   │
│   │   │   ├── detection_tasks.py  # Detection tasks
│   │   │   │                       #   - run_detection_analysis
│   │   │   │                       #   - analyse_file_entropy
│   │   │   │
│   │   │   ├── response_tasks.py   # Response tasks
│   │   │   │                       #   - execute_access_revocation
│   │   │   │
│   │   │   └── recovery_tasks.py   # Recovery tasks
│   │   │                           #   - recover_incident_files
│   │   │                           #   - recover_single_file
│   │   │
│   │   ├── aws/                    # AWS SDK wrappers
│   │   │   ├── __init__.py
│   │   │   ├── s3.py               # S3 operations
│   │   │   │                       #   - get_object, put_object
│   │   │   │                       #   - list_objects, list_object_versions
│   │   │   │                       #   - copy_object, delete_object
│   │   │   │                       #   - get_bucket_versioning
│   │   │   │
│   │   │   ├── sqs.py              # SQS operations
│   │   │   │                       #   - receive_messages
│   │   │   │                       #   - delete_message
│   │   │   │                       #   - get_queue_attributes
│   │   │   │
│   │   │   ├── iam.py              # IAM operations
│   │   │   │                       #   - disable_access_key
│   │   │   │                       #   - enable_access_key
│   │   │   │                       #   - list_access_keys
│   │   │   │                       #   - get_user
│   │   │   │
│   │   │   └── cloudtrail.py       # CloudTrail operations
│   │   │                           #   - lookup_events
│   │   │                           #   - get_identity_for_event
│   │   │
│   │   └── utils/                  # Utilities
│   │       ├── __init__.py
│   │       ├── security.py         # JWT + password hashing
│   │       │                       #   - create_access_token()
│   │       │                       #   - verify_token()
│   │       │                       #   - hash_password()
│   │       │                       #   - verify_password()
│   │       │                       #   - get_current_user (FastAPI dep)
│   │       │                       #   - require_admin (FastAPI dep)
│   │       │
│   │       └── websocket.py        # WebSocket connection manager
│   │                               #   - ConnectionManager class
│   │                               #   - connect, disconnect
│   │                               #   - broadcast, send_personal
│   │
│   └── tests/                      # Backend tests
│       ├── conftest.py             # Test fixtures, test DB
│       ├── test_auth.py            # Authentication tests
│       ├── test_detection.py       # Detection engine tests
│       ├── test_recovery.py        # Recovery logic tests
│       ├── test_event_processor.py # Event processing tests
│       └── test_api.py             # API endpoint tests
│
├── frontend/
│   ├── Dockerfile                  # Node 20 alpine, build + run
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts          # Dark theme configuration
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   │
│   ├── public/                     # Static assets
│   │   └── favicon.ico
│   │
│   └── src/
│       ├── app/                    # Next.js App Router pages
│       │   ├── layout.tsx          # Root layout (HTML, body, font)
│       │   ├── page.tsx            # Dashboard (main page)
│       │   ├── login/
│       │   │   └── page.tsx        # Login page
│       │   ├── incidents/
│       │   │   ├── page.tsx        # Incident list
│       │   │   └── [id]/
│       │   │       └── page.tsx    # Incident detail
│       │   ├── alerts/
│       │   │   └── page.tsx        # Alert feed
│       │   ├── canary/
│       │   │   └── page.tsx        # Canary management
│       │   ├── recovery/
│       │   │   └── page.tsx        # Recovery console
│       │   ├── simulation/
│       │   │   └── page.tsx        # Simulation controls
│       │   └── settings/
│       │       └── page.tsx        # Configuration
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx     # Navigation sidebar
│       │   │   ├── Header.tsx      # Top bar
│       │   │   └── DashboardLayout.tsx  # Page wrapper
│       │   │
│       │   ├── dashboard/
│       │   │   ├── StatCard.tsx         # Metric card
│       │   │   ├── ThreatGauge.tsx      # Threat level gauge
│       │   │   ├── AttackTimeline.tsx    # Vertical event timeline
│       │   │   ├── FileActivityChart.tsx # Line chart (Recharts)
│       │   │   ├── AlertFeed.tsx         # Live alert list
│       │   │   └── RecoveryProgress.tsx  # Progress bar
│       │   │
│       │   ├── incidents/
│       │   │   ├── IncidentTable.tsx     # Sortable incident table
│       │   │   └── IncidentDetail.tsx    # Full incident view
│       │   │
│       │   └── common/
│       │       ├── Badge.tsx       # Severity/status badge
│       │       ├── Button.tsx      # Styled button
│       │       └── Modal.tsx       # Confirmation modal
│       │
│       ├── hooks/
│       │   ├── useWebSocket.ts     # WebSocket connection hook
│       │   └── useApi.ts           # API request hook with loading/error
│       │
│       ├── lib/
│       │   ├── api.ts              # Axios instance with JWT interceptor
│       │   └── types.ts            # TypeScript interfaces
│       │
│       └── context/
│           └── AuthContext.tsx      # Auth state provider
│
└── scripts/                        # Utility scripts
    ├── setup_test_bucket.py        # Create and populate test S3 bucket
    ├── plant_canaries.py           # Plant canary files via API
    └── simulate_ransomware.py      # Safe ransomware simulation
```

---

## File Counts by Area

| Area | Files | Description |
|------|-------|-------------|
| Root | 5 | docker-compose, env, gitignore, readme |
| Docs | 10 | Architecture and design documentation |
| Backend / Models | 11 | SQLAlchemy ORM models |
| Backend / Schemas | 7 | Pydantic request/response |
| Backend / API | 13 | FastAPI routers |
| Backend / Services | 10 | Business logic |
| Backend / Detection | 6 | Detection sub-modules |
| Backend / Workers | 5 | Celery tasks |
| Backend / AWS | 5 | SDK wrappers |
| Backend / Utils | 3 | Security, WebSocket |
| Backend / Tests | 6 | Test files |
| Frontend / Pages | 9 | Next.js pages |
| Frontend / Components | 12 | React components |
| Frontend / Hooks + Lib | 4 | Utilities |
| Scripts | 3 | Simulation scripts |
| **Total** | **~109** | |

