'use client'

import React from 'react'
import {
  Lock,
  ShieldAlert,
  ShieldCheck,
  Key,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Server
} from 'lucide-react'

interface Case {
  id: string
  label: string
  mode: string
  actor: string
  score: number
  stage: string
  last_at: number
}

interface ContainmentProps {
  cases: Case[]
  onOpenCase: (id: string) => void
}

export default function ContainmentView({ cases, onOpenCase }: ContainmentProps) {
  const containedCases = cases.filter(c => ['contained', 'reversed'].includes(c.stage))
  const openCases = cases.filter(c => ['open', 'review'].includes(c.stage))

  return (
    <div style={{ display: 'grid', gap: '1.75rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.25rem', color: '#f8fafc' }}>
          Customer-Controlled Access Revocation (IAM)
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Enforce least-privilege containment by attaching explicit IAM Deny policies to compromised credentials without impacting healthcare operations.
        </p>
      </div>

      {/* Containment Architecture Highlights */}
      <div className="soc-grid-kpi">
        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Containment Modes</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.35rem' }}>
            Approval & Opt-In Auto
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Customer keeps ultimate veto authority</div>
        </div>

        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Scope Boundary</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', marginTop: '0.35rem' }}>
            Targeted IAM Role
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Doctor & patient services stay active</div>
        </div>

        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Revocation TTL</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a78bfa', marginTop: '0.35rem' }}>
            Automatic 900s Expiry
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Prevents permanent lockouts</div>
        </div>
      </div>

      {/* Pending Containment Decisions */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Pending Access Cutoff Decisions ({openCases.length})
          </h2>
          <span className="badge badge-amber">Action Required</span>
        </div>

        {openCases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
            <ShieldCheck style={{ width: '32px', height: '32px', color: '#10b981', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>No Roles Pending Cutoff</div>
            <div style={{ fontSize: '0.75rem' }}>All open cases have been either reviewed or contained.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {openCases.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className="badge badge-red font-mono">RISK {c.score}/100</span>
                    <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>{c.label}</strong>
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Implicated Role: {c.actor}
                  </div>
                </div>

                <button className="btn-danger" onClick={() => onOpenCase(c.id)}>
                  Review IAM Cutoff <ArrowRight style={{ width: '14px', height: '14px' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contained or Reversed Cases */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>
          Contained IAM Identities & Restriction History ({containedCases.length})
        </h2>

        {containedCases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No previous restriction records.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {containedCases.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid var(--border-muted)',
                  borderRadius: '8px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className="badge badge-emerald">{c.stage.toUpperCase()}</span>
                    <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>{c.label}</strong>
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {c.actor}
                  </div>
                </div>

                <button className="btn-secondary" onClick={() => onOpenCase(c.id)}>
                  View Audit Details
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
