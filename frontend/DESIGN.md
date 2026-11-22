# Aegis — MediCore Response Console // Design System Specification

## 1. Stitch MCP Project Reference
- **Project Name:** `projects/12937175236820853744`
- **Project Title:** `Aegis — MediCore Response Console`
- **Design System Asset:** `assets/6330ff75fd164a1dba9a95b82dbb3e73` (`Aegis Cloud SecOps` Light Theme)
- **Design Mode:** High-Contrast Enterprise Light Theme (Clean white surfaces, crisp slate borders, deep navy authoritative headings, restrained semantic color indicators).

### Generated Stitch Screens
1. **Live AWS Overview (Desktop 1440×900)**
   - Screen ID: `dadcdfac4202406d90eefac532f6a5f8`
   - Resource: `projects/12937175236820853744/screens/dadcdfac4202406d90eefac532f6a5f8`
   - Purpose: 60-second judge walkthrough above the fold, 6-stage response sequence, 3-column probe matrix (Before/During/After), and live response timeline.
2. **Dual-Lane Replay Comparison Bench (Desktop)**
   - Screen ID: `0c0bb3ac8e0242748a7b3172c4d28cac`
   - Resource: `projects/12937175236820853744/screens/0c0bb3ac8e0242748a7b3172c4d28cac`
   - Purpose: 1-click execution, side-by-side Protected Lane (`[REPLAY - PROTECTED]`) vs Baseline Lane (`[REPLAY - BASELINE]`), shared timeline, automated vs manual intervention.
3. **Incident Detail with Forensic Evidence Drawer (Desktop)**
   - Screen ID: `2b6b40bdaf054730977a93e3d7a6eff4`
   - Resource: `projects/12937175236820853744/screens/2b6b40bdaf054730977a93e3d7a6eff4`
   - Purpose: Cryptographic 3-way version diff (Trusted Original vs Changed Version vs Verified Recovery Copy with download CTA), operator action review modal (role, scope, expiry, approve button), and side slide-out Evidence Drawer with raw CloudTrail provenance.
4. **Mobile & Tablet Responsive Layout**
   - Screen ID: `ca9518b421fe4e5f8ad32c15158bb807`
   - Resource: `projects/12937175236820853744/screens/ca9518b421fe4e5f8ad32c15158bb807`
   - Purpose: Stacked sequence cards, stacked probe matrix rows, stacked comparison lanes, and bottom-sheet forensic drawer.

---

## 2. Palette & Tokens (Light Theme)

| Token | Hex / Value | Semantic Role |
| :--- | :--- | :--- |
| `--bg-base` | `#f8fafc` (Slate 50) | Main viewport canvas backdrop |
| `--bg-sub` | `#f1f5f9` (Slate 100) | Secondary structural container / sub-wells |
| `--bg-card` | `#ffffff` | Primary elevated card surface |
| `--border-subtle` | `#e2e8f0` (Slate 200) | Standard structural hairline border (1px) |
| `--border-emphasis` | `#cbd5e1` (Slate 300) | Focused, active, or hover outline |
| `--text-main` | `#0f172a` (Slate 900) | Primary high-contrast headings & labels |
| `--text-muted` | `#475569` (Slate 600) | Secondary descriptive metadata |
| `--text-dim` | `#94a3b8` (Slate 400) | Tertiary disabled / peripheral labels |
| `--brand-navy` | `#0f2744` | Primary brand accent & main CTA buttons |
| `--brand-navy-hover`| `#1e3a8a` | Hover state for primary buttons |
| `--threat-red` | `#dc2626` | Verified denial / active critical risk |
| `--threat-red-bg` | `#fef2f2` | Denial badge background |
| `--threat-red-border`| `#fecaca` | Denial badge border |
| `--warning-amber` | `#d97706` | Action needed / review required |
| `--warning-amber-bg`| `#fffbeb` | Warning badge background |
| `--warning-amber-border`| `#fde68a` | Warning badge border |
| `--safe-emerald` | `#059669` | Verified success / clean probe / recovery |
| `--safe-emerald-bg` | `#ecfdf5` | Success badge background |
| `--safe-emerald-border`| `#a7f3d0` | Success badge border |
| `--accent-sky` | `#0284c7` | Replay pill / interactive telemetry link |
| `--accent-sky-bg` | `#f0f9ff` | Replay pill background |
| `--accent-sky-border`| `#bae6fd` | Replay pill border |

---

## 3. Typography & Micro-Layouts
- **Primary Interface Font:** System Sans / Geist (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- **Telemetry Monospace:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "JetBrains Mono", monospace`. Used for AWS ARNs, S3 object keys, SHA-256 hashes, CloudTrail event IDs, S3 request IDs, and ISO timestamps.
- **Compact Navigation Rail:** 5 items (`Overview`, `Live Activity`, `Comparison`, `Incidents`, `Connections`). Fixed 64px width on desktop with icon + tooltip or 200px labeled rail, adapting to horizontal tabs on mobile.
- **1440×900 Viewport Rule:** All primary investigative context (sequence cards, 3-column probe matrix, top metrics) is visible without scrolling on standard judge monitors. Detailed evidence slides out into the right Evidence Drawer.
- **Accessibility:** Reduced motion (`@media (prefers-reduced-motion: reduce)`), explicit focus outlines (`:focus-visible`), and color paired with text or iconography.
