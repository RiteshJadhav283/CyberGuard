# CYB-03 — Ransomware Detection Engine

## Overview

The detection engine is the core intelligence of the system. It analyses incoming cloud storage events and determines whether a ransomware attack is underway. It uses **five independent detection signals** combined into a single risk score.

No single signal should trigger a full response (access revocation). Multiple corroborating signals are required for high-confidence detection.

---

## Detection Pipeline

```
Cloud Events (from SQS)
       │
       ▼
┌──────────────────┐
│ Event Processor   │── Dedup, normalise, store
└───────┬──────────┘
        │
        ▼
┌──────────────────────────────────────────────────────┐
│                DETECTION ENGINE                       │
│                                                       │
│  ┌────────────────┐  ┌────────────────┐              │
│  │ Burst Detector  │  │ Rename Detector │              │
│  │ (burst.py)      │  │ (rename.py)     │              │
│  │                 │  │                  │              │
│  │ Score: 0-100    │  │ Score: 0-100     │              │
│  └───────┬─────────┘  └───────┬──────────┘              │
│          │                     │                         │
│  ┌───────┴─────────┐  ┌───────┴──────────┐              │
│  │ Entropy Analyser │  │ Canary Detector  │              │
│  │ (entropy.py)     │  │ (canary.py)      │              │
│  │                  │  │                   │              │
│  │ Score: 0-100     │  │ Triggered: bool   │              │
│  │ (from entropy    │  │ Severity: CRITICAL│              │
│  │  value 0-8)      │  │                   │              │
│  └───────┬──────────┘  └───────┬───────────┘              │
│          │                      │                         │
│          └──────────┬───────────┘                         │
│                     ▼                                     │
│          ┌──────────────────┐                             │
│          │   Risk Scorer     │                             │
│          │   (scorer.py)     │                             │
│          │                   │                             │
│          │ Weights + combine  │                             │
│          │ → Risk Score 0-100│                             │
│          │ → Threat Level    │                             │
│          └───────┬──────────┘                             │
│                  │                                        │
└──────────────────┼────────────────────────────────────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │ Score < 60 → LOG    │
        │ Score 60-84 → ALERT │
        │ Score ≥ 85 → REVOKE │
        └─────────────────────┘
```

---

## Signal 1: Modification Burst Detection (`burst.py`)

### What It Detects
An abnormally high number of file modifications from a single identity within a short time window.

### How It Works
1. Group events by `actor_identity`
2. Count `ObjectCreated:Put` events within a sliding window (default: 60 seconds)
3. If count exceeds threshold → produce burst score

### Algorithm
```python
def calculate_burst_score(event_count: int, threshold: int) -> float:
    if event_count <= threshold * 0.5:
        return 0.0
    if event_count >= threshold * 2:
        return 100.0
    # Linear interpolation between 50% and 200% of threshold
    ratio = (event_count - threshold * 0.5) / (threshold * 1.5)
    return min(ratio * 100, 100.0)
```

### Configurable Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `burst_window_seconds` | 60 | Sliding window size |
| `burst_threshold_count` | 50 | Modifications to trigger |

### False Positive Considerations
- Legitimate CI/CD pipelines can produce bursts → use allowlist
- Bulk data migrations → check if identity is allowlisted
- Backup services → allowlist backup service accounts

---

## Signal 2: File Entropy Analysis (`entropy.py`)

### What It Detects
Files that have been encrypted. Encrypted data has near-maximum Shannon entropy (close to 8.0 bits per byte), while normal documents have lower entropy.

### How It Works
1. When a suspicious `PutObject` event is detected, download a sample of the new file content
2. Compute Shannon entropy on the byte distribution
3. Compare with expected entropy for the file type
4. High entropy on a file type that normally has low entropy → strong encryption signal

### Algorithm
```python
import numpy as np

def shannon_entropy(data: bytes) -> float:
    """Calculate Shannon entropy of byte data. Returns 0.0 to 8.0."""
    if not data:
        return 0.0
    byte_counts = np.zeros(256)
    for byte in data:
        byte_counts[byte] += 1
    probabilities = byte_counts[byte_counts > 0] / len(data)
    entropy = -np.sum(probabilities * np.log2(probabilities))
    return float(entropy)

def entropy_score(entropy_value: float, file_extension: str) -> float:
    """Convert entropy value to a 0-100 suspicion score."""
    # Already-compressed formats (.zip, .gz, .jpg, .png) naturally have high entropy
    compressed_extensions = {'.zip', '.gz', '.tar.gz', '.jpg', '.jpeg', '.png', '.mp4'}
    if file_extension.lower() in compressed_extensions:
        return 0.0  # High entropy is expected
    
    threshold = 7.5  # Configurable
    if entropy_value < 6.0:
        return 0.0
    if entropy_value >= threshold:
        return min(((entropy_value - threshold) / (8.0 - threshold)) * 100 + 70, 100.0)
    # Gradual ramp between 6.0 and threshold
    return ((entropy_value - 6.0) / (threshold - 6.0)) * 50
```

