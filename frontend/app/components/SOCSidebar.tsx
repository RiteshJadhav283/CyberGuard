'use client'

import React from 'react'
import {
  LayoutDashboard,
  ShieldAlert,
  Lock,
  RotateCcw,
  Activity,
  Database,
  Zap,
  FileText,
  ChevronRight,
  Server
} from 'lucide-react'

export type TabKey = 
  | 'Overview' 
  | 'Incidents' 
  | 'Containment' 
  | 'Recovery' 
  | 'Activity' 
  | 'Assets' 
  | 'AttackLab' 
  | 'Audit'

interface SidebarProps {
  currentTab: TabKey
  onSelectTab: (tab: TabKey) => void
  incidentCount: number
  hasCriticalAlert: boolean
}

export default function SOCSidebar({
  currentTab,
  onSelectTab,
  incidentCount,
  hasCriticalAlert
}: SidebarProps) {
  const navItems = [
    { key: 'Overview' as TabKey, label: 'Executive Overview', icon: LayoutDashboard },
    { key: 'Incidents' as TabKey, label: 'Incident Queue', icon: ShieldAlert, badge: incidentCount, alert: hasCriticalAlert },
    { key: 'Containment' as TabKey, label: 'Access Cutoff (IAM)', icon: Lock },
    { key: 'Recovery' as TabKey, label: 'S3 Version Recovery', icon: RotateCcw },
    { key: 'Activity' as TabKey, label: 'Live Telemetry Feed', icon: Activity },
    { key: 'Assets' as TabKey, label: 'Cloud Assets & Canaries', icon: Database },
    { key: 'AttackLab' as TabKey, label: 'Attack Simulation Lab', icon: Zap },
    { key: 'Audit' as TabKey, label: 'Forensic Audit Trail', icon: FileText }
  ]

  return (
    <aside style={{
      width: '260px',
      minWidth: '260px',
      background: 'rgba(10, 15, 29, 0.75)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '1.25rem 0.75rem',
      height: 'calc(100vh - 61px)',
      position: 'sticky',
      top: '61px'
    }}>
      {/* Navigation Items */}
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <div style={{ padding: '0 0.75rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          SOC Navigation
        </div>

        {navItems.map((item) => {
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
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? 'linear-gradient(90deg, rgba(6,182,212,0.15) 0%, rgba(6,182,212,0.05) 100%)' : 'transparent',
                color: isActive ? '#38bdf8' : '#cbd5e1',
                borderLeft: isActive ? '3px solid #06b6d4' : '3px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                fontSize: '0.825rem',
                fontWeight: isActive ? 600 : 500
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Icon style={{ width: '16px', height: '16px', color: isActive ? '#38bdf8' : '#94a3b8' }} />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.alert ? 'badge-red' : 'badge-cyan'}`} style={{ padding: '0.1rem 0.45rem', fontSize: '0.65rem' }}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cloud & Tripwire Health Status Card */}
      <div className="soc-card" style={{ padding: '0.85rem', background: 'rgba(15, 23, 42, 0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Server style={{ width: '14px', height: '14px', color: '#38bdf8' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f1f5f9' }}>Queue Telemetry</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Event Delivery:</span>
          <span style={{ color: '#34d399', fontWeight: 600 }}>SQS Reachable</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Canary Traps:</span>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>3 Active Probes</span>
        </div>
      </div>
    </aside>
  )
}
