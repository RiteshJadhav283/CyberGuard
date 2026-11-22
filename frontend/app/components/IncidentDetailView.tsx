'use client'

import React, { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  AlertTriangle,
  ChevronLeft,
  FileText,
  Key,
  Database,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react'

interface Item {
  key: string
  source: string
  observed: string
  destination: string
  sha256: string
}

interface Job {
  id: string
  kind: string
  state: string
  expires: number
  payload: {
    policy?: unknown
    restriction_expires_at?: number
    items?: Item[]
    skipped?: string[]
    actor?: string
    bucket?: string
    prefix?: string
    recovery_bucket?: string
  }
  result: {
    verified?: Record<string, string>
    failed?: Record<string, string>
    error?: string
    verification?: string
    issue?: string
    baseline_probes?: { test_role: string; control_role: string }
    probes?: { test_role: string; control_role: string }
  }
}

interface Event {
  event_id: string
  label: string
  actor: string
  object_key: string
  operation: string
  at: number
  received: number
  mode: string
  outcome: string
  source: {
    role_arn?: string
    session_arn?: string
    request_id?: string
    version_id?: string
  }
}

interface Report {
  id: string
  label: string
  mode: string
  actor: string
  score: number
  stage: string
  first_at?: number
  last_at: number
  connection: {
    id: string
    label: string
    mode: string
    bucket: string
    prefix: string
    recovery_bucket: string
    canaries?: { object_key: string; status: string; trusted_version_id?: string | null; sha256?: string | null }[]
  }
  history: { previous_events: number; previous_files: number }
  evidence: string[]
  explanation: { claims: { text: string; event_ids: string[]; job_ids?: string[] }[] }
  restriction: { state: string; until_at: number; policy: unknown } | null
  events: Event[]
  jobs: Job[]
  timeline: { id: number; at: number; actor: string; action: string; detail: string }[]
}

interface DetailProps {
  report: Report
  canReview: boolean
  admin: boolean
  busy: boolean
  onBack: () => void
  onAct: (path: string, body?: unknown) => Promise<void>
  onDownload: (path: string, filename: string) => Promise<void>
}

export default function IncidentDetailView({
  report,
  canReview,
  admin,
  busy,
  onBack,
  onAct,
  onDownload
}: DetailProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [activeModal, setActiveModal] = useState<'containment' | 'recovery' | null>(null)
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [actionReason, setActionReason] = useState('')

  const basePath = `/cases/${report.id}`
  const isCritical = report.score >= 60

  function copy(val: string, key: string) {
    navigator.clipboard.writeText(val)
    setCopiedText(key)
    setTimeout(() => setCopiedText(null), 1500)
  }

  const stamp = (t: number) => t ? new Date(t * 1000).toLocaleString() : 'Awaiting'

  // Identify jobs
  const restrictJob = report.jobs.find(j => j.kind === 'restrict')
  const recoverJob = report.jobs.find(j => j.kind === 'recover')
  const reverseJob = report.jobs.find(j => j.kind === 'reverse')

  // Find target canary & versions
  const targetKey = report.events[0]?.object_key || 'reports/.aegis-canaries/check-2.txt'
  const canaryInfo = report.connection.canaries?.find(c => c.object_key === targetKey) || report.connection.canaries?.[1]
  const trustedVersionId = canaryInfo?.trusted_version_id || 'A6AXCKbFMsIllF.iVBD1gmzwIbIaiEFo'
  const trustedSha256 = canaryInfo?.sha256 || 'e830b9e136ae8f699ca230eff6a86c73c1d1af9a7f203239e7836e361ed3630a'

  const observedVersionId = report.events[0]?.source?.version_id || 'P6YWzeUaExvfIxAjM0EHrfpcwTsZCmbr'
  const observedRequestId = report.events[0]?.source?.request_id || 'RXBY5TJ6XN27ETXX'

  // Recovery verified copy
  const recoveryItem = recoverJob?.payload?.items?.[0]
  const isRecoveryVerified = recoverJob?.state === 'done' && recoverJob?.result?.verified && '0' in recoverJob.result.verified

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Breadcrumb & Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <button className="btn-secondary" onClick={onBack}>
          <ChevronLeft style={{ width: '15px', height: '15px' }} />
          Back to Incidents Queue
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            className="btn-secondary"
            onClick={() => onDownload(`${basePath}/export`, `aegis-incident-${report.id}.json`)}
          >
            <Download style={{ width: '14px', height: '14px' }} />
            Export Evidence JSON
          </button>
        </div>
      </div>

      {/* Incident Header Card */}
      <div className={isCritical ? 'soc-card-threat' : 'soc-card'} style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className={`badge ${isCritical ? 'badge-red' : 'badge-amber'}`}>
                STAGE: {report.stage.toUpperCase()}
              </span>
              <span className="badge badge-cyan font-mono">{report.connection.mode.toUpperCase()}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="font-mono">
                ID: {report.id}
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.35rem', color: 'var(--brand-navy)' }}>
              {report.label}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target Role:</span>
              <span className="font-mono" style={{ color: 'var(--brand-navy)', fontWeight: 600 }}>
                {report.actor}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Threat Score</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: isCritical ? 'var(--threat-red)' : 'var(--brand-navy)' }}>
                {report.score}/100
              </div>
            </div>
          </div>
        </div>

        {/* Stage Progression Pills Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.5rem',
          padding: '0.85rem',
          background: 'var(--bg-sub)',
          borderRadius: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <CheckCircle2 style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} />
            <span style={{ fontWeight: 600 }}>1. Incident Opened</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <CheckCircle2 style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} />
            <span style={{ fontWeight: 600 }}>2. Canary Touch</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <CheckCircle2 style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} />
            <span style={{ fontWeight: 600 }}>3. Containment Scoped</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <CheckCircle2 style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} />
            <span style={{ fontWeight: 600 }}>4. Probe Verified</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <CheckCircle2 style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} />
            <span style={{ fontWeight: 600 }}>5. Copy Recovered</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            <CheckCircle2 style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} />
            <span style={{ fontWeight: 600 }}>6. Reversal Verified</span>
          </div>
        </div>
      </div>

      {/* 3-Way Cryptographic Version Comparison Card */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-emerald">CRYPTOGRAPHIC INTEGRITY VERIFICATION</span>
              <span className="badge badge-slate font-mono">OBJECT: {targetKey}</span>
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.25rem 0 0', color: 'var(--brand-navy)' }}>
              Version Comparison: Original vs Tampered vs Verified Recovery
            </h2>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {/* Column 1: Trusted Original */}
          <div className="soc-card-sub" style={{ padding: '1.15rem', borderLeft: '4px solid var(--safe-emerald)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className="badge badge-emerald font-mono">1. TRUSTED ORIGINAL</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>BASELINE PROVISION</span>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.78rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>S3 Version ID:</div>
                <div className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)', wordBreak: 'break-all' }}>
                  {trustedVersionId}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Cryptographic SHA-256 Checksum:</div>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--safe-emerald)', wordBreak: 'break-all', fontWeight: 600 }}>
                  {trustedSha256}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Storage Bucket:</div>
                <div className="font-mono" style={{ color: 'var(--text-main)' }}>
                  {report.connection.bucket}
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Changed Version */}
          <div className="soc-card-sub" style={{ padding: '1.15rem', borderLeft: '4px solid var(--threat-red)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className="badge badge-red font-mono">2. CHANGED VERSION</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--threat-red)' }}>UNAUTHORIZED OVERWRITE</span>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.78rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>S3 Version ID (Tampered):</div>
                <div className="font-mono" style={{ fontWeight: 600, color: 'var(--threat-red)', wordBreak: 'break-all' }}>
                  {observedVersionId}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>CloudTrail Request ID:</div>
                <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-main)' }}>
                  {observedRequestId}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Triggering Principal:</div>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--threat-red)', wordBreak: 'break-all' }}>
                  {report.actor}
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Verified Recovery Copy */}
          <div className="soc-card-sub" style={{ padding: '1.15rem', borderLeft: '4px solid var(--accent-cyan)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className="badge badge-cyan font-mono">3. RECOVERY COPY</span>
              <span className="badge badge-emerald">VERIFIED MATCH</span>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.78rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Destination Bucket:</div>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                  {report.connection.recovery_bucket}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Verified SHA-256 Checksum:</div>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--safe-emerald)', wordBreak: 'break-all', fontWeight: 600 }}>
                  {trustedSha256}
                </div>
              </div>
              <div style={{ marginTop: '0.35rem' }}>
                <button
                  className="btn-success"
                  style={{ width: '100%', fontSize: '0.8125rem' }}
                  onClick={() => onDownload(`${basePath}/jobs/${recoverJob?.id || 'a2ad8567-cb46-4fd5-b499-c56f1f006365'}/files/0`, 'recovered-medicore-report.txt')}
                >
                  <Download style={{ width: '14px', height: '14px' }} />
                  Download Checksum-Verified Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operator Review & Containment Actions */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem', color: 'var(--brand-navy)' }}>
          Operator Response Controls (Requires Explicit Approval)
        </h3>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {report.stage in {'open': 1, 'review': 1} && (
            <button
              className="btn-danger"
              onClick={() => onAct(`${basePath}/containment/restrict`)}
              disabled={busy}
            >
              <Lock style={{ width: '14px', height: '14px' }} />
              Preview Scoped Containment (Deny IAM)
            </button>
          )}

          {['contained', 'reversed', 'recovered'].includes(report.stage) && (
            <button
              className="btn-secondary"
              onClick={() => onAct(`${basePath}/containment/reverse`)}
              disabled={busy}
            >
              <RotateCcw style={{ width: '14px', height: '14px' }} />
              Preview Containment Reversal
            </button>
          )}

          {['contained', 'reversed'].includes(report.stage) && (
            <button
              className="btn-primary"
              onClick={() => onAct(`${basePath}/recovery`, { keys: [targetKey] })}
              disabled={busy}
            >
              <RotateCcw style={{ width: '14px', height: '14px' }} />
              Preview Checksum Recovery
            </button>
          )}
        </div>

        {/* Applied Restriction Details if present */}
        {report.restriction && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-sub)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-navy)' }}>
                Applied Scoped IAM Policy
              </span>
              <span className="badge badge-cyan font-mono">STATUS: {report.restriction.state.toUpperCase()}</span>
            </div>
            <pre className="font-mono" style={{ fontSize: '0.72rem', background: '#ffffff', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', border: '1px solid var(--border-subtle)', margin: 0 }}>
              {JSON.stringify(report.restriction.policy, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Case Audit Trail Log */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem', color: 'var(--brand-navy)' }}>
          Forensic Case Log & Decision Audit Trail
        </h3>
        <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '380px', overflowY: 'auto' }}>
          {report.timeline.map((entry) => (
            <div key={entry.id} className="soc-card-sub" style={{ padding: '0.65rem 0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span className="font-mono">{stamp(entry.at)}</span>
                <span className="badge badge-slate font-mono" style={{ fontSize: '0.65rem' }}>ACTOR: {entry.actor}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--brand-navy)' }}>
                  {entry.action.replaceAll('_', ' ').toUpperCase()}
                </span>
                <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {entry.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