### Typical Entropy Values

| File Type | Normal Entropy | Encrypted Entropy |
|-----------|---------------|-------------------|
| .txt | 4.0 – 5.5 | 7.9 – 8.0 |
| .docx | 6.0 – 7.0 (XML+ZIP) | 7.95 – 8.0 |
| .csv | 3.5 – 5.0 | 7.9 – 8.0 |
| .pdf | 6.5 – 7.5 | 7.95 – 8.0 |
| .jpg | 7.5 – 7.9 | 7.95 – 8.0 |
| .zip | 7.8 – 8.0 | 7.95 – 8.0 |

### Configurable Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `entropy_threshold` | 7.5 | Entropy value considered suspicious |
| `entropy_sample_bytes` | 65536 | Bytes to download for analysis (64KB) |

### Limitations
- Already-compressed files (`.zip`, `.jpg`) naturally have high entropy → exempt them
- Must download file content → I/O cost → sample only first N bytes
- Run as async Celery task to avoid blocking the API

---

## Signal 3: Rename Burst Detection (`rename.py`)

### What It Detects
Mass renaming of files, especially adding extensions like `.locked`, `.encrypted`, `.crypt`, `.ransom`.

### How It Works
S3 does not have a native rename operation. A "rename" in S3 is a `CopyObject` followed by `DeleteObject` on the original key.

1. Correlate `ObjectCreated:Copy` and `ObjectRemoved:Delete` events by identity and time proximity
2. If the new key has a different extension from the old key, count it as a rename
3. Check for known ransomware extensions
4. Count renames within a time window

### Suspicious Extension Patterns
```python
RANSOMWARE_EXTENSIONS = {
    '.locked', '.encrypted', '.crypt', '.enc', '.ransom',
    '.cry', '.crypto', '.locky', '.cerber', '.zepto',
    '.thor', '.aesir', '.zzzzz', '.micro', '.mp3',  # Yes, Cerber uses .mp3
    '.xxx', '.ttt', '.abc', '.ccc', '.vvv'
}
```

### Algorithm
```python
def calculate_rename_score(rename_count: int, 
                           ransomware_ext_count: int, 
                           threshold: int) -> float:
    if rename_count == 0:
        return 0.0
    
    base_score = min((rename_count / threshold) * 60, 60.0)
    
    # Bonus for known ransomware extensions
    ext_bonus = min((ransomware_ext_count / max(rename_count, 1)) * 40, 40.0)
    
    return min(base_score + ext_bonus, 100.0)
```

### Configurable Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `rename_threshold_count` | 20 | Renames to trigger alert |
| `rename_window_seconds` | 60 | Time window for rename detection |

---

## Signal 4: Canary Trigger Detection (`canary.py`)

### What It Detects
Any modification to planted decoy files. If a canary file is modified or deleted, it means someone is touching files they shouldn't be — a very strong signal.

### How It Works
1. Maintain a set of canary file object keys in memory (loaded from DB)
2. For every incoming event, check if the object key matches a canary file
3. If a canary file is modified (`PutObject`), deleted (`DeleteObject`), or overwritten → TRIGGER

### Algorithm
```python
def check_canary(object_key: str, event_type: str, canary_keys: set) -> dict:
    if object_key not in canary_keys:
        return {"triggered": False}
    
    return {
        "triggered": True,
        "severity": "CRITICAL",
        "canary_key": object_key,
        "event_type": event_type,
        "message": f"Canary file '{object_key}' was {event_type}"
    }
```

### Why Canary Files Are Effective
- Legitimate users have no reason to modify decoy files
- Ransomware encrypts ALL files indiscriminately — it will hit canaries
- Canaries trigger BEFORE the attack completes (early warning)
- Very low false-positive rate

### Canary File Design
Decoy files should:
- Have realistic names: `Q3-Budget-Summary.xlsx`, `Employee-Handbook-v2.docx`
- Be placed in common directories: `reports/`, `finance/`, `hr/`
- Contain realistic but fake content
- Be small (a few KB) to avoid storage cost
- Not be listed in any company file index or used by any workflow

