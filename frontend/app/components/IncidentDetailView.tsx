'use client'

import React, { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  RotateCcw,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  AlertTriangle,
  ChevronLeft,
  FileText,
  Key,
  Database,
  ExternalLink
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
  source: { role_arn?: string; session_arn?: string }
}

interface Report {
  id: string
  label: string
  mode: string
  actor: string
  score: number
  stage: string
  last_at: number
  connection: {
    id: string
    label: string
    mode: string
    bucket: string
    prefix: string
    recovery_bucket: string
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

const stamp = (time: number) => time ? new Date(time * 1000).toLocaleString() : 'Awaiting check'
const words = (v: string) => v.replaceAll('_', ' ')

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
  const [reason, setReason] = useState('')
  const path = '/cases/' + report.id

  const allKeys = Array.from(new Set(report.events.map(e => e.object_key)))
  const isCritical = report.score >= 60

  return (
    <div style={{ display: 'grid', gap: '1.75rem' }}>
      {/* Top Breadcrumb & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <button className="btn-secondary" onClick={onBack}>
          <ChevronLeft style={{ width: '16px', height: '16px' }} />
          Back to Incident Queue
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={() => onDownload(path + '/export', `aegis-incident-${report.id}.json`)}>
            <Download style={{ width: '15px', height: '15px' }} />
            Export Evidence JSON
          </button>
        </div>
      </div>

      {/* Incident Header Card */}
      <div className={isCritical ? "soc-card-threat" : "soc-card"} style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <span className={`badge ${isCritical ? 'badge-red' : 'badge-amber'}`}>
                {report.stage.toUpperCase()}
              </span>
              <span className="badge badge-cyan font-mono">{report.connection.mode.toUpperCase()}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} className="font-mono">ID: {report.id}</span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#f8fafc' }}>
              {report.connection.label}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Storage Target: <span className="font-mono" style={{ color: '#38bdf8' }}>s3://{report.connection.bucket}/{report.connection.prefix}</span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Threat Score</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: isCritical ? '#ef4444' : '#fbbf24', lineHeight: 1 }}>
              {report.score}<span style={{ fontSize: '1.25rem', color: '#64748b' }}>/100</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: isCritical ? '#fca5a5' : '#fcd34d', fontWeight: 600, marginTop: '0.25rem' }}>
              {isCritical ? 'CRITICAL ATTACK BURST' : 'SUSPICIOUS ACTIVITY'}
            </div>
          </div>
        </div>

        {/* Behavioral Explanation Claims */}
        <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '1rem', marginTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
            Threat Scoring & Behavioral Memory Claims:
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.825rem', color: '#cbd5e1' }}>
            {report.explanation.claims.map((claim, idx) => (
              <li key={idx} style={{ marginBottom: '0.35rem' }}>
                <strong>{claim.text}</strong>
                {claim.event_ids?.length > 0 && (
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.5rem' }}>
                    (Events: {claim.event_ids.join(', ')})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Visual Attack Timeline Track */}
      <div className="soc-card" style={{ padding: '1.75rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1.25rem', color: '#f8fafc' }}>
          Attack & Response Timeline
        </h2>

        <div className="timeline-track">
          {report.timeline.map((item, index) => {
            const isAlert = item.action.includes('alert') || item.action.includes('detect')
            const isCutoff = item.action.includes('contain') || item.action.includes('restrict')
            const isRecover = item.action.includes('recover') || item.action.includes('verify')

            return (
              <div className="timeline-node" key={item.id || index}>
                <div className="timeline-marker" style={{
                  borderColor: isAlert ? '#ef4444' : isCutoff ? '#38bdf8' : isRecover ? '#10b981' : '#64748b'
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isAlert ? '#ef4444' : isCutoff ? '#38bdf8' : isRecover ? '#10b981' : '#64748b'
                  }} />
                </div>

                <div style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>
                      {words(item.action).toUpperCase()}
                    </span>
                    <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {stamp(item.at)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#94a3b8' }}>
                    {item.detail}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }} className="font-mono">
                    Actor: {item.actor}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Response Decision & Containment Controls */}
      {canReview && (
        <div className="soc-card" style={{ padding: '1.75rem', border: '1px solid rgba(6,182,212,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              SOC Response Decision Center
            </h2>
            <span className="badge badge-cyan">Automated & Approval Workflows</span>
          </div>

          <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'grid', gap: '0.35rem' }}>
              Decision Reason / Analyst Notes:
              <input
                className="soc-input"
                placeholder="Enter justification for containment or dismissal (e.g., Confirmed malicious test overwrite)..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                maxLength={500}
              />
            </label>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {report.stage === 'open' && (
                <button className="btn-primary" disabled={busy} onClick={() => onAct(path + '/step', { action: 'review' })}>
                  Acknowledge & Begin Review
                </button>
              )}

              {['open', 'review'].includes(report.stage) && (
                <>
                  <button className="btn-danger" disabled={busy} onClick={() => onAct(path + '/containment/restrict')}>
                    <Lock style={{ width: '15px', height: '15px' }} />
                    Preview & Execute IAM Cutoff
                  </button>
                  <button className="btn-secondary" disabled={busy || !reason.trim()} onClick={() => onAct(path + '/step', { action: 'skip_containment', reason })}>
                    Dismiss / Skip Containment
                  </button>
                </>
              )}

              {['contained', 'containment_uncertain', 'recovered', 'partial_recovery'].includes(report.stage) && (
                <button className="btn-secondary" disabled={busy} onClick={() => onAct(path + '/containment/reverse')}>
                  Preview Access Reversal (Unblock)
                </button>
              )}

              {['containment_skipped', 'reversed', 'recovered', 'partial_recovery'].includes(report.stage) && (
                <button className="btn-secondary" disabled={busy || !reason.trim()} onClick={() => onAct(path + '/step', { action: 'close', reason })}>
                  Close Incident Case
                </button>
              )}
            </div>
          </div>

          {report.restriction && (
            <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>Active IAM Restriction Policy</strong>
                <span className="badge badge-emerald">Enforced</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                {report.restriction.until_at ? 'Automatic expiration TTL: ' + stamp(report.restriction.until_at) : 'Enforced until explicit reversal.'}
              </div>
              <pre className="font-mono" style={{ fontSize: '0.75rem', background: '#090e1a', padding: '0.75rem', borderRadius: '6px', overflowX: 'auto', margin: 0, color: '#38bdf8' }}>
                {JSON.stringify(report.restriction.policy, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Affected Storage Keys & Recovery Selector */}
      <div className="soc-card" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              Affected S3 Objects ({allKeys.length})
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Select objects to generate candidate pre-attack rollback plan.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setSelectedKeys(selectedKeys.length === allKeys.length ? [] : allKeys)}
            >
              {selectedKeys.length === allKeys.length ? 'Deselect All' : 'Select All Objects'}
            </button>
            {canReview && (
              <button
                className="btn-primary"
                disabled={busy || !selectedKeys.length}
                onClick={() => onAct(path + '/recovery', { keys: selectedKeys })}
              >
                <RotateCcw style={{ width: '14px', height: '14px' }} />
                Preview Selected Recovery ({selectedKeys.length})
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {allKeys.map((key) => {
            const isSelected = selectedKeys.includes(key)
            const isCanary = key.includes('.aegis-canaries') || key.includes('canary')

            return (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.85rem',
                  background: isSelected ? 'rgba(6,182,212,0.1)' : 'rgba(15,23,42,0.5)',
                  border: isSelected ? '1px solid rgba(6,182,212,0.4)' : '1px solid var(--border-muted)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.825rem'
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => setSelectedKeys(e.target.checked ? [...selectedKeys, key] : selectedKeys.filter(x => x !== key))}
                />
                <span className="font-mono" style={{ color: isCanary ? '#f87171' : '#cbd5e1' }}>
                  {key}
                </span>
                {isCanary && <span className="badge badge-red" style={{ fontSize: '0.6rem' }}>TRIPWIRE DECOY</span>}
              </label>
            )
          })}
        </div>
      </div>

      {/* Probes, Approvals and Results */}
      {report.jobs.length > 0 && (
        <div className="soc-card" style={{ padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>
            Action Approvals & Cryptographic Verification
          </h2>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {report.jobs.map(job => (
              <div key={job.id} style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid var(--border-muted)', borderRadius: '8px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>{words(job.kind).toUpperCase()}</strong>
                    <span className="badge badge-cyan" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>{job.state.toUpperCase()}</span>
                  </div>
                  {job.expires && <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expires: {stamp(job.expires)}</span>}
                </div>

                {job.payload.items && job.payload.items.length > 0 && (
                  <div style={{ margin: '1rem 0' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                      Cryptographically Verified Rollback Items:
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="soc-table">
                        <thead>
                          <tr>
                            <th>Object Key</th>
                            <th>Pre-Attack Version ID</th>
                            <th>Target Recovery Bucket</th>
                            <th>SHA-256 Checksum</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {job.payload.items.map((item, n) => {
                            const isVerified = job.result.verified?.[n]
                            return (
                              <tr key={item.key}>
                                <td className="font-mono">{item.key}</td>
                                <td className="font-mono" style={{ color: '#38bdf8' }}>{item.source}</td>
                                <td className="font-mono">{job.payload.recovery_bucket || 'staging'}</td>
                                <td className="font-mono" style={{ fontSize: '0.7rem' }}>{item.sha256}</td>
                                <td>
                                  <span className={`badge ${isVerified ? 'badge-emerald' : 'badge-amber'}`}>
                                    {isVerified ? 'VERIFIED' : 'PENDING'}
                                  </span>
                                </td>
                                <td>
                                  {isVerified && (
                                    <button
                                      className="btn-secondary"
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                                      onClick={() => onDownload(path + `/jobs/${job.id}/files/${n}`, `recovered-${item.key.split('/').pop()}`)}
                                    >
                                      Download Copy
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {job.state === 'preview' && admin && (
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button className="btn-primary" disabled={busy || job.expires * 1000 <= Date.now()} onClick={() => onAct(path + `/jobs/${job.id}/approve`)}>
                      Confirm & Approve Execution
                    </button>
                    <button className="btn-secondary" disabled={busy} onClick={() => onAct(path + `/jobs/${job.id}/reject`)}>
                      Reject Proposal
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CloudTrail Raw Event Evidence Table */}
      {report.events.length > 0 && (
        <div className="soc-card" style={{ padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>
            Storage Telemetry & CloudTrail Audit Records ({report.events.length})
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table className="soc-table">
              <thead>
                <tr>
                  <th>Object Key</th>
                  <th>Operation</th>
                  <th>Recorded IAM Identity</th>
                  <th>Timestamp</th>
                  <th>Event ID</th>
                </tr>
              </thead>
              <tbody>
                {report.events.map((e) => (
                  <tr key={e.event_id}>
                    <td className="font-mono" style={{ color: '#f8fafc' }}>{e.object_key}</td>
                    <td>
                      <span className={`badge ${e.operation.includes('Delete') ? 'badge-red' : 'badge-cyan'}`}>
                        {e.operation}
                      </span>
                    </td>
                    <td className="font-mono" style={{ fontSize: '0.75rem' }}>{e.source?.role_arn || e.actor}</td>
                    <td className="font-mono" style={{ fontSize: '0.75rem' }}>{stamp(e.at)}</td>
                    <td className="font-mono" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{e.event_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
