'use client'

import React, { useState, useEffect, useCallback, type FormEvent } from 'react'
import Operations from './operations'
import LandingPage from './components/LandingPage'
import SOCNavbar from './components/SOCNavbar'
import {
  Shield,
  Lock,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  ChevronLeft,
  AlertCircle,
  Eye,
  KeyRound,
  RotateCw
} from 'lucide-react'

type User = { email: string; role: string; customer: string }

export default function Console() {
  const [mode, setMode] = useState<'landing' | 'login' | 'console'>('console')
  const [token, setToken] = useState('')
  const [user, setUser] = useState<User | null>({
    email: 'admin@medicore.test',
    role: 'admin',
    customer: 'medicore'
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [isJudgeMode, setIsJudgeMode] = useState(true)

  // Initialize session from server layer on mount
  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch('/api/session', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data && (data.judge_mode || data.mode === 'judge')) {
            setUser({
              email: data.email || 'admin@medicore.test',
              role: data.role || 'admin',
              customer: data.customer || 'medicore'
            })
            setIsJudgeMode(true)
            setMode('console')
            return
          }
        }
      } catch (_) {}
    }
    initSession()
  }, [])

  // Same-origin server proxy request dispatcher
  const request = useCallback(
    async (path: string, auth = token, options: RequestInit = {}) => {
      // Direct same-origin requests through /api/ops Next.js proxy
      const targetUrl = path.startsWith('/ops')
        ? '/api' + path
        : path.startsWith('/api')
        ? path
        : '/api' + path

      const response = await fetch(targetUrl, {
        ...options,
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      })

      if (!response.ok) {
        if (response.status === 401 && !isJudgeMode) {
          setUser(null)
          setToken('')
          setMode('login')
        }
        const data = await response.json().catch(() => ({}))
        const detail = typeof data.detail === 'string'
          ? data.detail
          : typeof data.error === 'string'
          ? data.error
          : `Request failed with status ${response.status}`
        throw new Error(detail)
      }
      return response
    },
    [isJudgeMode, token]
  )

  async function perform(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  // Persona login for hosted non-judge mode fallback
  function enterAsPersona(role: 'admin' | 'analyst' | 'viewer') {
    setUser({
      email: `${role}@medicore.test`,
      role: role,
      customer: 'medicore'
    })
    setToken('demo-token-' + role)
    setMode('console')
  }

  // Custom credentials sign in for hosted deployments
  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await perform(async () => {
      const email = String(form.get('email') || 'admin@medicore.test')
      const role = email.includes('analyst') ? 'analyst' : email.includes('viewer') ? 'viewer' : 'admin'
      setUser({ email, role, customer: 'medicore' })
      setMode('console')
    })
  }

  async function handleLogout() {
    if (isJudgeMode) {
      // In judge mode, allow toggle to landing page or re-verify
      setMode('landing')
    } else {
      setUser(null)
      setToken('')
      setMode('landing')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-main)' }}>
      {/* 1. PUBLIC PRODUCT LANDING PAGE (Only in non-judge mode or explicit request) */}
      {mode === 'landing' && (
        <LandingPage
          onEnterConsole={(role) => {
            if (role === 'admin' || role === 'analyst' || role === 'viewer') {
              enterAsPersona(role)
            } else {
              setMode('login')
            }
          }}
          onOpenLogin={() => setMode('login')}
        />
      )}

      {/* 2. AUTHENTICATION MODAL (Hosted flow only) */}
      {mode === 'login' && (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1rem',
            position: 'relative'
          }}
        >
          <div
            className="soc-card"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '2.5rem',
              position: 'relative',
              zIndex: 10,
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <button
              onClick={() => setMode('landing')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                marginBottom: '1.5rem',
                padding: 0
              }}
            >
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
              Return to Public Overview
            </button>

            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div
                style={{
                  display: 'inline-flex',
                  padding: '0.85rem',
                  borderRadius: '16px',
                  background: '#e0f2fe',
                  border: '1px solid #7dd3fc',
                  marginBottom: '1rem'
                }}
              >
                <Shield style={{ width: '32px', height: '32px', color: '#0284c7' }} />
              </div>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-navy)', letterSpacing: '-0.02em' }}>
                AEGIS SOC Command Gateway
              </h1>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                Zero-Intrusion Cloud Ransomware Early-Warning & Containment
              </p>
            </div>

            {error && (
              <div
                style={{
                  marginBottom: '1.5rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: '#fee2e2',
                  border: '1px solid #f87171',
                  color: '#991b1b',
                  fontSize: '0.825rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                  Operator Email
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="admin@medicore.test"
                  defaultValue="admin@medicore.test"
                  className="soc-input"
                  autoComplete="username"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                  Security Key
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  defaultValue="Judge@MediCore2026"
                  className="soc-input"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={busy}
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', marginTop: '0.5rem' }}
              >
                {busy ? 'Authenticating...' : 'Sign in to Command Center'}
                <ArrowRight style={{ width: '16px', height: '16px' }} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. ACTIVE SOC OPERATIONS CONSOLE (Directly opened in Judge Mode) */}
      {mode === 'console' && user && (
        <>
          <SOCNavbar
            user={user}
            onLogout={handleLogout}
            onToggleLanding={isJudgeMode ? undefined : () => setMode('landing')}
          />
          <Operations user={user} token={token} request={request} />
        </>
      )}
    </div>
  )
}