---

## Signal 5: Risk Scorer & Correlator (`scorer.py`)

### What It Does
Combines all individual signal scores into a single risk score and assigns a threat level.

### Scoring Formula

```python
def calculate_risk_score(
    burst_score: float,       # 0-100
    entropy_score: float,     # 0-100
    rename_score: float,      # 0-100
    canary_triggered: bool
) -> dict:
    
    # Weighted combination
    weights = {
        'burst': 0.30,
        'entropy': 0.25,
        'rename': 0.25,
        'canary': 0.20
    }
    
    canary_score = 100.0 if canary_triggered else 0.0
    
    weighted_score = (
        burst_score * weights['burst'] +
        entropy_score * weights['entropy'] +
        rename_score * weights['rename'] +
        canary_score * weights['canary']
    )
    
    # Signal count bonus: more independent signals = higher confidence
    active_signals = sum([
        burst_score > 30,
        entropy_score > 30,
        rename_score > 30,
        canary_triggered
    ])
    
    if active_signals >= 3:
        weighted_score = min(weighted_score * 1.15, 100.0)  # 15% boost
    elif active_signals >= 2:
        weighted_score = min(weighted_score * 1.05, 100.0)  # 5% boost
    
    # Canary alone can push to HIGH but not CRITICAL
    # (needs at least one other signal for CRITICAL)
    
    # Determine threat level
    if weighted_score >= 85:
        threat_level = "CRITICAL"
    elif weighted_score >= 60:
        threat_level = "HIGH"
    elif weighted_score >= 40:
        threat_level = "MEDIUM"
    else:
        threat_level = "LOW"
    
    return {
        "risk_score": round(weighted_score, 1),
        "threat_level": threat_level,
        "active_signals": active_signals,
        "signals": {
            "burst": burst_score,
            "entropy": entropy_score,
            "rename": rename_score,
            "canary": canary_triggered
        }
    }
```

### Decision Thresholds

| Risk Score | Threat Level | System Action |
|-----------|-------------|---------------|
| 0 – 39 | LOW | Log only, no alert |
| 40 – 59 | MEDIUM | Generate alert, notify admin |
| 60 – 84 | HIGH | Generate alert, prepare revocation (await approval) |
| 85 – 100 | CRITICAL | Generate alert, auto-revoke (if not in simulation mode) |

### Why Multi-Signal Matters

| Scenario | Burst | Entropy | Rename | Canary | Score | Verdict |
|----------|-------|---------|--------|--------|-------|---------|
| Real ransomware | 95 | 90 | 88 | Yes | ~93 | CRITICAL ✅ |
| Bulk CSV upload | 80 | 15 | 0 | No | ~28 | LOW ✅ |
| Backup service | 70 | 60 | 0 | No | ~36 | LOW ✅ (allowlisted anyway) |
| Partial attack (3 files) | 10 | 85 | 5 | No | ~25 | LOW (too few files) |
| Canary-only trigger | 0 | 0 | 0 | Yes | ~20 | LOW → but flag for review |

---

## Allowlist & False Positive Prevention

### Allowlisted Identities
Stored in `detection_config` table under `allowlisted_identities`:

```json
[
  "arn:aws:iam::123456789:user/ci-deploy",
  "arn:aws:iam::123456789:user/backup-service",
  "arn:aws:iam::123456789:role/lambda-data-processor"
]
```

If an event's `actor_identity` matches an allowlisted identity:
- Events are still stored and monitored
- Detection signals are still computed (for observability)
- But the system will NOT auto-revoke allowlisted identities
- An admin notification is still sent if the score is HIGH+

### Activity Baseline (Future Enhancement)
In production, the system could build a baseline of normal activity per identity and flag only deviations. For the CYB-03 prototype, we use static thresholds.

---

## Detection Latency Budget

| Step | Target Latency |
|------|---------------|
| S3 event → SQS delivery | 1–10 seconds (AWS controlled) |
| SQS → Monitoring Service | 5 seconds (poll interval) |
| Event processing + dedup | < 100ms |
| Burst + rename + canary check | < 100ms |
| Entropy analysis (async) | 1–5 seconds (download + compute) |
| Risk scoring | < 50ms |
| Alert creation + WebSocket push | < 200ms |
| **Total (without entropy)** | **~6–16 seconds** |
| **Total (with entropy)** | **~7–20 seconds** |

Entropy analysis runs asynchronously — the system can alert on burst + canary + rename signals first, then upgrade the alert when entropy results arrive.

