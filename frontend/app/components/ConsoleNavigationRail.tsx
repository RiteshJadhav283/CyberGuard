'use client'

import React from 'react'
import {
  LayoutDashboard,
  Activity,
  GitCompare,
  ShieldAlert,
  Server
} from 'lucide-react'

export type TabKey = 'Overview' | 'Activity' | 'Comparison' | 'Incidents' | 'Connections'

interface NavigationRailProps {
  currentTab: TabKey
  onSelectTab: (tab: TabKey) => void
  incidentCount: number
  hasCriticalAlert: boolean
}

export default function ConsoleNavigationRail({
  currentTab,
  onSelectTab,
  incidentCount,
  hasCriticalAlert
}: NavigationRailProps) {
  const items: { key: TabKey; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }>; badge?: number; alert?: boolean }[] = [
    { key: 'Overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'Activity', label: 'Live Activity', icon: Activity },
    { key: 'Comparison', label: 'Comparison', icon: GitCompare },
    { key: 'Incidents', label: 'Incidents', icon: ShieldAlert, badge: incidentCount, alert: hasCriticalAlert },
    { key: 'Connections', label: 'Connections', icon: Server }
  ]

  return (
    <nav
      aria-label="Console Navigation"
      style={{
        width: '210px',
        minWidth: '210px',
        background: '#ffffff',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.25rem 0.75rem',
        height: 'calc(100vh - 61px)',
        position: 'sticky',
        top: '61px',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <div style={{
          padding: '0 0.75rem 0.5rem',
          fontSize: '0.6875rem',
          fontWeight: 700,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em'
        }}>
          Operations Rail
        </div>

        {items.map((item) => {
          const Icon = item.icon
          const isActive = currentTab === item.key

          return (
            <button
              key={item.key}
              onClick={() => onSelectTab(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.625rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? 'var(--bg-sub)' : 'transparent',
                color: isActive ? 'var(--brand-navy)' : 'var(--text-muted)',
                borderLeft: isActive ? '3px solid var(--brand-navy)' : '3px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 700 : 500
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Icon style={{ width: '16px', height: '16px', color: isActive ? 'var(--brand-navy)' : 'var(--text-dim)' }} />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.alert ? 'badge-red' : 'badge-cyan'}`} style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem' }}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cloud & Stream Telemetry Status Card */}
      <div className="soc-card-sub" style={{ padding: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Server style={{ width: '13px', height: '13px', color: 'var(--brand-navy)' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>AWS Bridge</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.25rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>CloudTrail:</span>
          <span style={{ color: 'var(--safe-emerald)', fontWeight: 600 }}>Active Stream</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Decoy Traps:</span>
          <span style={{ color: 'var(--text-main)', fontWeight: 600 }} className="font-mono">3 Armed</span>
        </div>
      </div>
    </nav>
  )
}
