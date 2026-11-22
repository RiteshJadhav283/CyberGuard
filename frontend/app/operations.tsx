'use client'

import React, { useCallback, useEffect, useState } from 'react'
import ConsoleNavigationRail, { TabKey } from './components/ConsoleNavigationRail'
import OverviewJudgeView from './components/OverviewJudgeView'
import IncidentDetailView from './components/IncidentDetailView'
import ComparisonExerciseView from './components/ComparisonExerciseView'
import ActivityStreamView from './components/ActivityStreamView'
import AttackLabView from './components/AttackLabView'
import ConnectionsView from './components/ConnectionsView'
import EvidenceDrawer, { EvidenceData } from './components/EvidenceDrawer'
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
  FileText,
  AlertTriangle,
  Server
} from 'lucide-react'

type User = { role: string; customer: string; email?: string }
type ReadCheck = { object_key: string; requested_at: number; event_id: string | null }
type Canary = { object_key: string; status: string; trusted_version_id: string | null; sha256?: string | null }
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
  read_monitoring?: { status: string; checks: ReadCheck[] }
  slack_configured?: boolean
  jira_configured?: boolean
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
  source: {
    role_arn?: string
    session_arn?: string
    request_id?: string
    version_id?: string
    source_ip?: string
  }
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
  first_at?: number
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

