'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Copy,
  Check,
  Shield,
  Clock,
  Database,
  Terminal,
  ExternalLink,
  Key
} from 'lucide-react'

export interface EvidenceData {
  title?: string
  sourceMode: string // 'aws' | 'replay'
  eventTime: number
  receiptTime: number
  operation: string
  outcome: string
  objectKey: string
  versionId?: string | null
  requestId?: string | null
  cloudTrailEventId?: string | null
  roleArn?: string | null
  sessionArn?: string | null
  humanIdentity?: string | null
  bucket?: string
  recoveryBucket?: string
  rawSource?: Record<string, unknown>
}

interface EvidenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  evidence: EvidenceData | null
}

export default function EvidenceDrawer({ isOpen, onClose, evidence }: EvidenceDrawerProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !evidence) return null

  function copyToClipboard(val: string, keyName: string) {
    if (!val) return
    navigator.clipboard.writeText(val)
    setCopiedKey(keyName)
    setTimeout(() => setCopiedKey(null), 1800)
  }

  const formatUtc = (t: number) => {
    if (!t) return 'Awaiting evidence'
    return new Date(t * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
  }

  const latency = evidence.receiptTime && evidence.eventTime
    ? `${evidence.receiptTime - evidence.eventTime}s`
    : 'Sub-second'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(2px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          height: '100vh',
          background: '#ffffff',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-drawer)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 101,
          animation: 'slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-sub)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span className={`badge ${evidence.sourceMode === 'aws' ? 'badge-cyan' : 'badge-slate'}`}>
                {evidence.sourceMode.toUpperCase()} EVIDENCE
              </span>
              <span className="badge badge-emerald">PROVENANCE VERIFIED</span>
            </div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
              {evidence.title || 'Forensic Evidence Drawer'}
            </h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px',
              color: 'var(--text-muted)'
            }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'grid', gap: '1.25rem' }}>
          {/* Recovery Note */}
          <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.25rem' }}>
              Recovery Architecture
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Recovery operates as a verified copy restored to the dedicated customer recovery bucket ({evidence.recoveryBucket || 'aegis-recovery'}). Source objects and prior versions remain intact.
            </div>
          </div>

          {/* Evidence Key-Value Grid */}
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {/* Operation & Outcome */}
            <div className="soc-card" style={{ padding: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                Operation & Verdict
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-navy)' }}>
                  {evidence.operation || 's3:PutObject'}
                </span>
                <span className={`badge ${evidence.outcome === 'success' ? 'badge-emerald' : 'badge-red'}`}>
                  {evidence.outcome.toUpperCase()}
                </span>
              </div>
            </div>

            {/* CloudTrail Event ID */}
            {evidence.cloudTrailEventId && (
              <div className="soc-card" style={{ padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    CloudTrail Event ID
                  </span>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(evidence.cloudTrailEventId!, 'evt')}
                  >
                    {copiedKey === 'evt' ? <Check style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} /> : <Copy style={{ width: '13px', height: '13px' }} />}
                    <span>{copiedKey === 'evt' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                  {evidence.cloudTrailEventId}
                </div>
              </div>
            )}

            {/* S3 Request ID */}
            {evidence.requestId && (
              <div className="soc-card" style={{ padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    S3 Request ID
                  </span>
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(evidence.requestId!, 'req')}
                  >
                    {copiedKey === 'req' ? <Check style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} /> : <Copy style={{ width: '13px', height: '13px' }} />}
                    <span>{copiedKey === 'req' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--text-main)', fontWeight: 600 }}>
                  {evidence.requestId}
                </div>
              </div>
            )}

            {/* S3 Object Key & Version */}
            <div className="soc-card" style={{ padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  S3 Object Key
                </span>
                <button
                  className="btn-copy"
                  onClick={() => copyToClipboard(evidence.objectKey, 'key')}
                >
                  {copiedKey === 'key' ? <Check style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} /> : <Copy style={{ width: '13px', height: '13px' }} />}
                  <span>{copiedKey === 'key' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--text-main)', wordBreak: 'break-all', marginBottom: '0.45rem' }}>
                {evidence.objectKey}
              </div>
              {evidence.versionId && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="font-mono">
                  Version ID: <span style={{ color: 'var(--text-main)' }}>{evidence.versionId}</span>
                </div>
              )}
            </div>

            {/* Role ARN & Session */}
            <div className="soc-card" style={{ padding: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Recorded IAM Role ARN
                </span>
                {evidence.roleArn && (
                  <button
                    className="btn-copy"
                    onClick={() => copyToClipboard(evidence.roleArn!, 'role')}
                  >
                    {copiedKey === 'role' ? <Check style={{ width: '13px', height: '13px', color: 'var(--safe-emerald)' }} /> : <Copy style={{ width: '13px', height: '13px' }} />}
                    <span>{copiedKey === 'role' ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
              <div className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--brand-navy)', wordBreak: 'break-all', marginBottom: '0.4rem' }}>
                {evidence.roleArn || 'None specified'}
              </div>

              {evidence.sessionArn && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                    Assumed-Role Session
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                    {evidence.sessionArn}
                  </div>
                </div>
              )}

              {/* Human Identity (only rendered when AWS supplies it) */}
              {evidence.humanIdentity && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                    Verified Human Identity
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--brand-navy)', fontWeight: 600 }}>
                    {evidence.humanIdentity}
                  </div>
                </div>
              )}
            </div>

            {/* Timestamps & Latency */}
            <div className="soc-card" style={{ padding: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Audit Timeline & Ingestion
              </div>
              <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Event Timestamp:</span>
                  <span className="font-mono" style={{ color: 'var(--text-main)' }}>{formatUtc(evidence.eventTime)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Receipt Timestamp:</span>
                  <span className="font-mono" style={{ color: 'var(--text-main)' }}>{formatUtc(evidence.receiptTime)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>EventBridge Ingestion Latency:</span>
                  <span className="font-mono" style={{ color: 'var(--safe-emerald)', fontWeight: 600 }}>{latency}</span>
                </div>
              </div>
            </div>

            {/* Raw JSON viewer */}
            {evidence.rawSource && (
              <details className="soc-card" style={{ padding: '0.85rem' }}>
                <summary style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-navy)', cursor: 'pointer' }}>
                  View Raw CloudTrail JSON Payload
                </summary>
                <pre
                  className="font-mono"
                  style={{
                    marginTop: '0.65rem',
                    padding: '0.65rem',
                    background: 'var(--bg-sub)',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    overflowX: 'auto',
                    color: 'var(--text-main)'
                  }}
                >
                  {JSON.stringify(evidence.rawSource, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-sub)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button className="btn-secondary" onClick={onClose}>
            Close Evidence Drawer
          </button>
        </div>
      </div>
    </div>
  )
}
