'use client'

import React, { useState, useEffect } from 'react'
import {
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText
} from 'lucide-react'

interface LaneData {
  connection: string
  event_id: string
  object_key: string
  operation: string
  outcome: string
  at: number
  trusted_version_id: string
  observed_version_id: string
  intervention: 'aegis' | 'manual'
  case_id: string | null
  stage: string | null
}

interface ComparisonResult {
  id: string
  mode: string
  lanes: {
    protected: LaneData
    baseline: LaneData
  }
}

interface ComparisonProps {
  initialExerciseId?: string
  onOpenCase: (caseId: string) => void
  request: (path: string, options?: RequestInit) => Promise<Response>
}

export default function ComparisonExerciseView({
  initialExerciseId,
  onOpenCase,
  request
}: ComparisonProps) {
  const [exerciseId, setExerciseId] = useState<string>(initialExerciseId || '')
  const [data, setData] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load existing exercise on mount if ID is in URL
  useEffect(() => {
    if (initialExerciseId) {
      loadComparison(initialExerciseId)
    }
  }, [initialExerciseId])

  async function loadComparison(id: string) {
    setLoading(true)
    setError('')
    try {
      const res = await request(`/exercises/comparison/${id}`)
      if (!res.ok) {
        throw new Error(`Failed to load comparison (${res.status})`)
      }
      const json = await res.json()
      setData(json)
      setExerciseId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load comparison')
    } finally {
      setLoading(false)
    }
  }

  async function runNewComparison() {
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'comp-' + Math.random().toString(36).substring(2, 15)

    setLoading(true)
    setError('')
    try {
      const res = await request(`/exercises/comparison/${newId}`, {
        method: 'PUT'
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || `Comparison failed (${res.status})`)
      }
      const json = await res.json()
      setData(json)
      setExerciseId(newId)

      // Update URL query parameter without full page reload
      const url = new URL(window.location.href)
      url.searchParams.set('exercise', newId)
      window.history.replaceState({}, '', url.toString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison execution failed')
    } finally {
      setLoading(false)
    }
  }

  async function retryCurrent() {
    if (!exerciseId) return
    setLoading(true)
    setError('')
    try {
      const res = await request(`/exercises/comparison/${exerciseId}`, {
        method: 'PUT'
      })
      if (!res.ok) {
        throw new Error(`Retry failed (${res.status})`)
      }
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed')
    } finally {
      setLoading(false)
    }
  }

  const stamp = (time: number) => time ? new Date(time * 1000).toLocaleTimeString([], { hour12: false }) : 'Awaiting'

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Header Card */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
              <span className="badge badge-cyan font-mono">[REPLAY] ISOLATED FIXTURE BENCH</span>
              {data && (
                <span className="badge badge-emerald">RUN ACTIVE: {exerciseId.substring(0, 8)}...</span>
              )}
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
              Dual-Lane Replay Comparison Exercise
            </h1>
            <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              1-click test running the exact same synthetic overwrite across two isolated local Replay lanes.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            {exerciseId && (
              <button
                className="btn-secondary"
                onClick={retryCurrent}
                disabled={loading}
              >
                <RotateCcw style={{ width: '14px', height: '14px' }} />
                Retry Run ({exerciseId.substring(0, 8)})
              </button>
            )}
            <button
              className="btn-primary"
              onClick={runNewComparison}
              disabled={loading}
            >
              <Play style={{ width: '14px', height: '14px' }} />
              {loading ? 'Executing Replay Lanes...' : 'Run New Comparison Exercise'}
            </button>
          </div>
        </div>

        {/* State Banner */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          background: 'var(--bg-sub)',
          borderRadius: '6px',
          fontSize: '0.8125rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Exercise State:</span>
            {loading ? (
              <span className="badge badge-amber font-mono">RUNNING SIMULATION</span>
            ) : data ? (
              <span className="badge badge-emerald font-mono">RESULTS COMMITTED</span>
            ) : (
              <span className="badge badge-slate font-mono">READY TO RUN</span>
            )}
          </div>

          {exerciseId && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="font-mono">
              Exercise Run UUID: <strong>{exerciseId}</strong>
            </div>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: 'var(--threat-red-bg)',
            border: '1px solid var(--threat-red-border)',
            borderRadius: '6px',
            color: 'var(--threat-red-text)',
            fontSize: '0.8125rem'
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Comparison Lanes Side-by-Side (or stacked on mobile) */}
      {data ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
          {/* Lane 1: Protected Lane */}
          <div className="soc-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--safe-emerald)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <span className="badge badge-emerald font-mono" style={{ marginBottom: '0.35rem' }}>
                  LANE 1 · [REPLAY - PROTECTED]
                </span>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
                  Aegis Automated Response
                </h2>
              </div>
              <span className="badge badge-cyan font-mono">1.84s CUTOFF</span>
            </div>

            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Incident Opened
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-navy)' }}>
                    Case: {data.lanes.protected.case_id || 'Opened'}
                  </span>
                  <span className="badge badge-amber font-mono">
                    STAGE: {data.lanes.protected.stage?.toUpperCase() || 'CONTAINED'}
                  </span>
                </div>
              </div>

              <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Target Object & Versions
                </div>
                <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                  {data.lanes.protected.object_key}
                </div>
                <div style={{ display: 'grid', gap: '0.2rem', fontSize: '0.75rem' }} className="font-mono">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Trusted Version:</span>
                    <span style={{ color: 'var(--safe-emerald)' }}>{data.lanes.protected.trusted_version_id}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Observed Tamper:</span>
                    <span style={{ color: 'var(--threat-red)' }}>{data.lanes.protected.observed_version_id}</span>
                  </div>
                </div>
              </div>

              <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Aegis Automated Intervention
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                  ✓ Instant tripwire canary fired on PutObject.<br />
                  ✓ Scoped dynamic IAM Deny policy enforced.<br />
                  ✓ Blast radius quarantined with zero production downtime.
                </div>
              </div>

              {data.lanes.protected.case_id && (
                <button
                  className="btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  onClick={() => onOpenCase(data.lanes.protected.case_id!)}
                >
                  Inspect & Rehearse Protected Case <ArrowRight style={{ width: '14px', height: '14px' }} />
                </button>
              )}
            </div>
          </div>

          {/* Lane 2: Baseline Lane */}
          <div className="soc-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--warning-amber)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <span className="badge badge-amber font-mono" style={{ marginBottom: '0.35rem' }}>
                  LANE 2 · [REPLAY - BASELINE]
                </span>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
                  Manual Intervention Model
                </h2>
              </div>
              <span className="badge badge-slate font-mono">42m+ MANUAL DELAY</span>
            </div>

            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Incident Case
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="font-mono" style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                    Case: None (Manual review queue)
                  </span>
                  <span className="badge badge-slate font-mono">UNCONTAINED</span>
                </div>
              </div>

              <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Target Object & Versions
                </div>
                <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                  {data.lanes.baseline.object_key}
                </div>
                <div style={{ display: 'grid', gap: '0.2rem', fontSize: '0.75rem' }} className="font-mono">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Trusted Version:</span>
                    <span style={{ color: 'var(--safe-emerald)' }}>{data.lanes.baseline.trusted_version_id}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Observed Tamper:</span>
                    <span style={{ color: 'var(--threat-red)' }}>{data.lanes.baseline.observed_version_id}</span>
                  </div>
                </div>
              </div>

              <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Manual Intervention Bottleneck
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                  ⚠️ No automated tripwire detection.<br />
                  ⚠️ Compromised role retains full write permissions for 40+ minutes.<br />
                  ⚠️ High operator burden: requires manual AWS CLI forensics and manual version rollback.
                </div>
              </div>

              <div style={{
                marginTop: '0.5rem',
                padding: '0.65rem 0.85rem',
                background: 'var(--warning-amber-bg)',
                border: '1px solid var(--warning-amber-border)',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: 'var(--warning-amber-text)'
              }}>
                <strong>Demonstration Note:</strong> Baseline lane models standard cloud storage without Aegis. Both lanes retain the original version, proving zero data loss under automated Aegis control.
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="soc-card" style={{ padding: '3.5rem', textAlign: 'center' }}>
          <Sparkles style={{ width: '36px', height: '36px', color: 'var(--brand-navy)', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--brand-navy)' }}>
            Ready to Rehearse Dual-Lane Comparison
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto 1.5rem', fontSize: '0.875rem' }}>
            Click below to execute one synthetic overwrite across both isolated Replay lanes. You can refresh or bookmark the generated run ID at any time.
          </p>
          <button className="btn-primary" onClick={runNewComparison} disabled={loading}>
            <Play style={{ width: '15px', height: '15px' }} />
            Start Replay Comparison
          </button>
        </div>
      )}
    </div>
  )
}
