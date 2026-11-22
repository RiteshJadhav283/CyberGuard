'use client'

import React, { useState, useEffect } from 'react'
import {
  Shield,
  Clock,
  User,
  LogOut,
  ExternalLink,
  Radio,
  Server,
  Zap
} from 'lucide-react'

interface NavbarProps {
  user: { email: string; role: string; customer: string }
  onLogout: () => void
  onToggleLanding?: () => void
  isStale?: boolean
}

export default function SOCNavbar({ user, onLogout, onToggleLanding, isStale }: NavbarProps) {
  const [time, setTime] = useState('')

  useEffect(() => {
    function updateClock() {
      const now = new Date()
      setTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC')
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  const roleBadgeClass =
    user.role === 'admin' ? 'badge-red' :
    user.role === 'analyst' ? 'badge-cyan' : 'badge-slate'

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1.75rem',
        background: '#ffffff',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      {/* Brand & System Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.12), rgba(2, 132, 199, 0.18))',
              padding: '0.45rem',
              borderRadius: '8px',
              border: '1px solid rgba(2, 132, 199, 0.25)'
            }}
          >
            <Shield style={{ width: '20px', height: '20px', color: 'var(--brand-navy)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--brand-navy)' }}>
                AEGIS
              </span>
              <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 700 }}>
                RESPONSE CONSOLE
              </span>
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
              MediCore Enterprise Security Operations
            </div>
          </div>
        </div>

        <div style={{ height: '24px', width: '1px', background: 'var(--border-subtle)' }} />

        {/* Live Radar Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
          <span className={isStale ? 'radar-dot' : 'radar-dot-safe'} />
          <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>STATUS:</span>
          {isStale ? (
            <span style={{ color: '#b45309', fontWeight: 700 }}>STALE CACHE (OFFLINE)</span>
          ) : (
            <span style={{ color: '#15803d', fontWeight: 700 }}>STREAMING VERIFIED</span>
          )}
        </div>

        {/* Cloud Environment */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem',
            padding: '0.25rem 0.65rem',
            background: 'var(--bg-sub)',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <Server style={{ width: '13px', height: '13px', color: '#0284c7' }} />
          <span style={{ color: 'var(--text-dim)' }}>AWS:</span>
          <span style={{ color: 'var(--brand-navy)', fontWeight: 700 }} className="font-mono">
            ap-south-1 (017080036675)
          </span>
        </div>
      </div>

      {/* Clock, User & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* UTC Clock */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}
          className="font-mono"
        >
          <Clock style={{ width: '13px', height: '13px', color: 'var(--text-dim)' }} />
          <span>{time}</span>
        </div>

        {/* User Persona Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${roleBadgeClass}`}>
            <User style={{ width: '11px', height: '11px' }} />
            {user.role.toUpperCase()} (JUDGE)
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 600 }}>
            {user.email}
          </span>
        </div>

        {onToggleLanding && (
          <button
            className="btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            onClick={onToggleLanding}
            title="Return to Public Overview"
          >
            <ExternalLink style={{ width: '13px', height: '13px' }} />
            Public View
          </button>
        )}

        <button
          className="btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', color: '#dc2626' }}
          onClick={onLogout}
          title="Sign Out"
        >
          <LogOut style={{ width: '13px', height: '13px' }} />
          Exit
        </button>
      </div>
    </header>
  )
}
