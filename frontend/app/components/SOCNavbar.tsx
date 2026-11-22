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
  Terminal
} from 'lucide-react'

interface NavbarProps {
  user: { email: string; role: string; customer: string }
  onLogout: () => void
  onToggleLanding: () => void
}

export default function SOCNavbar({ user, onLogout, onToggleLanding }: NavbarProps) {
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
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.875rem 1.75rem',
      background: 'rgba(10, 15, 29, 0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      {/* Brand & System Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.25), rgba(2,132,199,0.35))', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-accent)' }}>
            <Shield style={{ width: '20px', height: '20px', color: '#22d3ee' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.04em', color: '#f8fafc' }}>AEGIS</span>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>SOC CONSOLE</span>
            </div>
          </div>
        </div>

        <div style={{ height: '24px', width: '1px', background: 'var(--border-muted)' }} />

        {/* Live Radar Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
          <span className="radar-dot" />
          <span style={{ color: 'var(--text-muted)' }}>RADAR:</span>
          <span style={{ color: '#34d399', fontWeight: 600 }}>TELEMETRY STREAMING</span>
        </div>

        {/* Cloud Environment */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', padding: '0.25rem 0.65rem', background: 'rgba(15,23,42,0.7)', borderRadius: '6px', border: '1px solid var(--border-muted)' }}>
          <Server style={{ width: '13px', height: '13px', color: '#38bdf8' }} />
          <span style={{ color: 'var(--text-muted)' }}>AWS:</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }} className="font-mono">ap-south-1 (017080036675)</span>
        </div>
      </div>

      {/* Clock, User & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* UTC Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.75rem' }} className="font-mono">
          <Clock style={{ width: '13px', height: '13px', color: '#64748b' }} />
          <span>{time}</span>
        </div>

        {/* User Persona Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${roleBadgeClass}`}>
            <User style={{ width: '11px', height: '11px' }} />
            {user.role.toUpperCase()}
          </span>
          <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{user.email}</span>
        </div>

        {/* Navigation Action Buttons */}
        <button
          className="btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
          onClick={onToggleLanding}
          title="Return to Public Overview"
        >
          <ExternalLink style={{ width: '13px', height: '13px' }} />
          Product Overview
        </button>

        <button
          className="btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', color: '#f87171' }}
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
