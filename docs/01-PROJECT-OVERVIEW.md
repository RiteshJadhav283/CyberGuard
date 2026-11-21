# CYB-03 — Project Overview

## Project Name
**Cloud Storage Ransomware Early-Warning and Automatic Recovery System**

## Project Code
CYB-03

---

## What We Are Building

AEGIS observes changes to customer-selected S3 files, explains suspicious activity and prepares a customer-approved recovery plan. The first implementation uses synthetic local versions. The AWS milestone adds the live connector and a separate recovery bucket.

## Core workflow

Observe → investigate → review scoped containment → approve a specific recovery plan → verify the recovered copy.

## Why This Exists

Companies store thousands of critical files in cloud storage. If an attacker compromises storage credentials, they can encrypt, rename, modify or corrupt thousands of files in minutes. Traditional security detects attacks only after major damage. The team will measure detection and recovery latency during the live demo.

---

## Functional Requirements

### A. Cloud Storage Monitoring
- Monitor AWS S3 buckets via APIs
- Track uploads, modifications, deletions, renames (copy + delete)
- Monitor frequency and volume of modifications
- Track which IAM identity / access key performs each operation
- Continuously collect and analyse storage activity events
- Architecture must allow future Google Cloud Storage and Azure Blob Storage support

### B. Canary / Decoy Files
- Automatically plant hidden decoy files inside S3 buckets
- Decoy files resemble real company documents (`.docx`, `.xlsx`, `.pdf`)
- Monitor any unexpected access, modification, deletion or overwrite of canary files
- Trigger high-priority alert when a canary file is suspiciously modified
- Canary files serve as the earliest warning — before large-scale encryption begins

### C. Mass Encryption Detection (Multi-Signal)
The detection engine uses **five combined signals**:

| Signal | What It Detects |
|--------|----------------|
| **Modification bursts** | Unusually high file modification count in a short window |
| **Entropy analysis** | Sudden increase in file content randomness (indicates encryption) |
| **Rename bursts** | Mass renaming of files, especially adding extensions like `.locked`, `.encrypted` |
| **Canary triggers** | Any modification to planted decoy files |
| **Activity correlation** | Combining multiple weak signals into a strong detection |

Detection must happen within seconds where technically feasible. Never rely on a single signal alone.

### D. Customer-controlled containment

Monitor-only is the default. An authorized customer administrator can approve a reversible restriction on the designated demo writer after reviewing identity evidence. Record and verify its effect on the scoped resource.

### E. Approved file recovery

Preview exact source versions, the trusted expected checksum and the separate recovery destination. Require explicit customer approval, preserve the original versions and verify the resulting copy by reading it back.

### F. False Positive Reduction
- Configurable detection thresholds
- Activity-rate analysis over configurable windows
- Multi-signal correlation (require 2+ signals)
- Allowlisted IAM identities and operations
- Risk scoring (0–100 scale)
- Simulation mode (log actions without executing)
- Human approval gate for uncertain / high-impact actions
- Distinguish legitimate bulk uploads from suspicious mass encryption

### G. Security Dashboard
Display in real-time:
- Total monitored files and connected buckets
- Monitoring status (active / paused / error)
- Total alerts and active incidents
- Suspicious file modifications count
- Canary file activity
- Compromised identities
- Revoked credentials
- Affected files count
- Recovery progress and success rate

**Attack Timeline** showing:
1. First suspicious activity detected
2. Detection confirmation timestamp
3. Alert generated
4. Access revoked
5. Recovery initiated
6. Recovery completed

Incident detail view with downloadable audit reports.

---

## Non-Functional Requirements

- Modular, maintainable architecture (separate services)
- Frontend and backend properly separated
- Reusable components and services
- API validation (Pydantic)
- Authentication (JWT) + role-based access control
- AWS credentials never exposed to frontend
- Least-privilege IAM permissions
- Detailed audit logs for all actions
- API failure handling with retries
- Idempotent event processing (S3 events can be duplicated)
- Detection engine independent of frontend
- Configurable thresholds via API / environment
- WebSocket for real-time dashboard updates
- Meaningful tests and documentation

---

## What This Is NOT

- Not actual ransomware — the simulation is strictly limited to harmless dummy files in an isolated test bucket
- Not a file backup system — we leverage existing S3 Versioning
- Not a general-purpose SIEM — focused specifically on cloud storage ransomware
- Not a production-ready SaaS — it's a demonstrable prototype for the CYB-03 problem statement

