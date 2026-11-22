'use client'

import React from 'react'
import {
  RotateCcw,
  CheckCircle2,
  FileCheck,
  Download,
  ShieldCheck,
  ArrowRight,
  Database,
  Lock
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

interface RecoveryProps {
  cases: Case[]
  onOpenCase: (id: string) => void
}

export default function RecoveryCenterView({ cases, onOpenCase }: RecoveryProps) {
  const recoverableCases = cases.filter(c => ['contained', 'review', 'open', 'recovered', 'partial_recovery'].includes(c.stage))

  return (
    <div style={{ display: 'grid', gap: '1.75rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.25rem', color: '#f8fafc' }}>
          Safe S3 Object Version Recovery
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Restore clean pre-attack files from Amazon S3 Versioning history with customer approval and per-object cryptographic SHA-256 verification.
        </p>
      </div>

      {/* Recovery Safeguards Grid */}
      <div className="soc-grid-kpi">
        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recovery Protocol</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.35rem' }}>
            Pre-Attack Version IDs
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Traces clean versions prior to first strike</div>
        </div>

        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Staging Isolation</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a78bfa', marginTop: '0.35rem' }}>
            Separate Staging Bucket
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Restores to recovery bucket before cutover</div>
        </div>

        <div className="soc-card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Integrity Assurance</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', marginTop: '0.35rem' }}>
            SHA-256 Hash Matching
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Reads back and verifies every byte</div>
        </div>
      </div>

      {/* Recoverable Incidents */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem', color: '#f8fafc' }}>
          Incident Storage Rollback Candidates ({recoverableCases.length})
        </h2>

        {recoverableCases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
            <FileCheck style={{ width: '32px', height: '32px', color: '#10b981', margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>Zero Data Recovery Tasks Pending</div>
            <div style={{ fontSize: '0.75rem' }}>No compromised buckets currently require version rollback.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {recoverableCases.map(c => (
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
                    <span className="badge badge-cyan">{c.stage.toUpperCase()}</span>
                    <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>{c.label}</strong>
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Implicated Role: {c.actor}
                  </div>
                </div>

                <button className="btn-primary" onClick={() => onOpenCase(c.id)}>
                  <RotateCcw style={{ width: '14px', height: '14px' }} />
                  Configure & Execute Recovery <ArrowRight style={{ width: '14px', height: '14px' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verification Protocol Info */}
      <div className="soc-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#f8fafc' }}>
          Cryptographic Verification Safeguards (feature.md Specification)
        </h3>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          AEGIS never assumes recovery succeeded merely because an AWS copy request returned 200 OK. 
          The customer Guardian component independently reads back the restored object, compares the expected cryptographic SHA-256 hash against the pre-attack version, confirms metadata and encryption policies, and registers an immutable audit result for every individual file.
        </p>
      </div>
    </div>
  )
}
