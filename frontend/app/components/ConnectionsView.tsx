'use client'

import React from 'react'
import {
  Database,
  Server,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Plus,
  Radio,
  ExternalLink,
  Layers
} from 'lucide-react'

interface ReadCheck {
  object_key: string
  requested_at: number
  event_id: string | null
}

interface Canary {
  object_key: string
  status: string
  trusted_version_id: string | null
}

interface Conn {
  id: string
  label: string
  mode: string
  enabled: boolean
  health: string
  checked_at: number
  bucket: string
  prefix: string
  recovery_bucket: string
  canary: string
  account: string | null
  region: string | null
  canaries: Canary[]
  read_monitoring: { status: string; checks: ReadCheck[] }
  slack_configured: boolean
  jira_configured: boolean
}

interface ConnectionsProps {
  connections: Conn[]
  admin: boolean
  busy: boolean
  onAct: (path: string, body?: unknown) => Promise<void>
}

const stamp = (time: number) => time ? new Date(time * 1000).toLocaleString() : 'Pending verification'
const words = (v: string) => v.replaceAll('_', ' ')

export default function ConnectionsView({
  connections,
  admin,
  busy,
  onAct
}: ConnectionsProps) {
  return (
    <div style={{ display: 'grid', gap: '1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.25rem', color: '#f8fafc' }}>
            Cloud Storage Assets & Canary Tripwires
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
            Enrolled S3 buckets, planted decoy canaries, CloudTrail event pipelines, and recovery staging targets.
          </p>
        </div>

        {admin && (
          <button className="btn-secondary" disabled={busy} onClick={() => onAct('/connections/replay')}>
            <Plus style={{ width: '15px', height: '15px' }} />
            Add Practice Bucket
          </button>
        )}
      </div>

      {connections.length === 0 ? (
        <div className="soc-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Database style={{ width: '40px', height: '40px', color: '#64748b', margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>No Connected S3 Buckets</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '450px', margin: '0 auto 1.5rem', fontSize: '0.85rem' }}>
            Connect a customer AWS account or click Add Practice Bucket to launch a synthetic hospital storage simulation.
          </p>
          {admin && (
            <button className="btn-primary" disabled={busy} onClick={() => onAct('/connections/replay')}>
              Initialize Practice Environment
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {connections.map(c => (
            <div key={c.id} className="soc-card" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
                    <span className="badge badge-cyan font-mono">{c.mode.toUpperCase()}</span>
                    <span className={`badge ${c.enabled ? 'badge-emerald' : 'badge-slate'}`}>
                      {c.enabled ? 'MONITORING ACTIVE' : 'PAUSED'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="font-mono">ID: {c.id}</span>
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                    {c.label}
                  </h2>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {admin && (
                    <button className="btn-secondary" disabled={busy} onClick={() => onAct(`/connections/${c.id}/canaries`)}>
                      Provision Canaries (3)
                    </button>
                  )}
                  {admin && c.enabled && c.mode === 'aws' && (
                    <button className="btn-secondary" disabled={busy} onClick={() => onAct(`/connections/${c.id}/read-check`)}>
                      Test Read Delivery
                    </button>
                  )}
                  {admin && (
                    <button
                      className={c.enabled ? 'btn-secondary' : 'btn-primary'}
                      disabled={busy}
                      onClick={() => onAct(`/connections/${c.id}/enabled/${!c.enabled}`)}
                    >
                      {c.enabled ? 'Pause Monitoring' : 'Enable Monitoring'}
                    </button>
                  )}
                </div>
              </div>

              {/* Bucket Metadata Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', background: 'rgba(15,23,42,0.6)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-muted)', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Protected S3 Storage</div>
                  <div className="font-mono" style={{ fontSize: '0.85rem', color: '#38bdf8', marginTop: '0.25rem' }}>
                    s3://{c.bucket}/{c.prefix}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recovery Staging Target</div>
                  <div className="font-mono" style={{ fontSize: '0.85rem', color: '#a78bfa', marginTop: '0.25rem' }}>
                    s3://{c.recovery_bucket}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>AWS Region & Account</div>
                  <div className="font-mono" style={{ fontSize: '0.85rem', color: '#e2e8f0', marginTop: '0.25rem' }}>
                    {c.region || 'ap-south-1'} · {c.account || 'Local Sandbox'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Queue Ingestion Health</div>
                  <div style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600, marginTop: '0.25rem' }}>
                    {c.health} · <span className="font-mono" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{stamp(c.checked_at)}</span>
                  </div>
                </div>
              </div>

              {/* Canary Decoys List */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                    Active Tripwire Canary Decoys ({c.canaries.length})
                  </h3>
                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>DECOY TRAPS</span>
                </div>

                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {c.canaries.length > 0 ? (
                    c.canaries.map(k => (
                      <div
                        key={k.object_key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.65rem 0.85rem',
                          background: 'rgba(9, 14, 26, 0.7)',
                          border: '1px solid var(--border-muted)',
                          borderRadius: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="radar-dot-safe" />
                          <span className="font-mono" style={{ fontSize: '0.8rem', color: '#f8fafc' }}>{k.object_key}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {k.trusted_version_id && (
                            <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Version: {k.trusted_version_id.substring(0, 16)}...
                            </span>
                          )}
                          <span className={`badge ${k.status === 'ready' ? 'badge-emerald' : 'badge-red'}`} style={{ fontSize: '0.65rem' }}>
                            {words(k.status).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No canaries provisioned. Click Provision Canaries to plant decoy traps.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