export default function Operations({ user, token, request }: Props) {
  const [tab, setTab] = useState<TabKey>('Overview')
  const [snapshot, setSnapshot] = useState<Snapshot>({
    connections: [],
    cases: [],
    activity: []
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [isBackendDown, setIsBackendDown] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [filterStage, setFilterStage] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Evidence Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [inspectedEvidence, setInspectedEvidence] = useState<EvidenceData | null>(null)

  // URL exercise persistence
  const [initialExerciseId, setInitialExerciseId] = useState<string | undefined>(undefined)

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

  // Sync URL parameters on initial load (?case={id}, ?exercise={uuid}, ?tab={tab})
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const caseParam = params.get('case')
    const exerciseParam = params.get('exercise')
    const tabParam = params.get('tab') as TabKey | null

    if (caseParam) {
      setSelectedId(caseParam)
      setTab('Incidents')
    } else if (exerciseParam) {
      setInitialExerciseId(exerciseParam)
      setTab('Comparison')
    } else if (tabParam && ['Overview', 'Activity', 'AttackLab', 'Comparison', 'Incidents', 'Connections'].includes(tabParam)) {
      setTab(tabParam)
    }
  }, [])

  // Poll overview and active report
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let refreshing = false

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
          if (overviewRes.status === 'fulfilled' && overviewRes.value && overviewRes.value.connections) {
            setSnapshot(overviewRes.value)
            setIsBackendDown(false)
            setLastSyncTime(Math.floor(Date.now() / 1000))
          } else if (overviewRes.status === 'rejected') {
            setIsBackendDown(true)
          }

          if (detailRes.status === 'fulfilled' && detailRes.value && detailRes.value.id) {
            setReport(detailRes.value)
          }
          setLoaded(true)
        }
      } catch (e) {
        if (active) {
          setIsBackendDown(true)
          setLoaded(true)
        }
      }
      refreshing = false
      if (active) {
        timer = setTimeout(refresh, 4000)
      }
    }

    refresh()

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [call, selectedId])

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
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    }
  }

  function openCase(id: string) {
    setSelectedId(id)
    setTab('Incidents')
    setReport(null)

    // Update URL query param ?case={id}
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('case', id)
      url.searchParams.delete('exercise')
      window.history.pushState({}, '', url.toString())
    }

    call('/cases/' + id)
      .then((res) => {
        if (res?.id) setReport(res)
      })
      .catch((e) => {
        setError(`Failed to load case ${id}: ${e.message}`)
      })
  }

  function closeCase() {
    setSelectedId(null)
    setReport(null)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('case')
      window.history.pushState({}, '', url.toString())
    }
  }

  function handleTabSelect(newTab: TabKey) {
    setTab(newTab)
    if (newTab !== 'Incidents') {
      setSelectedId(null)
      setReport(null)
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', newTab)
      if (newTab !== 'Incidents') url.searchParams.delete('case')
      window.history.pushState({}, '', url.toString())
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

  // Has stale cache when backend is down but previous snapshot exists
  const hasStaleCache = isBackendDown && snapshot.connections.length > 0

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 61px)', background: 'var(--bg-base)' }}>
      {/* 5-Item Operations Navigation Rail */}
      <ConsoleNavigationRail
        currentTab={tab}
        onSelectTab={handleTabSelect}
        incidentCount={activeIncidents.length}
        hasCriticalAlert={hasCriticalAlert}
      />

      {/* Main Command Workspace */}
      <main style={{ flex: 1, padding: '1.5rem 2.25rem', overflowY: 'auto' }}>
        {/* Backend Down / Stale Cache Alert Banner */}
        {isBackendDown && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              color: '#92400e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertTriangle style={{ width: '20px', height: '20px', color: '#b45309', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  {hasStaleCache
                    ? `[STALE CACHE ACTIVE] Aegis Telemetry Reconnecting — Showing Cached Evidence from ${lastSyncTime ? new Date(lastSyncTime * 1000).toLocaleTimeString() : 'Previous Sync'}`
                    : 'Aegis Core Telemetry Stream Reconnecting'}
                </div>
                <div style={{ fontSize: '0.8125rem', marginTop: '0.2rem', color: '#78350f' }}>
                  Reconnecting to Aegis telemetry bridge. Real MediCore AWS CloudTrail stream will resume automatically.
                </div>
              </div>
            </div>
            <button
              onClick={() => call('/overview').then((res) => { if (res?.connections) { setSnapshot(res); setIsBackendDown(false); } })}
              className="btn-secondary"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', borderColor: '#d97706', color: '#92400e' }}
            >
              <RefreshCw style={{ width: '13px', height: '13px' }} />
              Retry Connection
            </button>
          </div>
        )}

        {/* Global Error Notice */}
        {error && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '0.875rem 1.25rem',
              borderRadius: '8px',
              background: '#fee2e2',
              border: '1px solid #f87171',
              color: '#991b1b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.875rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle style={{ width: '18px', height: '18px', color: '#dc2626' }} />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#991b1b',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. OVERVIEW TAB (60-sec sequence, probe matrix, timeline, quick jump) */}
        {tab === 'Overview' && (
          <OverviewJudgeView
            cases={snapshot.cases}
            connections={snapshot.connections}
            activity={snapshot.activity}
            onOpenCase={openCase}
            onNavigateTab={handleTabSelect}
            onInspectEvidence={(ev) => {
              setInspectedEvidence(ev)
              setIsDrawerOpen(true)
            }}
          />
        )}

        {/* 2. ACTIVITY TAB (CloudTrail telemetry stream) */}
        {tab === 'Activity' && (
          <ActivityStreamView
            activity={snapshot.activity}
            isStale={hasStaleCache}
            onInspectEvent={(ev) => {
              setInspectedEvidence(ev)
              setIsDrawerOpen(true)
            }}
          />
        )}

        {/* 3. ATTACK LAB TAB (Dual AWS backend attack simulation & PDF recovery) */}
        {tab === 'AttackLab' && (
          <AttackLabView
            connections={snapshot.connections}
            busy={busy}
            onAct={async (p, b) => { await call(p, 'POST', b) }}
            onOpenCase={openCase}
            onNavigateTab={(t) => setTab(t)}
          />
        )}

        {/* 4. COMPARISON TAB (Dual Replay Lanes Bench) */}
        {tab === 'Comparison' && (
          <ComparisonExerciseView
            initialExerciseId={initialExerciseId}
            onOpenCase={openCase}
            request={(path, options) => request('/ops' + path, token, options)}
          />
        )}

        {/* 4. INCIDENTS TAB (Deep Investigation & Case List) */}
        {tab === 'Incidents' && (
          <>
            {selectedId && report ? (
              <IncidentDetailView
                report={report}
                canReview={canReview}
                admin={admin}
                busy={busy}
                onBack={closeCase}
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
                        fontWeight: 800,
                        color: 'var(--brand-navy)',
                        letterSpacing: '-0.02em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                    >
                      <ShieldAlert style={{ width: '24px', height: '24px', color: '#0284c7' }} />
                      Incident Investigation Queue
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Prioritized real-time security events flagged by canary tripwires and anomaly heuristics.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => call('/overview').then((res) => { if (res?.connections) setSnapshot(res) })}
                      disabled={busy}
                    >
                      <RefreshCw style={{ width: '14px', height: '14px' }} />
                      Refresh Incidents
                    </button>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div
                  className="soc-card"
                  style={{
                    padding: '0.875rem 1.25rem',
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Stage:
                    </span>
                    {['all', 'open', 'review', 'contained', 'reversed', 'recovered'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setFilterStage(st)}
                        style={{
                          background: filterStage === st ? 'var(--brand-navy)' : 'var(--bg-sub)',
                          border: `1px solid ${filterStage === st ? 'var(--brand-navy)' : 'var(--border-subtle)'}`,
                          color: filterStage === st ? '#ffffff' : 'var(--text-muted)',
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
                      <CheckCircle style={{ width: '36px', height: '36px', color: '#15803d', margin: '0 auto 1rem' }} />
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-navy)' }}>
                        {snapshot.cases.length === 0 ? 'Awaiting Incident Detection' : 'No matching incidents found'}
                      </div>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                        Tripwire canaries and access cutoffs will trigger cases here as CloudTrail events arrive.
                      </p>
                    </div>
                  ) : (
                    filteredCases.map((c) => {
                      const isCritical = c.score >= 80
                      const isContained = c.stage === 'contained' || c.stage === 'reversed'
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
                                background: isCritical ? '#fee2e2' : '#e0f2fe',
                                padding: '0.75rem',
                                borderRadius: '10px',
                                border: `1px solid ${isCritical ? '#fca5a5' : '#7dd3fc'}`,
                                marginTop: '0.2rem'
                              }}
                            >
                              <ShieldAlert
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  color: isCritical ? '#dc2626' : '#0284c7'
                                }}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-navy)' }}>
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
                                  <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Actor: </span>
                                  <span className="font-mono" style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                                    {c.actor}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <Clock style={{ width: '13px', height: '13px', color: 'var(--text-dim)' }} />
                                  <span>{stamp(c.last_at)}</span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Case ID: </span>
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

        {/* 5. CONNECTIONS TAB (Registered MediCore AWS Storage Asset) */}
        {tab === 'Connections' && (
          <ConnectionsView
            connections={snapshot.connections}
            admin={admin}
            busy={busy}
            isStale={hasStaleCache}
            onAct={act}
          />
        )}
      </main>

      {/* Forensic Slide-Out Evidence Drawer */}
      <EvidenceDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        evidence={inspectedEvidence}
      />
    </div>
  )
}
