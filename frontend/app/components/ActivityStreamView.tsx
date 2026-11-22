'use client'

import React, { useState } from 'react'
import { Activity, Search, Filter, Terminal, Shield, ArrowDownUp, ExternalLink } from 'lucide-react'
import { EvidenceData } from './EvidenceDrawer'

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

interface ActivityProps {
  activity: Event[]
  isStale?: boolean
  onInspectEvent?: (ev: EvidenceData) => void
}

const stamp = (time: number) => time ? new Date(time * 1000).toLocaleString() : 'Just now'

export default function ActivityStreamView({ activity, isStale, onInspectEvent }: ActivityProps) {
  const [search, setSearch] = useState('')
  const [filterOp, setFilterOp] = useState<string>('all')

  const filtered = activity.filter(e => {
    const matchesSearch = 
      e.object_key.toLowerCase().includes(search.toLowerCase()) ||
      e.actor.toLowerCase().includes(search.toLowerCase()) ||
      e.event_id.toLowerCase().includes(search.toLowerCase())
    
    if (filterOp === 'all') return matchesSearch
    return matchesSearch && e.operation.toLowerCase().includes(filterOp.toLowerCase())
  })

  function handleRowClick(e: Event) {
    if (!onInspectEvent) return
    onInspectEvent({
      title: `CloudTrail Event · ${e.operation}`,
      sourceMode: e.mode || 'aws',
      eventTime: e.at,
      receiptTime: e.received,
      operation: e.operation,
      outcome: e.outcome,
      objectKey: e.object_key,
      versionId: e.source?.version_id,
      requestId: e.source?.request_id,
      cloudTrailEventId: e.event_id,
      roleArn: e.source?.role_arn || e.actor,
      sessionArn: e.source?.session_arn,
      bucket: 'medicore-aegis-demo-017080036675',
      recoveryBucket: 'medicore-aegis-demo-017080036675-recovery'
    })
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)', letterSpacing: '-0.02em' }}>
              Live Storage Telemetry
            </h1>
            {isStale && (
              <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                [STALE CACHE]
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Real-time S3 PutObject, DeleteObject, and tripwire canary access events streaming from CloudTrail. Click any row to inspect durable event provenance.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
          <span className="radar-dot-safe" />
          <span style={{ color: '#0284c7', fontWeight: 600 }}>Streaming SQS Queue Active</span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="soc-card" style={{ padding: '0.875rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <Search style={{ width: '16px', height: '16px', color: 'var(--text-dim)' }} />
          <input
            className="soc-input"
            style={{ width: '100%' }}
            placeholder="Search object key, IAM actor, or CloudTrail event ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['all', 'put', 'delete', 'canary'].map(op => (
            <button
              key={op}
              className={filterOp === op ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', textTransform: 'uppercase' }}
              onClick={() => setFilterOp(op)}
            >
              {op}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Table */}
      <div className="soc-card" style={{ padding: '1.25rem' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <Activity style={{ width: '32px', height: '32px', color: 'var(--text-dim)', margin: '0 auto 0.75rem' }} />
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>No Matching Telemetry Events</div>
            <p style={{ fontSize: '0.8rem', maxWidth: '350px', margin: '0.25rem auto 0' }}>
              Events arrive automatically when hospital reports or tripwire canaries are accessed in S3.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="soc-table">
              <thead>
                <tr>
                  <th>S3 Object Key</th>
                  <th>Operation & Outcome</th>
                  <th>Observed IAM Identity</th>
                  <th>Timestamp</th>
                  <th>Mode</th>
                  <th>CloudTrail Event ID</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => {
                  const isCanary = e.object_key.includes('canary') || e.object_key.includes('.aegis-canaries')
                  const isDelete = e.operation.toLowerCase().includes('delete')

                  return (
                    <tr
                      key={e.event_id || idx}
                      onClick={() => handleRowClick(e)}
                      style={{ cursor: onInspectEvent ? 'pointer' : 'default' }}
                      title="Click to inspect CloudTrail evidence in drawer"
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="font-mono" style={{ color: isCanary ? '#dc2626' : 'var(--text-main)', fontWeight: isCanary ? 700 : 500 }}>
                            {e.object_key}
                          </span>
                          {isCanary && <span className="badge badge-red" style={{ fontSize: '0.6rem' }}>CANARY</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${isDelete ? 'badge-red' : isCanary ? 'badge-amber' : 'badge-cyan'}`}>
                          {e.operation} · {e.outcome || 'success'}
                        </span>
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.75rem' }}>
                        <div>{e.source?.role_arn || e.actor}</div>
                        {e.source?.session_arn && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                            {e.source.session_arn}
                          </div>
                        )}
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.75rem' }}>
                        {stamp(e.at)}
                      </td>
                      <td>
                        <span className="badge badge-slate" style={{ fontSize: '0.65rem' }}>
                          {e.mode.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        {e.event_id}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: '#0284c7' }}>
                          Inspect <ExternalLink style={{ width: '12px', height: '12px' }} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
