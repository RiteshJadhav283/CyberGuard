# AEGIS · ToyGuard

AEGIS monitors a customer's existing S3 bucket, explains suspicious file changes and coordinates approved containment and recovery. Two operating modes share the same detection and response workflow. **Replay** uses local synthetic events and copies. **AWS** consumes customer audit events and executes approved jobs through separate customer-owned roles.

## Run the practice workflow

From the repository root, with Docker Compose installed:

```sh
(test -e .env || (umask 077 && printf 'AEGIS_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env))
docker compose up --build -d --wait
docker compose exec api python -m aegis.demo --customer demo
```

Account provisioning prints each newly created account and its password once. Repeating the command keeps existing accounts. Open [the console](http://localhost:3000).

1. Sign in as the demo administrator. In **Connections**, select **Add practice bucket**. Run **routine**, then **bulk**. Open **Activity** to see the changes. Neither scenario alone should open an incident.
2. Run **correlated**. Open **Incidents** and inspect the score, affected keys, actor and earlier activity. Replay time advances in separate five-minute intervals so the scenarios can be rehearsed quickly.
3. Select **Preview restriction**, review its scope, then **approve**. The local worker records a simulated containment result. Alternatively, enter a reason and choose **Skip containment**.
4. Select two affected files and choose **Preview selected recovery**. Expand the items to review source versions, checksums and recovery destinations. Approve, wait for verification, and download a recovered file.
5. Reverse an applied restriction, close the incident with a reason and select **Export evidence**. To try role boundaries, sign in as the analyst to prepare a preview or the viewer to read a case. Only the customer administrator can approve.
6. For the earlier single-report fixture, run `docker compose exec api python -m aegis.demo --customer demo --case` and open **Single-report fixture**.

Stop the services with `docker compose down`. The named database volume retains cases and decisions.

## Local development

From `backend/`, activate a Python 3.12 virtual environment, then run:

```sh
python -m pip install -r requirements-test.txt
alembic upgrade head
python -m aegis.demo --customer demo
python -m unittest discover -s tests -v
uvicorn aegis.main:app --port 8000
```

In a second terminal with the same environment and working directory, run `python -m aegis.worker`. A single worker invocation with `--once` performs one pass. In a third terminal, run the frontend from `frontend/` with Node 24:

```sh
npm ci
API_ORIGIN=http://127.0.0.1:8000 npm run dev
```

The local database defaults to SQLite. Compose uses PostgreSQL. The tests use an isolated temporary database unless `AEGIS_EMPTY_TEST_DATABASE` names a dedicated empty PostgreSQL database. See the [API reference](http://localhost:8000/docs) while the backend is running.

## Connect a customer

Follow the [Guardian onboarding and operations guide](guardian/README.md). The customer supplies an existing versioned bucket. The template creates AEGIS-specific monitoring resources, roles and a recovery destination. Test-role containment is opt-in. The application running on the customer's infrastructure needs no changes.

## How this implementation fits the plan

| Capability | Implementation |
|---|---|
| Monitoring | CloudTrail S3 data events arrive through EventBridge and SQS. One event stream supplies both the operation and actor evidence. The consumer stores events before acknowledgement. |
| Detection | Fixed five-minute windows group distinct changes by connection and actor. Canary, declared read-only identity, bulk changes, related copies and deletions, and optional synthetic sample randomness contribute to an explainable score. The incident threshold is 60. |
| Response | A persisted case records review, approval, expiry, verification, reversal and closure. A restricted test role and unaffected control role provide scoped AWS verification. |
| Recovery | Operator-provided trusted version IDs and SHA-256 values bind each approved source to a unique destination. A worker resumes one selected file at a time and reads each destination back. A file must fit within the five MiB prototype limit. |
| Operator interface | Customer-scoped console, live change notifications with periodic refresh, evidence export, and optional Slack and Jira deliveries. |
| Background execution | One Python worker consumes the queue and durable SQL jobs. The prototype runs without a separate Redis or Celery service. |

The full design remains in [the project plan](docs/12-IMPLEMENTATION-PLAN.md). The local acceptance tests cover role isolation, fixture recovery, replay detection and response, plus AWS adapter behavior with test doubles. A live AWS rehearsal, external notification receipt and measured end-to-end cloud latency require a configured customer sandbox.
