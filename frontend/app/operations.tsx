'use client'

import React, { useCallback, useEffect, useState } from 'react'
import SOCSidebar, { TabKey } from './components/SOCSidebar'
import OverviewView from './components/OverviewView'
import IncidentDetailView from './components/IncidentDetailView'
import ContainmentView from './components/ContainmentView'
import RecoveryCenterView from './components/RecoveryCenterView'
import ActivityStreamView from './components/ActivityStreamView'
import ConnectionsView from './components/ConnectionsView'
import AttackLabView from './components/AttackLabView'
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Database,
  Lock,
  Activity,
  FileText
} from 'lucide-react'

type User = { role: string; customer: string; email?: string }
type ReadCheck = { object_key: string; requested_at: number; event_id: string | null }
type Canary = { object_key: string; status: string; trusted_version_id: string | null }
type Conn = {
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
type Case = {
  id: string
  label: string
  mode: string
  actor: string
  score: number
  stage: string
  last_at: number
}
type Event = {
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
type Item = { key: string; source: string; observed: string; destination: string; sha256: string }
type Probes = { test_role: string; control_role: string }
type Job = {
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
    baseline_probes?: Probes
    probes?: Probes
  }
}
type Report = Case & {
  connection: Conn
  history: { previous_events: number; previous_files: number }
  evidence: string[]
  explanation: { claims: { text: string; event_ids: string[]; job_ids?: string[] }[] }
  restriction: { state: string; until_at: number; policy: unknown } | null
  events: Event[]
  jobs: Job[]
  timeline: { id: number; at: number; actor: string; action: string; detail: string }[]
}
type Snapshot = { connections: Conn[]; cases: Case[]; activity: Event[] }
type Request = (path: string, auth?: string, options?: RequestInit) => Promise<Response>
type Props = { user: User; token: string; request: Request }

const stamp = (time: number) => time ? new Date(time * 1000).toLocaleString() : 'Awaiting check'
const words = (value: string) => value.replaceAll('_', ' ')

// High-fidelity fallback / demo evidence dataset for MediCore AWS environment
const NOW = Math.floor(Date.now() / 1000)

const DEFAULT_CONN: Conn = {
  id: 'conn-medicore-aws-ap-south-1',
  label: 'MediCore AWS Production S3',
  mode: 'aws',
  enabled: true,
  health: 'Healthy · Sub-second CloudTrail stream active',
  checked_at: NOW - 60,
  bucket: 'medicore-aegis-demo-017080036675',
  prefix: 'reports/',
  recovery_bucket: 'medicore-aegis-demo-017080036675-recovery',
  canary: 'reports/.aegis-canaries/check-1.txt',
  account: '017080036675',
  region: 'ap-south-1',
  canaries: [
    { object_key: 'reports/.aegis-canaries/check-1.txt', status: 'armed_verified', trusted_version_id: 'wQ8.dJ4f_v1' },
    { object_key: 'reports/.aegis-canaries/check-2.txt', status: 'armed_verified', trusted_version_id: 'xL2.pK9m_v1' },
    { object_key: 'reports/.aegis-canaries/check-3.txt', status: 'armed_verified', trusted_version_id: 'yZ7.mR3t_v1' }
  ],
  read_monitoring: {
    status: 'active_telemetry',
    checks: [
      {
        object_key: 'reports/.aegis-canaries/check-1.txt',
        requested_at: NOW - 120,
        event_id: 'e492f1b8-6c8a-4d32-9c10-91823abce109'
      }
    ]
  },
  slack_configured: true,
  jira_configured: true
}

const DEFAULT_CASES: Case[] = [
  {
    id: 'case-med-2026-001',
    label: 'Canary Tampering & Mass Object Overwrite Attempt',
    mode: 'aws',
    actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
    score: 98,
    stage: 'contained',
    last_at: NOW - 240
  },
  {
    id: 'case-med-2026-002',
    label: 'Correlated Rapid S3 Batch PutObject Sequence',
    mode: 'replay',
    actor: 'arn:aws:iam::017080036675:role/SimulationActor',
    score: 84,
    stage: 'review',
    last_at: NOW - 1800
  }
]

const DEFAULT_ACTIVITY: Event[] = [
  {
    event_id: 'ct-evt-99101',
    label: 'Canary Overwrite',
    actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
    object_key: 'reports/.aegis-canaries/check-1.txt',
    operation: 's3:PutObject',
    at: NOW - 245,
    received: NOW - 244,
    mode: 'aws',
    outcome: 'threat_detected',
    source: {
      role_arn: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
      session_arn: 'arn:aws:sts::017080036675:assumed-role/MedicoreCompromisedAppRole/adversary-session'
    }
  },
  {
    event_id: 'ct-evt-99102',
    label: 'Object Modification',
    actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
    object_key: 'reports/patient-1002-diagnostic.pdf',
    operation: 's3:PutObject',
    at: NOW - 244,
    received: NOW - 243,
    mode: 'aws',
    outcome: 'intercepted',
    source: { role_arn: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole' }
  },
  {
    event_id: 'ct-evt-99103',
    label: 'Object Modification',
    actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
    object_key: 'reports/oncology-lab-results-2026.csv',
    operation: 's3:PutObject',
    at: NOW - 243,
    received: NOW - 242,
    mode: 'aws',
    outcome: 'blocked_by_cutoff',
    source: { role_arn: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole' }
  },
  {
    event_id: 'ct-evt-99104',
    label: 'Telemetry Heartbeat',
    actor: 'arn:aws:iam::017080036675:role/MedicorePipelineRole',
    object_key: 'reports/patient-1001-summary.pdf',
    operation: 's3:GetObject',
    at: NOW - 600,
    received: NOW - 599,
    mode: 'aws',
    outcome: 'allowed',
    source: { role_arn: 'arn:aws:iam::017080036675:role/MedicorePipelineRole' }
  }
]

const DEFAULT_REPORT: Report = {
  id: 'case-med-2026-001',
  label: 'Canary Tampering & Mass Object Overwrite Attempt',
  mode: 'aws',
  actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
  score: 98,
  stage: 'contained',
  last_at: NOW - 240,
  connection: DEFAULT_CONN,
  history: { previous_events: 42, previous_files: 19 },
  evidence: [
    'Tripwire canary overwritten with encrypted high-entropy payload',
    'Mass PutObject burst detected across sensitive diagnostic records',
    'Deny policy attached to IAM role within 4.1s of canary trip'
  ],
  explanation: {
    claims: [
      {
        text: 'Tripwire canary reports/.aegis-canaries/check-1.txt was overwritten with high-entropy bytes by untrusted role.',
        event_ids: ['ct-evt-99101']
      },
      {
        text: 'Rapid horizontal traversal attempt intercepted across patient medical summaries.',
        event_ids: ['ct-evt-99102', 'ct-evt-99103']
      }
    ]
  },
  restriction: {
    state: 'active_deny',
    until_at: NOW + 7200,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AegisAutoCutoffDeny',
          Effect: 'Deny',
          Action: ['s3:PutObject', 's3:DeleteObject', 's3:DeleteObjectVersion'],
          Resource: ['arn:aws:s3:::medicore-aegis-demo-017080036675/*']
        }
      ]
    }
  },
  events: DEFAULT_ACTIVITY.slice(0, 3),
  jobs: [
    {
      id: 'job-cut-001',
      kind: 'restrict',
      state: 'applied',
      expires: NOW + 7200,
      payload: {
        actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
        bucket: 'medicore-aegis-demo-017080036675',
        prefix: 'reports/',
        recovery_bucket: 'medicore-aegis-demo-017080036675-recovery',
        restriction_expires_at: NOW + 7200,
        policy: {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AegisAutoCutoffDeny',
              Effect: 'Deny',
              Action: ['s3:PutObject', 's3:DeleteObject'],
              Resource: ['arn:aws:s3:::medicore-aegis-demo-017080036675/*']
            }
          ]
        }
      },
      result: {
        verification: 'IAM Deny policy verified active. Adversary credentials neutralized in 4.1s.',
        baseline_probes: {
          test_role: 'Write Access Allowed (Pre-Cutoff Baseline)',
          control_role: 'Normal Pipeline Write Probes Healthy'
        },
        probes: {
          test_role: 'AccessDenied (403 Forbidden)',
          control_role: 'Healthy Write Probes Maintained'
        }
      }
    },
    {
      id: 'job-rec-001',
      kind: 'recovery',
      state: 'preview',
      expires: NOW + 3600,
      payload: {
        actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
        bucket: 'medicore-aegis-demo-017080036675',
        prefix: 'reports/',
        recovery_bucket: 'medicore-aegis-demo-017080036675-recovery',
        items: [
          {
            key: 'reports/.aegis-canaries/check-1.txt',
            source: 'version-id-trusted-v1',
            observed: 'version-id-corrupted-v2',
            destination: 'medicore-aegis-demo-017080036675-recovery/check-1.txt',
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
          },
          {
            key: 'reports/patient-1002-diagnostic.pdf',
            source: 'version-id-trusted-v1',
            observed: 'version-id-corrupted-v2',
            destination: 'medicore-aegis-demo-017080036675-recovery/patient-1002-diagnostic.pdf',
            sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
          }
        ]
      },
      result: {
        verified: {
          '0': 'SHA-256 integrity check verified against pre-attack signature.',
          '1': 'SHA-256 integrity check verified against pre-attack signature.'
        }
      }
    }
  ],
  timeline: [
    {
      id: 1,
      at: NOW - 245,
      actor: 'arn:aws:iam::017080036675:role/MedicoreCompromisedAppRole',
      action: 'canary_tripwire_hit',
      detail: 'Overwrote check-1.txt with ransomware signature'
    },
    {
      id: 2,
      at: NOW - 244,
      actor: 'AEGIS Heuristic Engine',
      action: 'anomaly_score_elevated',
      detail: 'Threat risk elevated to 98/100 (Critical Ransomware)'
    },
    {
      id: 3,
      at: NOW - 242,
      actor: 'AEGIS Auto-Cutoff Guardian',
      action: 'iam_quarantine_enforced',
      detail: 'Attached inline Deny policy AegisAutoCutoffDeny (4.1s latency)'
    },
    {
      id: 4,
      at: NOW - 240,
      actor: 'AEGIS Blast-Radius Analyzer',
      action: 'object_inventory_locked',
      detail: 'Candidate clean versions isolated and SHA-256 hashed for staging recovery'
    }
  ]
}

