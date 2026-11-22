'use client'

import React, { useState } from 'react'
import {
  Zap,
  Play,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Terminal,
  ArrowRight,
  Sparkles,
  Layers
} from 'lucide-react'

interface Conn {
  id: string
  label: string
  mode: string
  enabled: boolean
}

interface AttackLabProps {
  connections: Conn[]
  busy: boolean
  onAct: (path: string, body?: unknown) => Promise<void>
  onOpenCase?: (id: string) => void
  onNavigateTab: (tab: any) => void
}

export default function AttackLabView({
  connections,
  busy,
  onAct,
  onNavigateTab
}: AttackLabProps) {
  const [log, setLog] = useState<string[]>([])
  const [activeScenario, setActiveScenario] = useState<string | null>(null)

  const targetConn = connections[0]

  async function runSimulation(scenario: string) {
    if (!targetConn) return
    setActiveScenario(scenario)
    setLog(prev => [
      `[${new Date().toLocaleTimeString()}] INITIATING SIMULATION: ${scenario.toUpperCase()}...`,
      ...prev
    ])

    try {
      await onAct(`/connections/${targetConn.id}/replay/${scenario}`)
      setLog(prev => [
        `[${new Date().toLocaleTimeString()}] COMPLETED: ${scenario} executed successfully. Telemetry ingested into AEGIS.`,
        `[${new Date().toLocaleTimeString()}] THREAT EVALUATOR: Behavioral rules evaluated. Check Incident Queue.`,
        ...prev
      ])
    } catch (e) {
      setLog(prev => [
        `[${new Date().toLocaleTimeString()}] ERROR: Simulation failed - ${e instanceof Error ? e.message : 'Unknown error'}`,
        ...prev
      ])
    } finally {
      setActiveScenario(null)
    }
  }

  const scenarios = [
    {
      id: 'canary-overwrite',
      title: 'Decoy Canary Overwrite Attack',
      severity: 'CRITICAL',
      badgeClass: 'badge-red',
      score: '65 / 100',
      description: 'Attacker compromises storage credentials and overwrites a hidden tripwire canary file (.aegis-canaries/check-1.txt).',
      expected: 'Canary tripwire fires instantly. Threat score spikes to Critical. IAM access revocation is recommended.'
    },
    {
      id: 'correlated',
      title: 'Multi-Stage Ransomware Attack Pattern',
      severity: 'CRITICAL',
      badgeClass: 'badge-red',
      score: '85 / 100',
      description: 'Attacker performs rapid mass-overwrites on synthetic hospital records combined with canary file modifications.',
      expected: 'Velocity burst rules trigger + canary trip + off-hours multiplier. Triggers immediate automated cutoff.'
    },
    {
      id: 'bulk',
      title: 'Authorized Daytime Bulk Upload',
      severity: 'BENIGN',
      badgeClass: 'badge-cyan',
      score: '15 / 100',
      description: 'Authorized medical records service uploads 50 new clinical PDF reports during standard operational hours.',
      expected: 'IntentGuard recognizes new object keys matching authorized role patterns. Zero false alarms triggered.'
    },
    {
      id: 'routine',
      title: 'Routine Doctor Report Generation',
      severity: 'BENIGN',
      badgeClass: 'badge-emerald',
      score: '0 / 100',
      description: 'Normal doctor-patient consultation workflow generating synthetic patient diagnostic reports.',
      expected: 'Baseline telemetry recorded in activity stream. No incidents created.'
    },
    {
      id: 'canary-read',
      title: 'Canary Read & Discovery Probe',
      severity: 'SUSPICIOUS',
      badgeClass: 'badge-amber',
      score: '30 / 100',
      description: 'Attacker enumerates and reads canary traps during reconnaissance phase before encryption.',
      expected: 'CloudTrail read telemetry alert logged. Triggers elevated watch on the session identifier.'
    }
  ]

  return (
    <div style={{ display: 'grid', gap: '1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.25rem', color: '#f8fafc' }}>
            Attack Simulation & Rehearsal Lab
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
            Test and prove early-warning ransomware detection, low false-alarm thresholds, and IAM access cutoff live.
          </p>
        </div>

        <button className="btn-secondary" onClick={() => onNavigateTab('Incidents')}>
          View Incident Queue <ArrowRight style={{ width: '15px', height: '15px' }} />
        </button>
      </div>

      {!targetConn ? (
        <div className="soc-card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>No practice connection available. Please open Cloud Assets & Canaries and click "Add practice bucket".</p>
        </div>
      ) : (
        <>
          {/* Target Environment Badge */}
          <div className="soc-card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Terminal style={{ width: '20px', height: '20px', color: '#38bdf8' }} />
              <div>
                <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>Active Simulation Target:</strong>{' '}
                <span className="font-mono" style={{ color: '#38bdf8' }}>{targetConn.label}</span>
              </div>
            </div>
            <span className="badge badge-cyan font-mono">{targetConn.mode.toUpperCase()} MODE</span>
          </div>

          {/* Scenarios Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {scenarios.map(sc => (
              <div key={sc.id} className="soc-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span className={`badge ${sc.badgeClass}`}>{sc.severity}</span>
                    <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Risk: <strong>{sc.score}</strong>
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>
                    {sc.title}
                  </h3>

                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                    {sc.description}
                  </p>

                  <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid var(--border-muted)', borderRadius: '6px', padding: '0.65rem', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '1.25rem' }}>
                    <strong style={{ color: '#38bdf8' }}>Expected Outcome:</strong> {sc.expected}
                  </div>
                </div>

                <button
                  className={sc.severity === 'CRITICAL' ? 'btn-danger' : 'btn-primary'}
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={busy || activeScenario !== null}
                  onClick={() => runSimulation(sc.id)}
                >
                  <Play style={{ width: '15px', height: '15px' }} />
                  {activeScenario === sc.id ? 'Running Simulation...' : `Execute ${sc.title}`}
                </button>
              </div>
            ))}
          </div>

          {/* Live Simulator Log Terminal */}
          <div className="soc-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Terminal style={{ width: '16px', height: '16px', color: '#38bdf8' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Simulator Output Console
                </h3>
              </div>
              <button className="btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }} onClick={() => setLog([])}>
                Clear Console
              </button>
            </div>

            <div
              className="font-mono"
              style={{
                background: '#060a14',
                border: '1px solid var(--border-muted)',
                borderRadius: '8px',
                padding: '1rem',
                minHeight: '140px',
                maxHeight: '220px',
                overflowY: 'auto',
                fontSize: '0.775rem',
                color: '#34d399',
                lineHeight: 1.6
              }}
            >
              {log.length === 0 ? (
                <span style={{ color: '#64748b' }}>Ready for execution. Click any scenario button above to simulate telemetry...</span>
              ) : (
                log.map((line, idx) => <div key={idx}>{line}</div>)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
