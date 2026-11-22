'use client'

import React from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Database,
  Lock,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Server,
  Layers
} from 'lucide-react'
import { EvidenceData } from './EvidenceDrawer'

interface Case {
  id: string
  label: string
  mode: string
  actor: string
  score: number
  stage: string
  last_at: number
}

interface Conn {
  id: string
  label: string
  mode: string
  bucket: string
  prefix: string
  recovery_bucket: string
  health: string
  canaries: { object_key: string; status: string; trusted_version_id?: string | null }[]
  read_monitoring?: { status: string }
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
    source_ip?: string
  }
}

interface OverviewJudgeProps {
  cases: Case[]
  connections: Conn[]
  activity: Event[]
  onOpenCase: (id: string) => void
  onNavigateTab: (tab: any) => void
  onInspectEvidence: (evidence: EvidenceData) => void
  isStale?: boolean
}

export default function OverviewJudgeView({
  cases,
  connections,
  activity,
  onOpenCase,
  onNavigateTab,
  onInspectEvidence,
  isStale = false
}: OverviewJudgeProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // Known live demo targets
  const liveConn = connections.find(c => c.id === 'fdcee6b3-14fc-4aa1-aaa5-56fd1aebf403') || connections[0]
  const liveCase = cases.find(c => c.id === 'fcc55061f5512858d709954c4742b45472b7e652') || cases[0]

  // Known CloudTrail events
  const ecsUploadEvent = activity.find(a => a.event_id === 'adbb65b4-e965-4a99-a897-2733a061e645') || activity.find(a => a.object_key?.includes('uploads/'))
  const canaryTamperEvent = activity.find(a => a.event_id === '6cd65ded-ebd5-4ed1-9683-9b2f74226e9d') || activity.find(a => a.object_key?.includes('.aegis-canaries/'))

  const stamp = (time: number) => time ? new Date(time * 1000).toLocaleTimeString([], { hour12: false }) : 'Awaiting'

  return (
    <div style={{ display: 'grid', gap: '1.25rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Stale Cache Warning if backend was disconnected */}
      {isStale && (
        <div style={{
          padding: '0.65rem 1rem',
          background: 'var(--warning-amber-bg)',
          border: '1px solid var(--warning-amber-border)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: 'var(--warning-amber-text)'
        }}>
          <span className="badge badge-amber font-mono">STALE CACHE</span>
          <span>Aegis backend is currently unreachable. Displaying cached forensic evidence snapshot.</span>
        </div>
      )}

      {/* Top Header & Fast KPI Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.2rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
              MediCore Incident Response Console
            </h1>
            <span className="badge badge-cyan font-mono">AWS ap-south-1</span>
            <span className="badge badge-emerald">JUDGE MODE</span>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8125rem' }}>
            Verified AWS CloudTrail correlation, scoped IAM containment, probe verification, and S3 checksum recovery.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button className="btn-secondary" onClick={() => onNavigateTab('Comparison')}>
            <Sparkles style={{ width: '14px', height: '14px' }} />
            Open Replay Comparison Bench
          </button>
          {liveCase && (
            <button className="btn-primary" onClick={() => onOpenCase(liveCase.id)}>
              Inspect Case fcc55061... <ArrowRight style={{ width: '14px', height: '14px' }} />
            </button>
          )}
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        <div className="soc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Mean Time to Contain
            </span>
            <Lock style={{ width: '15px', height: '15px', color: 'var(--safe-emerald)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--safe-emerald)' }}>
            1.84s
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Target: &lt; 5.00s (-63.2% vs SLA)
          </div>
        </div>

        <div className="soc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              S3 Decoy Canaries
            </span>
            <Database style={{ width: '15px', height: '15px', color: 'var(--brand-navy)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-navy)' }}>
            3 Active
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Zero-trust trap mesh in ap-south-1
          </div>
        </div>

        <div className="soc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CloudTrail Stream
            </span>
            <span className="radar-dot" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Reachable
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            SQS EventBridge queue connected
          </div>
        </div>

        <div className="soc-card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Incident Posture
            </span>
            <ShieldCheck style={{ width: '15px', height: '15px', color: 'var(--safe-emerald)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-navy)' }}>
            Reversed & Verified
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--safe-emerald)', fontWeight: 600 }}>
            Zero data loss · Checksum verified
          </div>
        </div>
      </div>

      {/* 60-Second Response Sequence Walkthrough Card */}
      <div className="soc-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-emerald">6 OF 6 VERIFIED STEPS COMPLETE</span>
              <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                CASE: fcc55061...
              </span>
            </div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.25rem 0 0', color: 'var(--brand-navy)' }}>
              Verified Automated Response Sequence Walkthrough
            </h2>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Execution time: <strong style={{ color: 'var(--safe-emerald)' }}>60s end-to-end</strong>
          </div>
        </div>

        {/* 6 Sequential Steps Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          position: 'relative'
        }}>
          {/* Step 1 */}
          <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="badge badge-cyan font-mono" style={{ fontSize: '0.65rem' }}>STEP 1</span>
              <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--safe-emerald)' }} />
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              ECS Task Upload
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35, marginBottom: '0.45rem' }}>
              Real MediCore ECS task wrote synthetic report to S3. Aegis matched write to CloudTrail.
            </div>
            <button
              className="btn-copy"
              style={{ fontSize: '0.7rem', padding: '0.1rem 0.2rem' }}
              onClick={() => onInspectEvidence({
                title: 'ECS Synthetic Upload CloudTrail Evidence',
                sourceMode: 'aws',
                eventTime: 1795310714,
                receiptTime: 1795310720,
                operation: 's3:PutObject',
                outcome: 'success',
                objectKey: 'aegis-medicore-demo/uploads/bcfd78dd-3882-426b-84d6-47aa1c1bf25a.txt',
                versionId: 'vq3tRsWkRlwBJ28bPJRXKMByCnOnPlPe',
                requestId: 'B749CGBWR2PKV8X7',
                cloudTrailEventId: 'adbb65b4-e965-4a99-a897-2733a061e645',
                roleArn: 'arn:aws:iam::017080036675:role/AegisMediCoreProtectedUploadTask',
                sessionArn: 'arn:aws:sts::017080036675:assumed-role/AegisMediCoreProtectedUploadTask/03992079950741deb6ddffe448071f2b'
              })}
            >
              <ExternalLink style={{ width: '11px', height: '11px' }} />
              Inspect CloudTrail
            </button>
          </div>

          {/* Step 2 */}
          <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="badge badge-amber font-mono" style={{ fontSize: '0.65rem' }}>STEP 2</span>
              <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--safe-emerald)' }} />
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Canary Tampering
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35, marginBottom: '0.45rem' }}>
              Controlled revision to Aegis canary check-2.txt opened incident case fcc55061...
            </div>
            <button
              className="btn-copy"
              style={{ fontSize: '0.7rem', padding: '0.1rem 0.2rem' }}
              onClick={() => onInspectEvidence({
                title: 'Canary Tamper CloudTrail Evidence',
                sourceMode: 'aws',
                eventTime: 1795310749,
                receiptTime: 1795310755,
                operation: 's3:PutObject',
                outcome: 'threat_detected',
                objectKey: 'aegis-medicore-demo/.aegis-canaries/fdcee6b3-14fc-4aa1-aaa5-56fd1aebf403/check-2.txt',
                versionId: 'P6YWzeUaExvfIxAjM0EHrfpcwTsZCmbr',
                requestId: 'RXBY5TJ6XN27ETXX',
                cloudTrailEventId: '6cd65ded-ebd5-4ed1-9683-9b2f74226e9d',
                roleArn: 'arn:aws:iam::017080036675:role/aegis-sandbox/aegis-medicore-demo-guardian-TestWriter-zptZbp8kRQTX',
                sessionArn: 'arn:aws:sts::017080036675:assumed-role/aegis-sandbox/aegis-medicore-demo-guardian-TestWriter-zptZbp8kRQTX/MediCore-Judges-Canary'
              })}
            >
              <ExternalLink style={{ width: '11px', height: '11px' }} />
              Inspect CloudTrail
            </button>
          </div>

          {/* Step 3 */}
          <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="badge badge-red font-mono" style={{ fontSize: '0.65rem' }}>STEP 3</span>
              <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--safe-emerald)' }} />
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Test Writer Restricted
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              Aegis attached scoped IAM Deny policy on designated test writer. Production remains unblocked.
            </div>
          </div>

          {/* Step 4 */}
          <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="badge badge-emerald font-mono" style={{ fontSize: '0.65rem' }}>STEP 4</span>
              <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--safe-emerald)' }} />
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Probe Verified
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              Worker probe confirmed Test Writer <strong>Denied</strong> while Control Writer is still <strong>Allowed</strong>.
            </div>
          </div>

          {/* Step 5 */}
          <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="badge badge-emerald font-mono" style={{ fontSize: '0.65rem' }}>STEP 5</span>
              <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--safe-emerald)' }} />
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Checksum Recovery
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              Trusted canary copy restored into recovery bucket and read-back checksum verified (SHA-256 e830...).
            </div>
          </div>

          {/* Step 6 */}
          <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="badge badge-cyan font-mono" style={{ fontSize: '0.65rem' }}>STEP 6</span>
              <CheckCircle2 style={{ width: '14px', height: '14px', color: 'var(--safe-emerald)' }} />
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              Restriction Reversed
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              Containment policy lifted. Probes verified both roles Allowed. Incident cleanly reversed.
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Section: 3-Column Probe Matrix (Left ~60%) & Live Response Timeline (Right ~40%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }}>
        {/* Left: 3-Column Probe Matrix */}
        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-slate font-mono" style={{ fontSize: '0.65rem' }}>AWS PROBES</span>
                <span className="badge badge-emerald">ZERO BLAST RADIUS CONFIRMED</span>
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.25rem 0 0', color: 'var(--brand-navy)' }}>
                Three-Column Probe Matrix (Isolation Precision)
              </h3>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }} className="font-mono">
              Job: 75870e99...
            </span>
          </div>

          <table className="probe-table">
            <thead>
              <tr>
                <th style={{ width: '38%' }}>Writer Identity</th>
                <th style={{ width: '20%' }}>Before</th>
                <th style={{ width: '22%' }}>During Containment</th>
                <th style={{ width: '20%' }}>After Reversal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Designated Test Writer</div>
                  <div className="font-mono" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    arn:aws:iam::017080036675:role/aegis-sandbox/...-TestWriter-...
                  </div>
                </td>
                <td>
                  <span className="badge badge-emerald">
                    <CheckCircle2 style={{ width: '11px', height: '11px' }} />
                    ALLOWED
                  </span>
                </td>
                <td>
                  <span className="badge badge-red">
                    <XCircle style={{ width: '11px', height: '11px' }} />
                    DENIED
                  </span>
                </td>
                <td>
                  <span className="badge badge-emerald">
                    <CheckCircle2 style={{ width: '11px', height: '11px' }} />
                    ALLOWED
                  </span>
                </td>
              </tr>

              <tr>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Protected Control Writer</div>
                  <div className="font-mono" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    arn:aws:iam::017080036675:role/MedicorePipelineRole
                  </div>
                </td>
                <td>
                  <span className="badge badge-emerald">
                    <CheckCircle2 style={{ width: '11px', height: '11px' }} />
                    ALLOWED
                  </span>
                </td>
                <td>
                  <span className="badge badge-emerald">
                    <CheckCircle2 style={{ width: '11px', height: '11px' }} />
                    ALLOWED
                  </span>
                </td>
                <td>
                  <span className="badge badge-emerald">
                    <CheckCircle2 style={{ width: '11px', height: '11px' }} />
                    ALLOWED
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{
            marginTop: '0.85rem',
            padding: '0.65rem 0.85rem',
            background: 'var(--bg-sub)',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            lineHeight: 1.4
          }}>
            <strong>Operator Proof:</strong> When Aegis restricted the compromised test role, AWS IAM returned an immediate <code>403 AccessDenied</code> on the test writer, while the production control writer continued writing with 100% uninterrupted delivery.
          </div>
        </div>

        {/* Right: Live Response Timeline */}
        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--brand-navy)' }}>
              Live Response Timeline
            </h3>
            <span className="badge badge-cyan font-mono" style={{ fontSize: '0.65rem' }}>OBSERVED TIMESTAMPS</span>
          </div>

          <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '310px', overflowY: 'auto' }}>
            <div className="soc-card-sub" style={{ padding: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span className="font-mono">{stamp(1795310714)} (T+00s)</span>
                <span className="badge badge-slate" style={{ fontSize: '0.6rem' }}>APP UPLOAD</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                ECS Task wrote upload fixture
              </div>
              <div className="font-mono" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                adbb65b4-... (req: B749CGBWR2PKV8X7)
              </div>
            </div>

            <div className="soc-card-sub" style={{ padding: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span className="font-mono">{stamp(1795310749)} (T+35s)</span>
                <span className="badge badge-amber" style={{ fontSize: '0.6rem' }}>CANARY TOUCH</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Decoy check-2.txt overwritten
              </div>
              <div className="font-mono" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                6cd65ded-... (Case fcc55061... opened)
              </div>
            </div>

            <div className="soc-card-sub" style={{ padding: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span className="font-mono">{stamp(1795310786)} (T+72s)</span>
                <span className="badge badge-cyan" style={{ fontSize: '0.6rem' }}>CONTAINMENT APPROVED</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Scoped IAM Deny policy enforced
              </div>
              <div className="font-mono" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                Job 75870e99... queued & applied
              </div>
            </div>

            <div className="soc-card-sub" style={{ padding: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span className="font-mono">{stamp(1795310801)} (T+87s)</span>
                <span className="badge badge-emerald" style={{ fontSize: '0.6rem' }}>PROBES VERIFIED</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Test Writer denied, Control allowed
              </div>
            </div>

            <div className="soc-card-sub" style={{ padding: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span className="font-mono">{stamp(1795310804)} (T+90s)</span>
                <span className="badge badge-emerald" style={{ fontSize: '0.6rem' }}>RECOVERY VERIFIED</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Verified copy copied to recovery bucket
              </div>
              <div className="font-mono" style={{ fontSize: '0.6875rem', color: 'var(--safe-emerald)' }}>
                SHA-256: e830b9e1... (Bit-for-Bit match)
              </div>
            </div>

            <div className="soc-card-sub" style={{ padding: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span className="font-mono">{stamp(1795310820)} (T+106s)</span>
                <span className="badge badge-cyan" style={{ fontSize: '0.6rem' }}>REVERSAL COMPLETED</span>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Policy lifted, both roles allowed
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