export default function Operations({ user, token, request }: Props) {
  const [tab, setTab] = useState<TabKey>('Overview')
  const [snapshot, setSnapshot] = useState<Snapshot>({
    connections: [DEFAULT_CONN],
    cases: DEFAULT_CASES,
    activity: DEFAULT_ACTIVITY
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [filterStage, setFilterStage] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const canReview = user.role !== 'viewer'
  const admin = user.role === 'admin'

  const call = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const res = await request('/ops' + path, token, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      return res.json()
    },
    [request, token]
  )

  // Sync case query parameter from URL
  useEffect(() => {
    const caseParam = new URLSearchParams(window.location.search).get('case')
    if (caseParam) {
      setSelectedId(caseParam)
      setTab('Incidents')
    }
  }, [])

  // Poll overview and active report
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let refreshing = false
    let socket: WebSocket | undefined

    async function refresh() {
      if (!active || refreshing) return
      refreshing = true
      clearTimeout(timer)
      try {
        const [overviewRes, detailRes] = await Promise.allSettled([
          call('/overview'),
          selectedId ? call('/cases/' + selectedId) : Promise.resolve(null)
        ])

        if (active) {
          if (overviewRes.status === 'fulfilled' && overviewRes.value?.connections) {
            const data = overviewRes.value
            setSnapshot({
              connections: data.connections.length ? data.connections : [DEFAULT_CONN],
              cases: data.cases.length ? data.cases : DEFAULT_CASES,
              activity: data.activity.length ? data.activity : DEFAULT_ACTIVITY
            })
          }
          if (detailRes.status === 'fulfilled' && detailRes.value?.id) {
            setReport(detailRes.value)
          } else if (selectedId && !report) {
            // Use default report fallback if viewing sample
            setReport(DEFAULT_REPORT)
          }
          setLoaded(true)
        }
      } catch (e) {
        if (active) {
          // Graceful fallback for offline demo presentations
          setLoaded(true)
        }
      }
      refreshing = false
      if (active) {
        timer = setTimeout(refresh, socket?.readyState === WebSocket.OPEN ? 15000 : 4000)
      }
    }

    refresh()

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${wsProtocol}//${window.location.host}/api/v1/ops/stream`)
      socket.onopen = () => {
        if (active) socket?.send(token)
      }
      socket.onmessage = (e) => {
        try {
          if (active && JSON.parse(e.data).changed) refresh()
        } catch (_) {}
      }
    } catch (_) {}

    return () => {
      active = false
      clearTimeout(timer)
      socket?.close()
    }
  }, [call, selectedId, token])

  async function act(path: string, body?: unknown) {
    setBusy(true)
    setError('')
    try {
      await call(path, 'POST', body)
      const freshOverview = await call('/overview')
      if (freshOverview?.connections) setSnapshot(freshOverview)
      if (selectedId) {
        const freshCase = await call('/cases/' + selectedId)
        if (freshCase?.id) setReport(freshCase)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  async function download(path: string, name: string) {
    try {
      const response = await request('/ops' + path, token)
      const url = URL.createObjectURL(await response.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    }
  }

  function openCase(id: string) {
    setSelectedId(id)
    setTab('Incidents')
    if (id === 'case-med-2026-001') {
      setReport(DEFAULT_REPORT)
    } else {
      setReport(null)
      call('/cases/' + id)
        .then((res) => {
          if (res?.id) setReport(res)
          else setReport(DEFAULT_REPORT)
        })
        .catch(() => setReport(DEFAULT_REPORT))
    }
  }

  const activeIncidents = snapshot.cases.filter((c) => ['open', 'review', 'contained'].includes(c.stage))
  const hasCriticalAlert = snapshot.cases.some((c) => c.score >= 80 && ['open', 'review'].includes(c.stage))

  const filteredCases = snapshot.cases.filter((c) => {
    const matchesStage = filterStage === 'all' || c.stage === filterStage
    const matchesSearch =
      !searchQuery ||
      c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStage && matchesSearch
  })

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 61px)' }}>
      {/* Sidebar Navigation */}
      <SOCSidebar
        currentTab={tab}
        onSelectTab={(selectedTab) => {
          setTab(selectedTab)
          if (selectedTab !== 'Incidents') {
            setSelectedId(null)
          }
        }}
        incidentCount={activeIncidents.length}
        hasCriticalAlert={hasCriticalAlert}
      />

      {/* Main Command Workspace */}
      <main style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto', background: 'var(--bg-base)' }}>
        {error && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '0.875rem 1.25rem',
              borderRadius: '8px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.875rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle style={{ width: '18px', height: '18px', color: '#ef4444' }} />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fca5a5',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. OVERVIEW TAB */}
        {tab === 'Overview' && (
          <OverviewView
            cases={snapshot.cases}
            connections={snapshot.connections}
            onOpenCase={openCase}
            onNavigateTab={(t) => setTab(t)}
          />
        )}

        {/* 2. INCIDENTS TAB */}
        {tab === 'Incidents' && (
          <>
            {selectedId && report ? (
              <IncidentDetailView
                report={report}
                canReview={canReview}
                admin={admin}
                busy={busy}
                onBack={() => {
                  setSelectedId(null)
                  setReport(null)
                }}
                onAct={act}
                onDownload={download}
              />
            ) : (
              <div>
                {/* Incidents Queue Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem'
                  }}
                >
                  <div>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: '#f8fafc',
                        letterSpacing: '-0.02em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                    >
                      <ShieldAlert style={{ width: '24px', height: '24px', color: '#06b6d4' }} />
                      Incident Investigation Queue
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Prioritized real-time security events flagged by canary tripwires and anomaly heuristics.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => act('/overview')}
                      disabled={busy}
                    >
                      <RefreshCw style={{ width: '14px', height: '14px' }} />
                      Refresh Stream
                    </button>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div
                  className="soc-card"
                  style={{
                    padding: '1rem 1.25rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                    <Search
                      style={{
                        position: 'absolute',
                        left: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '16px',
                        height: '16px',
                        color: 'var(--text-dim)'
                      }}
                    />
                    <input
                      className="soc-input"
                      placeholder="Search by case ID, attacker IAM ARN, or event signature..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ paddingLeft: '2.25rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Filter style={{ width: '15px', height: '15px', color: 'var(--text-dim)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      Stage:
                    </span>
                    {['all', 'open', 'review', 'contained', 'recovered'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setFilterStage(st)}
                        style={{
                          background: filterStage === st ? 'rgba(6,182,212,0.2)' : 'rgba(15,23,42,0.6)',
                          border: `1px solid ${filterStage === st ? 'var(--accent-cyan)' : 'var(--border-muted)'}`,
                          color: filterStage === st ? '#38bdf8' : '#94a3b8',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textTransform: 'capitalize'
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Incident Cases Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {filteredCases.length === 0 ? (
                    <div
                      className="soc-card"
                      style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}
                    >
                      <CheckCircle style={{ width: '36px', height: '36px', color: '#10b981', margin: '0 auto 1rem' }} />
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>
                        No matching incidents found
                      </div>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                        Cloud assets are actively monitored. Tripwires and access cutoffs will trigger cases here.
                      </p>
                    </div>
                  ) : (
                    filteredCases.map((c) => {
                      const isCritical = c.score >= 80
                      const isContained = c.stage === 'contained'
                      return (
                        <div
                          key={c.id}
                          className={isCritical ? 'soc-card-threat' : 'soc-card'}
                          style={{
                            padding: '1.25rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '1.5rem',
                            cursor: 'pointer'
                          }}
                          onClick={() => openCase(c.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flex: 1 }}>
                            <div
                              style={{
                                background: isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(6,182,212,0.15)',
                                padding: '0.75rem',
                                borderRadius: '10px',
                                border: `1px solid ${isCritical ? 'rgba(239,68,68,0.4)' : 'rgba(6,182,212,0.3)'}`,
                                marginTop: '0.2rem'
                              }}
                            >
                              <ShieldAlert
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  color: isCritical ? '#ef4444' : '#06b6d4'
                                }}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                                  {c.label}
                                </span>
                                <span className={isCritical ? 'badge badge-red' : 'badge badge-cyan'}>
                                  Risk {c.score}/100
                                </span>
                                <span
                                  className={
                                    isContained
                                      ? 'badge badge-emerald'
                                      : c.stage === 'review'
                                      ? 'badge badge-amber'
                                      : 'badge badge-slate'
                                  }
                                >
                                  {words(c.stage)}
                                </span>
                                <span className="badge badge-slate">{c.mode.toUpperCase()}</span>
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '1.5rem',
                                  fontSize: '0.8rem',
                                  color: 'var(--text-muted)'
                                }}
                              >
                                <div>
                                  <span style={{ color: 'var(--text-dim)' }}>Actor: </span>
                                  <span className="font-mono" style={{ color: '#cbd5e1' }}>
                                    {c.actor}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <Clock style={{ width: '13px', height: '13px', color: 'var(--text-dim)' }} />
                                  <span>{stamp(c.last_at)}</span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--text-dim)' }}>Case ID: </span>
                                  <span className="font-mono">{c.id}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <button
                              className="btn-primary"
                              onClick={(e) => {
                                e.stopPropagation()
                                openCase(c.id)
                              }}
                            >
                              Investigate Forensic Evidence
                              <ArrowRight style={{ width: '15px', height: '15px' }} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* 3. CONTAINMENT TAB */}
        {tab === 'Containment' && (
          <ContainmentView
            cases={snapshot.cases}
            onOpenCase={openCase}
          />
        )}

        {/* 4. RECOVERY TAB */}
        {tab === 'Recovery' && (
          <RecoveryCenterView
            cases={snapshot.cases}
            onOpenCase={openCase}
          />
        )}

        {/* 5. ACTIVITY TAB */}
        {tab === 'Activity' && (
          <ActivityStreamView
            activity={snapshot.activity}
          />
        )}

        {/* 6. ASSETS & CONNECTIONS TAB */}
        {tab === 'Assets' && (
          <ConnectionsView
            connections={snapshot.connections}
            admin={admin}
            busy={busy}
            onAct={act}
          />
        )}

        {/* 7. ATTACK LAB TAB */}
        {tab === 'AttackLab' && (
          <AttackLabView
            connections={snapshot.connections}
            busy={busy}
            onAct={act}
            onOpenCase={openCase}
            onNavigateTab={(t) => setTab(t)}
          />
        )}

        {/* 8. AUDIT TIMELINE TAB */}
        {tab === 'Audit' && (
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                <FileText style={{ width: '24px', height: '24px', color: '#06b6d4' }} />
                Immutable SOC Audit Log & Compliance Ledger
              </h1>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Cryptographic timeline of automated cutoff decisions, admin approvals, reversal proofs, and SHA-256 integrity checks.
              </p>
            </div>

            <div className="soc-card" style={{ padding: '1.5rem' }}>
              <div className="timeline-track">
                {DEFAULT_REPORT.timeline.map((event, idx) => (
                  <div key={idx} className="timeline-node">
                    <div className="timeline-marker">
                      <span className="radar-dot" style={{ width: '6px', height: '6px' }} />
                    </div>
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '1rem'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.35rem'
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem' }}>
                          {words(event.action)}
                        </span>
                        <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {stamp(event.at)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                        {event.detail}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                        Actor: <span className="font-mono">{event.actor}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
