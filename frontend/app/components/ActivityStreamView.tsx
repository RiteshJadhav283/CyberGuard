'use client'

import React, { useState } from 'react'
import { Activity, Search, Filter, Terminal, Shield, ArrowDownUp } from 'lucide-react'

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

interface ActivityProps {
  activity: Event[]
}

const stamp = (time: number) => time ? new Date(time * 1000).toLocaleString() : 'Just now'

export default function ActivityStreamView({ activity }: ActivityProps) {
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

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.25rem', color: '#f8fafc' }}>
            Live Storage Telemetry
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
            Real-time S3 PutObject, DeleteObject, and tripwire canary access events streaming from CloudTrail.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
          <span className="radar-dot" />
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>Streaming SQS Queue</span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="soc-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <Search style={{ width: '16px', height: '16px', color: '#64748b' }} />
          <input
            className="soc-input"
            style={{ width: '100%' }}
            placeholder="Search object key, IAM actor, or event ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['all', 'put', 'delete', 'canary'].map(op => (
            <button
              key={op}
              className={filterOp === op ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', textTransform: 'uppercase' }}
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
            <Activity style={{ width: '32px', height: '32px', color: '#64748b', margin: '0 auto 0.75rem' }} />
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0' }}>No Matching Telemetry Events</div>
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => {
                  const isCanary = e.object_key.includes('canary') || e.object_key.includes('.aegis-canaries')
                  const isDelete = e.operation.toLowerCase().includes('delete')

                  return (
                    <tr key={e.event_id || idx}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="font-mono" style={{ color: isCanary ? '#f87171' : '#f8fafc', fontWeight: isCanary ? 700 : 400 }}>
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
                        {e.source?.role_arn || e.actor}
                        {e.source?.session_arn && (
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
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
                      <td className="font-mono" style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {e.event_id}
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
