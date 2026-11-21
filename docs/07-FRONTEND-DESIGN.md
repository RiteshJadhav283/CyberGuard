# CYB-03 — Frontend Design

## Overview

The frontend is a professional cybersecurity dashboard built with Next.js, TypeScript and Tailwind CSS. It follows a dark theme consistent with security operations centres (SOC).

---

## Design System

### Colour Palette

| Purpose | Tailwind Class | Hex | Usage |
|---------|---------------|-----|-------|
| Background (primary) | `bg-slate-950` | #020617 | Page background |
| Background (card) | `bg-slate-900` | #0f172a | Cards, panels |
| Background (hover) | `bg-slate-800` | #1e293b | Hover states, borders |
| Text (primary) | `text-slate-100` | #f1f5f9 | Headings, values |
| Text (secondary) | `text-slate-400` | #94a3b8 | Labels, descriptions |
| Border | `border-slate-700` | #334155 | Card borders, dividers |
| Accent (brand) | `text-cyan-400` | #22d3ee | Active states, links |
| Critical severity | `text-red-500` | #ef4444 | Critical alerts, attacks |
| High severity | `text-orange-500` | #f97316 | High-priority items |
| Medium severity | `text-yellow-500` | #eab308 | Medium alerts |
| Low severity | `text-blue-500` | #3b82f6 | Low-priority info |
| Success / Safe | `text-emerald-500` | #10b981 | Recovery success, healthy |

### Typography
- **Font**: System font stack (`font-sans`)
- **Headings**: `text-xl font-bold text-slate-100`
- **Body**: `text-sm text-slate-300`
- **Monospace**: `font-mono` for IDs, keys, file paths

---

## Page Structure

### Layout
```
┌──────────────────────────────────────────────────────┐
│  Sidebar (fixed, 64px collapsed / 240px expanded)    │
│  ┌─────┐  ┌────────────────────────────────────────┐ │
│  │     │  │  Header (top bar)                      │ │
│  │  S  │  │  ┌──────────────────────────────────┐  │ │
│  │  I  │  │  │                                   │  │ │
│  │  D  │  │  │       Main Content Area           │  │ │
│  │  E  │  │  │                                   │  │ │
│  │  B  │  │  │                                   │  │ │
│  │  A  │  │  │                                   │  │ │
│  │  R  │  │  └──────────────────────────────────┘  │ │
│  │     │  └────────────────────────────────────────┘ │
│  └─────┘                                             │
└──────────────────────────────────────────────────────┘
```

### Sidebar Navigation Items

| Icon | Label | Route | Description |
|------|-------|-------|-------------|
| LayoutDashboard | Dashboard | `/` | Main overview |
| Shield | Incidents | `/incidents` | Incident list |
| AlertTriangle | Alerts | `/alerts` | Alert feed |
| FileWarning | Canary Files | `/canary` | Canary management |
| RefreshCw | Recovery | `/recovery` | Recovery console |
| Terminal | Simulation | `/simulation` | Safe test simulation |
| Settings | Settings | `/settings` | Thresholds, config |

---

## Pages

### 1. Dashboard (`/`) — Main Overview

The primary view. Shows system health and current threat posture at a glance.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Row 1: Stat Cards (6 cards)                         │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐         │
│  │Mon.│ │Buck│ │Alert│ │Inc.│ │Canary│ │Recov│        │
│  │Files│ │ets │ │s   │ │    │ │     │ │ery  │        │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘          │
│                                                       │
│  Row 2: Threat Level Gauge + File Activity Chart      │
│  ┌────────────────┐  ┌────────────────────────────┐  │
│  │                 │  │  File Modifications         │  │
│  │  THREAT LEVEL   │  │  Over Time (line chart)     │  │
│  │  ████ CRITICAL  │  │                             │  │
│  │  Score: 93/100  │  │  ~~~~/\~~~~~/\~~~/\~~~~     │  │
│  │                 │  │                             │  │
│  └────────────────┘  └────────────────────────────┘  │
│                                                       │
│  Row 3: Attack Timeline + Alert Feed                  │
│  ┌────────────────────────────┐  ┌────────────────┐  │
│  │  ATTACK TIMELINE           │  │  LIVE ALERTS    │  │
│  │                            │  │                 │  │
│  │  ● 10:00:05 First burst    │  │  🔴 CRITICAL    │  │
│  │  ● 10:00:12 Canary hit     │  │  Ransomware...  │  │
│  │  ● 10:00:15 Confirmed      │  │                 │  │
│  │  ● 10:00:18 Revoked        │  │  🟡 MEDIUM      │  │
│  │  ● 10:00:25 Recovery       │  │  Burst detected │  │
│  │  ● 10:01:30 Complete       │  │                 │  │
│  └────────────────────────────┘  └────────────────┘  │
│                                                       │
│  Row 4: Recovery Progress                             │
│  ┌────────────────────────────────────────────────┐  │
│  │  Recovery: 42/45 files  ████████████████░░ 93%  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Stat Cards:**

