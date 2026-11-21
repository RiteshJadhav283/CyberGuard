# AEGIS · ToyGuard

AEGIS helps a customer investigate suspicious file changes and recover a reviewed version. This checkout implements the **single-report local recovery checkpoint** from the [project plan](docs/12-IMPLEMENTATION-PLAN.md).

## Try the checkpoint with Docker Compose

Run from the repository root with Docker Compose installed. For a fresh checkout, create the local database setting once:

```sh
(test -e .env || (umask 077 && printf 'AEGIS_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env))
docker compose up --build -d --wait
docker compose exec api python -m aegis.demo
```

The last command prints generated passwords for three demo accounts on first creation. Keep them for this local demo. Visit [the console](http://localhost:3000), sign in as the viewer and inspect the empty incident list. Then add one synthetic case:

```sh
docker compose exec api python -m aegis.demo --case
```

1. Sign out and sign in as the analyst. Open **Synthetic report revision** and choose **Prepare preview**. Review the pinned source version, destination, digest and expiry.
2. Sign in as the administrator, open the same case and approve that version. Open the verified file and review the audit timeline.
3. Sign in as the viewer. A viewer can inspect the case and download a verified copy. Only the administrator can approve a pending plan.
4. To rehearse customer isolation, provision a second set of accounts with `python -m aegis.demo --customer second` inside the API container. The second customer starts with an empty case list.

Each explicit `--case` adds a fresh case. Re-running account provisioning preserves existing passwords. Stop the demo with `docker compose down`. The named PostgreSQL volume retains its state.

## Local development without Docker

From `backend/`, with Python 3.12 and a virtual environment active:

```sh
python -m pip install -r requirements-test.txt
alembic upgrade head
python -m aegis.demo --case
python -m unittest discover -s tests -v
uvicorn aegis.main:app --port 8000
```

The local default is SQLite. Compose selects PostgreSQL via `DATABASE_URL`. The API exposes [interactive endpoint documentation](http://localhost:8000/docs). Tests create a temporary SQLite database. To exercise the PostgreSQL tests, supply `AEGIS_EMPTY_TEST_DATABASE` pointing to a dedicated empty test database.

In a separate terminal, from `frontend/` with Node 24:

```sh
npm ci
API_ORIGIN=http://127.0.0.1:8000 npm run dev
```

## Implementation boundary

- The console and API use real database records, server-checked customer roles and expiring, revocable opaque bearer sessions. Provisioning is available through the local operator command. The browser keeps the session token in memory and a reload requires signing in again.
- The fixture records two harmless versions and a reference digest for a synthetic report. The recovery preview expires after 15 minutes. Approval, copy and verification execute in one local database transaction. The recovered record is separate from both source versions.
- This checkpoint exercises a known case supplied by the fixture. Delivery from AWS, automatic detection, S3 recovery, distributed workers, containment and Slack delivery belong to later milestones. The local verification does not establish any of those cloud capabilities.

## Next acceptance gate

Independently deploy MediCore, connect one selected versioned S3 bucket and observe one real report change through the queue. Preserve the existing preview and approval behavior when introducing the cloud storage adapter. Cloud execution needs per-item durable work and reconciliation after an interrupted external write.
