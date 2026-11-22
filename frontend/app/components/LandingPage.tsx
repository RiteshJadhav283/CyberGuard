'use client'

import React from 'react'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  FileCheck,
  Server,
  Lock,
  ArrowRight,
  Database,
  Terminal,
  Cpu,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles
} from 'lucide-react'

interface LandingProps {
  onEnterConsole: (role?: string) => void
  onOpenLogin: () => void
}

export default function LandingPage({ onEnterConsole, onOpenLogin }: LandingProps) {
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 1.5rem 6rem' }}>
      {/* Top Banner Navigation */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(2,132,199,0.3))', padding: '0.5rem', borderRadius: '10px', border: '1px solid var(--border-accent)' }}>
            <Shield style={{ width: '24px', height: '24px', color: '#22d3ee' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: '#f8fafc' }}>AEGIS</span>
              <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>CYB-03 DEFENDER</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cloud Storage Ransomware Early-Warning Platform</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', background: 'rgba(15,23,42,0.6)', borderRadius: '9999px', border: '1px solid var(--border-muted)', fontSize: '0.75rem' }}>
            <span className="radar-dot" />
            <span style={{ color: 'var(--text-muted)' }}>AWS S3 Watcher:</span>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>Active</span>
          </div>
          <button className="btn-secondary" onClick={onOpenLogin}>
            Sign In
          </button>
          <button className="btn-primary" onClick={() => onEnterConsole('admin')}>
            Launch SOC Console <ArrowRight style={{ width: '16px', height: '16px' }} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ textAlign: 'center', padding: '5rem 1rem 3.5rem', position: 'relative' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.9rem', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '9999px', fontSize: '0.8rem', color: '#38bdf8', marginBottom: '1.5rem' }}>
          <Sparkles style={{ width: '14px', height: '14px' }} />
          <span>CYB-03 Hackathon: Next-Gen Autonomous Ransomware Defense</span>
        </div>

        <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4.25rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 auto 1.5rem', maxWidth: '980px', color: '#f8fafc' }}>
          Autonomous Early-Warning & Cutoff for <span style={{ background: 'linear-gradient(135deg, #22d3ee 0%, #38bdf8 50%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Cloud Storage Ransomware</span>
        </h1>

        <p style={{ fontSize: '1.15rem', color: '#94a3b8', maxWidth: '780px', margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
          Ransomware hits shared cloud drives at night. Within seconds, thousands of files are encrypted. 
          <strong> AEGIS</strong> plants decoy canaries, catches encryption bursts via cloud audit APIs, revokes compromised IAM access keys automatically, and restores clean version history in one click.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '3rem' }}>
          <button className="btn-primary" style={{ padding: '0.8rem 1.75rem', fontSize: '1rem' }} onClick={() => onEnterConsole('admin')}>
            Enter Live SOC Dashboard <ArrowRight style={{ width: '18px', height: '18px' }} />
          </button>
          <button className="btn-secondary" style={{ padding: '0.8rem 1.5rem', fontSize: '1rem' }} onClick={() => onEnterConsole('analyst')}>
            Investigate Active Incidents
          </button>
        </div>

        {/* Live Metrics Row */}
        <div className="soc-grid-kpi" style={{ maxWidth: '1050px', margin: '0 auto' }}>
          <div className="soc-card" style={{ padding: '1.25rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mean Time to Detect (MTTD)</span>
              <Activity style={{ width: '16px', height: '16px', color: '#38bdf8' }} />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8' }}>&lt; 3.0s</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Tripwire canary alert via SQS stream</div>
          </div>

          <div className="soc-card" style={{ padding: '1.25rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto-Containment Speed</span>
              <Lock style={{ width: '16px', height: '16px', color: '#f87171' }} />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f87171' }}>4.1s</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Attacker IAM Deny policy enforced</div>
          </div>

          <div className="soc-card" style={{ padding: '1.25rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blast Radius Reduction</span>
              <ShieldCheck style={{ width: '16px', height: '16px', color: '#34d399' }} />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399' }}>99.8%</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Files preserved vs total encryption</div>
          </div>

          <div className="soc-card" style={{ padding: '1.25rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>S3 Rollback Verification</span>
              <FileCheck style={{ width: '16px', height: '16px', color: '#a78bfa' }} />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa' }}>100%</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Per-object SHA-256 hash match</div>
          </div>
        </div>
      </section>

      {/* A/B Benchmark Contrast Section */}
      <section style={{ margin: '4rem 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span className="badge badge-amber" style={{ marginBottom: '0.75rem' }}>LIVE BENCHMARK PROOF</span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.5rem' }}>
            Side-by-Side Attack Comparison
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '650px', margin: '0 auto', fontSize: '0.95rem' }}>
            Tested on live AWS infrastructure: simulating identical mass-encryption ransomware against the unprotected baseline vs the AEGIS-protected environment.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {/* Environment A: Unprotected */}
          <div className="soc-card" style={{ padding: '2rem', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'linear-gradient(180deg, rgba(239,68,68,0.06) 0%, var(--bg-card) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <XCircle style={{ width: '20px', height: '20px', color: '#ef4444' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#fca5a5' }}>Environment A · Baseline</h3>
              </div>
              <span className="badge badge-red">Unprotected</span>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Standard AWS S3 setup without early-warning tripwires or automated IAM access cutoff.
            </p>

            <div style={{ display: 'grid', gap: '1rem', borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Early-Warning Alert:</span>
                <span style={{ color: '#f87171', fontWeight: 600 }}>❌ None (Silent Failure)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Detection Time:</span>
                <span style={{ color: '#f87171', fontWeight: 600 }}>❌ Next Morning (Hours later)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Attacker Access Key:</span>
                <span style={{ color: '#f87171', fontWeight: 600 }}>❌ Active until manual teardown</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Storage Blast Radius:</span>
                <span style={{ color: '#f87171', fontWeight: 700 }}>100% Encrypted / Lost</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Disaster Recovery:</span>
                <span style={{ color: '#f87171', fontWeight: 600 }}>Manual, days of downtime</span>
              </div>
            </div>
          </div>

          {/* Environment B: AEGIS Protected */}
          <div className="soc-card" style={{ padding: '2rem', border: '1px solid rgba(6,182,212,0.4)', background: 'linear-gradient(180deg, rgba(6,182,212,0.06) 0%, var(--bg-card) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 style={{ width: '20px', height: '20px', color: '#22d3ee' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#38bdf8' }}>Environment B · AEGIS Guarded</h3>
              </div>
              <span className="badge badge-cyan">Active Defense</span>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Protected with decoy canary tripwires, behavioral velocity scoring, and automated IAM containment.
            </p>

            <div style={{ display: 'grid', gap: '1rem', borderTop: '1px solid rgba(6,182,212,0.15)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Early-Warning Alert:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}> Canary Decoy Tripped (&lt;3s)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Detection Time:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}> Real-Time Ingest (EventBridge)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Attacker Access Key:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}> Revoked in 4.1s (IAM Deny)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Storage Blast Radius:</span>
                <span style={{ color: '#34d399', fontWeight: 700 }}>&lt; 0.2% (Attack Halts Cold)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Disaster Recovery:</span>
                <span style={{ color: '#34d399', fontWeight: 600 }}> 1-Click Rollback + SHA-256 Check</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Pillar Architecture Section */}
      <section style={{ margin: '4rem 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span className="badge badge-cyan" style={{ marginBottom: '0.75rem' }}>AUTONOMOUS DEFENSE LIFECYCLE</span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.5rem' }}>
            How AEGIS Neutralizes Cloud Ransomware
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '650px', margin: '0 auto', fontSize: '0.95rem' }}>
            Non-intrusive security placed beside your customer application. Zero code changes required in customer software.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
          <div className="soc-card" style={{ padding: '1.5rem' }}>
            <div style={{ background: 'rgba(6,182,212,0.1)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', border: '1px solid rgba(6,182,212,0.2)' }}>
              <span style={{ fontWeight: 800, color: '#38bdf8' }}>01</span>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>Plant Decoy Canaries</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Harmless bait files are placed across protected S3 prefixes. Normal medical services never touch them. When ransomware encrypts them, high-priority tripwires fire.
            </p>
          </div>

          <div className="soc-card" style={{ padding: '1.5rem' }}>
            <div style={{ background: 'rgba(245,158,11,0.1)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', border: '1px solid rgba(245,158,11,0.2)' }}>
              <span style={{ fontWeight: 800, color: '#fbbf24' }}>02</span>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>Velocity & Burst Scoring</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Real-time EventBridge/SQS stream analyzes overwrite frequency, unusual hours, and IntentGuard violations (e.g. a report-writer role suddenly deleting historical scans).
            </p>
          </div>

          <div className="soc-card" style={{ padding: '1.5rem' }}>
            <div style={{ background: 'rgba(239,68,68,0.1)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ fontWeight: 800, color: '#f87171' }}>03</span>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>Targeted Access Cutoff</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Instantly attaches an explicit AWS IAM Deny policy on the implicated role or STS session, revoking write capabilities in seconds without disrupting medical doctors.
            </p>
          </div>

          <div className="soc-card" style={{ padding: '1.5rem' }}>
            <div style={{ background: 'rgba(16,185,129,0.1)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span style={{ fontWeight: 800, color: '#34d399' }}>04</span>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>Verified Version Recovery</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Leverages Amazon S3 Object Versioning to find pre-attack clean versions. Restores to staging or in-place and validates SHA-256 checksums per file.
            </p>
          </div>
        </div>
      </section>

      {/* Demo Persona Quick Access Section */}
      <section style={{ margin: '4rem 0', background: 'linear-gradient(180deg, rgba(15,23,42,0.8) 0%, rgba(3,7,18,0.9) 100%)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '3rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span className="badge badge-emerald" style={{ marginBottom: '0.75rem' }}>1-CLICK DEMO PERSONAS</span>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.5rem' }}>
            Explore the Platform by Role
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto', fontSize: '0.95rem' }}>
            Click any role to enter the live Security Operations Center with pre-authenticated permissions:
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
          {/* Admin Persona */}
          <div className="soc-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span className="badge badge-red">Level 3 Access</span>
                <Lock style={{ width: '18px', height: '18px', color: '#f87171' }} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>SOC Administrator</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Full authority to preview and approve IAM access cutoff, execute S3 file recovery, and manage AWS account connections.
              </p>
            </div>
            <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }} onClick={() => onEnterConsole('admin')}>
              Enter as Administrator <ArrowRight style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {/* Analyst Persona */}
          <div className="soc-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span className="badge badge-cyan">Investigation</span>
                <Activity style={{ width: '18px', height: '18px', color: '#38bdf8' }} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>Security Analyst</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Investigate active incidents, inspect attack timelines, review Threat Scores, and correlate CloudTrail evidence.
              </p>
            </div>
            <button className="btn-secondary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }} onClick={() => onEnterConsole('analyst')}>
              Enter as Analyst <ArrowRight style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {/* Auditor Persona */}
          <div className="soc-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span className="badge badge-slate">Audit & Compliance</span>
                <FileCheck style={{ width: '18px', height: '18px', color: '#94a3b8' }} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem' }}>Compliance Auditor</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Read-only access to immutable audit timelines, SHA-256 recovery hashes, and exportable JSON forensic evidence.
              </p>
            </div>
            <button className="btn-secondary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }} onClick={() => onEnterConsole('viewer')}>
              Enter as Auditor <ArrowRight style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        <div>
          <span>AEGIS · Cyber Hackathon 2026</span>
          <span style={{ margin: '0 0.5rem' }}>•</span>
          <span>CYB-03 Cloud Storage Ransomware Defense</span>
        </div>
        <div>
          Protecting MediCore Hospital Environments on AWS ap-south-1
        </div>
      </footer>
    </div>
  )
}