| Card | Value | Icon | Colour |
|------|-------|------|--------|
| Monitored Files | `1,247` | Database | cyan |
| Connected Buckets | `2` | HardDrive | blue |
| Total Alerts | `15` | AlertTriangle | yellow |
| Active Incidents | `1` | Shield | red |
| Canary Files | `10 (1 triggered)` | Eye | orange |
| Recovery Rate | `93.3%` | RefreshCw | emerald |

### 2. Incidents (`/incidents`)

**List View**: Table of all incidents with columns:
- Status badge (colour-coded)
- Threat level
- Risk score
- Actor identity
- Affected files count
- Detected at (relative time)
- Actions (View, Resolve)

**Detail View** (`/incidents/[id]`):
- Full attack timeline (vertical timeline component)
- Detection signals breakdown (radar chart or bar chart)
- Affected files table with recovery status
- Revocation log
- Action buttons: Initiate Recovery, Mark as False Positive, Download Report

### 3. Alerts (`/alerts`)

Live feed of security alerts with:
- Severity badge (CRITICAL/HIGH/MEDIUM/LOW)
- Alert type icon
- Description
- Timestamp (relative)
- Acknowledge button
- Link to parent incident

Filter bar: severity, type, acknowledged status, date range.

### 4. Canary Files (`/canary`)

- List of all canary files with status
- Plant new canary files (form)
- Canary health check button
- Activity log for each canary file

### 5. Recovery (`/recovery`)

- Active recovery operations with progress bars
- One-click restore for incidents
- File-level restore for individual files
- Recovery history table
- Verification status for each recovered file

### 6. Simulation (`/simulation`)

- Start Simulation button (with configuration form)
- Live simulation status
- Reset Test Bucket button
- Simulation log viewer
- Instructions panel explaining safe simulation

### 7. Settings (`/settings`)

- Detection threshold configuration (form with sliders / number inputs)
- Allowlisted identities management (add / remove ARNs)
- Simulation mode toggle
- Monitored buckets configuration

---

## Key Components

### `StatCard.tsx`
Displays a single metric with icon, label, value and trend indicator.

### `ThreatGauge.tsx`
Circular or semicircular gauge showing current threat level (0–100 risk score) with colour gradient from green to red.

### `AttackTimeline.tsx`
Vertical timeline component showing incident events chronologically with icons, timestamps and descriptions. Uses coloured dots and connecting lines.

### `FileActivityChart.tsx`
Recharts `LineChart` showing file modification count over time (last 24 hours). Spikes indicate potential attacks.

### `AlertFeed.tsx`
Real-time scrolling list of alerts. New alerts animate in at the top. Severity-coloured left border.

### `RecoveryProgress.tsx`
Progress bar with file count (restored / total), percentage and status text. Animated progress fill.

### `IncidentTable.tsx`
Sortable, filterable table of incidents. Click a row to navigate to detail view.

### `IncidentDetail.tsx`
Full incident view with tabs: Timeline, Signals, Files, Revocation, Audit.

---

## Real-Time Updates (WebSocket)

The frontend establishes a WebSocket connection on login via the `useWebSocket` hook.

```typescript
// hooks/useWebSocket.ts
export function useWebSocket(token: string) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [threatLevel, setThreatLevel] = useState<string>("LOW");
  
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/api/v1/ws?token=${token}`);
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'alert_created':
          setAlerts(prev => [message.data, ...prev]);
          break;
        case 'threat_level_changed':
          setThreatLevel(message.data.level);
          break;
        case 'recovery_progress':
          // Update recovery state
          break;
      }
    };
    
    return () => ws.close();
  }, [token]);
  
  return { alerts, threatLevel };
}
```

---

## API Client

```typescript
// lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

// Attach JWT from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 → redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## Responsive Design

- **Desktop** (≥1280px): Full sidebar + multi-column dashboard
- **Tablet** (768–1279px): Collapsed sidebar + 2-column dashboard
- **Mobile** (< 768px): Hidden sidebar (hamburger) + single-column stack

All components use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`).

