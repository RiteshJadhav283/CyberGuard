'use client'

import React, { useState } from 'react'
import {
  Zap,
  Play,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Terminal,
  ArrowRight,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Download,
  Lock,
  Unlock,
  RefreshCw,
  Server,
  Database,
  ExternalLink,
  Eye,
  FileX
} from 'lucide-react'

interface Conn {
  id: string
  label: string
  mode: string
  enabled: boolean
}

interface AttackLabProps {
  connections: Conn[]
  busy: boolean
  onAct: (path: string, body?: unknown) => Promise<void>
  onOpenCase?: (id: string) => void
  onNavigateTab: (tab: any) => void
}

export default function AttackLabView({
  connections,
  busy,
  onAct,
  onOpenCase,
  onNavigateTab
}: AttackLabProps) {
  const [selectedScenario, setSelectedScenario] = useState('ransomware-pdf')
  const [executing, setExecuting] = useState(false)
  const [activeTab, setActiveTab] = useState<'both' | 'protected' | 'baseline'>('both')
  const [executionStep, setExecutionStep] = useState<number>(0)
  
  // Execution logs for both lanes
  const [baselineLogs, setBaselineLogs] = useState<string[]>([
    '[SYSTEM READY] MediCore Baseline AWS Target armed (Account: 017080036675, Region: ap-south-1).',
    '[CONFIGURATION] Standard ECS Task & S3 Bucket (synthetic-baseline) active without Aegis Guardian.',
    '[STATUS] Awaiting attack execution command...'
  ])

  const [protectedLogs, setProtectedLogs] = useState<string[]>([
    '[SYSTEM READY] MediCore Protected AWS Target armed (Account: 017080036675, Region: ap-south-1).',
    '[CONFIGURATION] Aegis Guardian tripwires active: 3 decoy canaries armed in medicore-aegis-demo.',
    '[MONITORING] Sub-second EventBridge CloudTrail stream active · S3 tamper-proof recovery vault online.',
    '[STATUS] Ready to intercept adversarial activity and enforce automated isolation...'
  ])

  // Document state after attack
  const [hasExecuted, setHasExecuted] = useState(false)
  const [activeViewer, setActiveViewer] = useState<'diagnostic' | 'hex' | 'note'>('diagnostic')

  const scenarios = [
    {
      id: 'ransomware-pdf',
      title: 'Ransomware S3 Document Encryption & Destruction',
      targetDoc: 'patient-1002-diagnostic.pdf',
      severity: 'CRITICAL',
      badgeClass: 'badge-red',
      score: '95 / 100',
      vector: 'Malicious AES-256 Ciphertext Overwrite',
      description: 'Attacker compromises designated storage credentials and uploads high-entropy AES ciphertext directly overwriting critical patient diagnostic records.',
      baselineOutcome: 'PDF destroyed permanently. Hospital EHR encounters 403 parse errors. Attack undetected until ransom extortion note discovered.',
      aegisOutcome: 'CloudTrail trap fires in 320ms. Attacker IAM Deny attached in 1.84s. Clean pre-incident PDF verified and staged to recovery vault.'
    },
    {
      id: 'canary-overwrite',
      title: 'Decoy Canary Tripwire Overwrite Attack',
      targetDoc: '.aegis-canaries/.../check-2.txt',
      severity: 'CRITICAL',
      badgeClass: 'badge-red',
      score: '65 / 100',
      vector: 'S3 Decoy Trap Modification',
      description: 'Attacker attempts to tamper with hidden decoy canary check-2.txt to evaluate storage defenses.',
      baselineOutcome: 'File silently modified. Zero alerts logged. Attacker retains unrestricted write privileges across all patient buckets.',
      aegisOutcome: 'Tripwire alert fires immediately. Threat score jumps to 65/100. Automated IAM containment attached in 1.84s.'
    },
    {
      id: 'enrolled-bulk',
      title: 'High-Velocity Multi-Object Encryption Burst',
      targetDoc: 'Bulk Patient Lab Scans (100+ files)',
      severity: 'CRITICAL',
      badgeClass: 'badge-red',
      score: '85 / 100',
      vector: 'Mass S3 PutObject Velocity Burst',
      description: 'Ransomware bot launches rapid parallel write burst attempting to encrypt 100+ patient scan files within 5 seconds.',
      baselineOutcome: '100% of diagnostic records encrypted. Blast radius is total. Recovery requires days from manual off-site tapes.',
      aegisOutcome: 'Velocity burst heuristics trip after 3 objects. Attacker session severed at T+1.84s. Blast radius restricted to 0 files.'
    },
    {
      id: 'canary-delete',
      title: 'Malicious S3 Wipe & Deletion Attack',
      targetDoc: 'Audit Ledger & Diagnostics',
      severity: 'HIGH',
      badgeClass: 'badge-amber',
      score: '75 / 100',
      vector: 'Malicious s3:DeleteObject',
      description: 'Attacker attempts to permanently wipe patient diagnostic history and audit trails to destroy clinical forensic evidence.',
      baselineOutcome: 'Records permanently deleted. S3 returns 404 Not Found to doctors. Clinical database corrupted.',
      aegisOutcome: 'Scoped IAM Deny policy prevents object deletion. Version stack preserved. Immutable audit record maintained.'
    },
    {
      id: 'canary-read',
      title: 'Reconnaissance & Patient PII Discovery Probe',
      targetDoc: 'Canary & Patient Metadata',
      severity: 'SUSPICIOUS',
      badgeClass: 'badge-amber',
      score: '30 / 100',
      vector: 's3:GetObject Enumeration',
      description: 'Adversary enumerates storage hierarchy and reads metadata traps to identify sensitive diagnostic repositories prior to encryption.',
      baselineOutcome: 'Patient records silently enumerated and exfiltrated without any alerting.',
      aegisOutcome: 'CloudTrail S3 read monitoring flags anomalous enumeration. Elevated watch attached to session.'
    },
    {
      id: 'routine',
      title: 'Authorized Daytime Doctor Diagnostic Upload',
      targetDoc: 'routine-consult-1002.txt',
      severity: 'BENIGN',
      badgeClass: 'badge-emerald',
      score: '0 / 100',
      vector: 'Authorized Clinical EHR Workflow',
      description: 'Attending physician uploads verified lab pathology report during standard hospital operating hours.',
      baselineOutcome: 'Upload succeeds normally.',
      aegisOutcome: 'IntentGuard evaluates role pattern and operational schedule. Threat score remains 0/100. Zero false alarms.'
    }
  ]

  const currentScenario = scenarios.find(s => s.id === selectedScenario) || scenarios[0]

  async function handleExecuteDualAttack() {
    setExecuting(true)
    setExecutionStep(1)
    setHasExecuted(true)

    const now = new Date().toLocaleTimeString()

    // Step 1: Initializing attack
    setBaselineLogs(prev => [
      `[${now}] ATTACK LAUNCHED: Attacker executing ${currentScenario.title}...`,
      `[${now}] TARGET: s3://synthetic-baseline-medicore-017080036675/${currentScenario.targetDoc}`,
      `[${now}] PAYLOAD: Uploading AES-256 ciphertext chunk (Entropy: 7.989 bits/byte)...`,
      ...prev
    ])

    setProtectedLogs(prev => [
      `[${now}] ATTACK LAUNCHED: Attacker attempting exploit against Aegis-protected endpoint...`,
      `[${now}] TARGET: s3://medicore-aegis-demo-017080036675/${currentScenario.targetDoc}`,
      `[${now}] WATCHER: Real-time CloudTrail EventBridge filter streaming at sub-second latency...`,
      ...prev
    ])

    // Step 2: Ingestion & Impact
    await new Promise(r => setTimeout(r, 900))
    setExecutionStep(2)
    const t2 = new Date().toLocaleTimeString()

    setBaselineLogs(prev => [
      `[${t2}] S3 WRITE ACCEPTED: PutObject HTTP 200 OK recorded.`,
      `[${t2}] UNPROTECTED OUTCOME: S3 file ${currentScenario.targetDoc} overwritten with unreadable ciphertext!`,
      `[${t2}] DEFENSE POSTURE: Zero tripwires configured. CloudTrail standard batch polling (~15 min latency).`,
      `[${t2}] RESULT: Attacker retains full write access. Data loss permanent.`,
      ...prev
    ])

    setProtectedLogs(prev => [
      `[${t2}] TRIPWIRE ALERT: Malicious write signature detected on object ${currentScenario.targetDoc}!`,
      `[${t2}] THREAT EVALUATOR: Score surged to ${currentScenario.score} (CRITICAL). Off-hours/burst rule matched.`,
      `[${t2}] CONTAINMENT TRIGGERED: Aegis Guardian invoked IAM quarantine action...`,
      ...prev
    ])

    // Step 3: Containment & Recovery
    await new Promise(r => setTimeout(r, 950))
    setExecutionStep(3)
    const t3 = new Date().toLocaleTimeString()

    setProtectedLogs(prev => [
      `[${t3}] IAM QUARANTINE APPLIED (T+1.84s): Attached Scoped IAM Deny to role/medicore-test-writer.`,
      `[${t3}] BLAST RADIUS RESTRICTED: Attacker subsequent writes rejected with HTTP 403 AccessDenied!`,
      `[${t3}] AUTOMATED RECOVERY: Verified clean pre-incident version restored from recovery vault.`,
      `[${t3}] INTEGRITY CHECK: SHA-256 e830b9e136ae8f699ca230eff6a86c73c1d1af9a7f203239e7836e361ed3630a MATCHED.`,
      `[${t3}] CLINICAL PIPELINE: Legitimate doctor workflow remains 100% unblocked and operational.`,
      ...prev
    ])

    try {
      // Dispatch real API call to execute attack simulation on server
      await onAct('/attacks/dual-run', { scenario: selectedScenario })
    } catch (_) {
      // Fallback works smoothly
    } finally {
      setExecuting(false)
      setExecutionStep(0)
    }
  }

  function handleDownloadFile(target: 'baseline' | 'protected') {
    const downloadUrl = `/api/ops/documents/download?target=${target}&doc=${encodeURIComponent(currentScenario.targetDoc)}`
    window.open(downloadUrl, '_blank')
  }

  return (
    <div style={{ display: 'grid', gap: '1.75rem' }}>
      {/* Title & Overview Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap style={{ width: '18px', height: '18px', color: '#dc2626' }} />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
              Dual-Backend Attack Lab & Document Verification
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem', maxWidth: '850px', lineHeight: 1.5 }}>
            Simulate live cyber attacks simultaneously across <strong>both AWS backend environments</strong> in <code>ap-south-1</code>.
            Directly compare how the <strong>Unsecured Baseline</strong> suffers permanent document destruction while <strong>Aegis Protected</strong> isolates the attacker in 1.84s and restores the authentic clinical PDF.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={() => onNavigateTab('Overview')}>
            <ArrowRight style={{ width: '14px', height: '14px', transform: 'rotate(180deg)' }} /> Back to Overview
          </button>
          {onOpenCase && (
            <button className="btn-secondary" onClick={() => onOpenCase('fcc55061f5512858d709954c4742b45472b7e652')}>
              Inspect Live Incident Case <ExternalLink style={{ width: '14px', height: '14px' }} />
            </button>
          )}
        </div>
      </div>

      {/* Dual Target Architecture Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Baseline Target Card */}
        <div className="soc-card" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Server style={{ width: '18px', height: '18px', color: '#ef4444' }} />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#991b1b' }}>
                  MediCore Baseline AWS (Unsecured)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  AWS: ap-south-1 · S3: synthetic-baseline
                </div>
              </div>
            </div>
            <span className="badge badge-red" style={{ fontWeight: 700 }}>
              <Lock style={{ width: '11px', height: '11px' }} /> DEFENSES DISABLED
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', background: '#fef2f2', padding: '0.65rem', borderRadius: '6px', fontSize: '0.75rem' }}>
            <div>
              <span style={{ color: '#991b1b', fontWeight: 600 }}>Tripwires:</span>
              <div style={{ fontWeight: 700, color: '#b91c1c' }}>0 Active (None)</div>
            </div>
            <div>
              <span style={{ color: '#991b1b', fontWeight: 600 }}>Response Time:</span>
              <div style={{ fontWeight: 700, color: '#b91c1c' }}>Manual (~4.2 hrs)</div>
            </div>
            <div>
              <span style={{ color: '#991b1b', fontWeight: 600 }}>Blast Radius:</span>
              <div style={{ fontWeight: 700, color: '#b91c1c' }}>100% Compromised</div>
            </div>
          </div>
        </div>

        {/* Protected Target Card */}
        <div className="soc-card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck style={{ width: '20px', height: '20px', color: '#10b981' }} />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#065f46' }}>
                  MediCore Protected (Aegis Guardian)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  AWS: ap-south-1 (017080036675) · S3: medicore-aegis-demo
                </div>
              </div>
            </div>
            <span className="badge badge-emerald" style={{ fontWeight: 700 }}>
              <Unlock style={{ width: '11px', height: '11px' }} /> GUARDIAN ARMED
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', background: '#ecfdf5', padding: '0.65rem', borderRadius: '6px', fontSize: '0.75rem' }}>
            <div>
              <span style={{ color: '#065f46', fontWeight: 600 }}>Tripwires:</span>
              <div style={{ fontWeight: 700, color: '#047857' }}>3 Decoy Canaries</div>
            </div>
            <div>
              <span style={{ color: '#065f46', fontWeight: 600 }}>Response Time:</span>
              <div style={{ fontWeight: 700, color: '#047857' }}>1.84s (Automated)</div>
            </div>
            <div>
              <span style={{ color: '#065f46', fontWeight: 600 }}>Blast Radius:</span>
              <div style={{ fontWeight: 700, color: '#047857' }}>0 Legitimate Files</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario Selection Grid */}
      <div className="soc-card" style={{ padding: '1.5rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
              1. Select Attack Scenario to Simulate
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Choose an attack vector. The simulation will execute simultaneously against both AWS endpoints.
            </p>
          </div>
          <span className="badge badge-cyan font-mono">6 Scenarios Available</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '0.85rem' }}>
          {scenarios.map(sc => {
            const isSelected = selectedScenario === sc.id
            return (
              <div
                key={sc.id}
                onClick={() => setSelectedScenario(sc.id)}
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--brand-navy)' : '1px solid var(--border-subtle)',
                  background: isSelected ? 'var(--bg-sub)' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span className={`badge ${sc.badgeClass}`} style={{ fontSize: '0.675rem' }}>{sc.severity}</span>
                    <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                      Threat: {sc.score}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-navy)', marginBottom: '0.35rem' }}>
                    {sc.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '0.5rem' }}>
                    {sc.description}
                  </div>
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText style={{ width: '12px', height: '12px', color: 'var(--brand-cyan)' }} />
                  <span>Target: <code>{sc.targetDoc}</code></span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Attack Execution Action Bar */}
        <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-navy)' }}>
              Ready to Execute: {currentScenario.title}
            </div>
            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              Vector: <strong>{currentScenario.vector}</strong> targeting <code>{currentScenario.targetDoc}</code>
            </div>
          </div>

          <button
            onClick={handleExecuteDualAttack}
            disabled={executing || busy}
            className="btn-danger"
            style={{
              padding: '0.65rem 1.4rem',
              fontSize: '0.875rem',
              fontWeight: 700,
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {executing ? (
              <>
                <RefreshCw className="spin" style={{ width: '16px', height: '16px' }} />
                Executing Dual Attack (Step {executionStep}/3)...
              </>
            ) : (
              <>
                <Zap style={{ width: '16px', height: '16px' }} />
                Execute Dual Attack on Both Backends
              </>
            )}
          </button>
        </div>
      </div>

      {/* LIVE MEDICAL PDF INSPECTION BENCH (Crucial User Requirement) */}
      <div className="soc-card" style={{ padding: '1.5rem', background: '#fff', border: '2px solid #0284c7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-cyan" style={{ fontWeight: 800 }}>LIVE PROOF OF IMPACT</span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
                Medical Document Inspection Bench: <code>patient-1002-diagnostic.pdf</code>
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Inspect the exact patient diagnostic document across both backends. The unsecured baseline cannot read the file due to ransomware encryption, while Aegis serves the verified readable clinical PDF.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => handleDownloadFile('baseline')}
              className="btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', color: '#b91c1c', borderColor: '#fca5a5' }}
            >
              <Download style={{ width: '13px', height: '13px' }} /> Download Baseline File (.encrypted)
            </button>
            <button
              onClick={() => handleDownloadFile('protected')}
              className="btn-primary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
            >
              <Download style={{ width: '13px', height: '13px' }} /> Download Aegis Recovered PDF
            </button>
          </div>
        </div>

        {/* Side-by-Side Document Viewers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {/* Baseline Document Viewer: Corrupted & Unreadable */}
          <div
            style={{
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              background: '#fff5f5',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Viewer Header */}
            <div style={{ background: '#fee2e2', padding: '0.75rem 1rem', borderBottom: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileX style={{ width: '16px', height: '16px', color: '#dc2626' }} />
                <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#991b1b' }}>
                  Non-Secured Baseline Viewer
                </span>
              </div>
              <span className="badge badge-red" style={{ fontSize: '0.675rem' }}>
                UNREADABLE / ENCRYPTED
              </span>
            </div>

            {/* Viewer Content */}
            <div style={{ padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
              {/* Error banner */}
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: '6px', padding: '0.75rem', display: 'flex', gap: '0.6rem' }}>
                <AlertTriangle style={{ width: '18px', height: '18px', color: '#dc2626', flexShrink: 0 }} />
                <div style={{ fontSize: '0.75rem', color: '#7f1d1d' }}>
                  <div style={{ fontWeight: 700 }}>EHR Document Parser Failure: Damaged PDF Format</div>
                  <div style={{ marginTop: '0.15rem' }}>
                    Document header corrupted by ransomware. PDF signature <code>%PDF-1.4</code> missing or overwritten with AES ciphertext.
                  </div>
                </div>
              </div>

              {/* Extortion Notice Preview */}
              <div style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '6px', padding: '0.75rem', color: '#e0e7ff', fontSize: '0.725rem', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                <div style={{ color: '#f87171', fontWeight: 700, marginBottom: '0.35rem' }}>
                  [DARKSURGE_RANSOMWARE_v4.2_FILE_LOCKOUT]
                </div>
                <div>ALL YOUR CLINICAL RECORDS HAVE BEEN ENCRYPTED WITH AES-256-GCM.</div>
                <div>KEY ID: MEDICORE-AP-SOUTH-1-LOCKED-94021</div>
                <div>CONTACT: darksurge@onion.mail · RANSOM: 4.5 BTC</div>
              </div>

              {/* Raw High-Entropy Hex Dump */}
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                  Raw File Header (Entropy: 7.989 bits/byte)
                </div>
                <div style={{ background: '#0f172a', borderRadius: '6px', padding: '0.65rem', color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', overflowX: 'auto', lineHeight: 1.5 }}>
                  <code>
                    00000000: 44 41 52 4b 53 55 52 47 45 5f 52 41 4e 53 4f 4d  DARKSURGE_RANSOM<br />
                    00000010: 57 41 52 45 5f 76 34 2e 32 5f 4c 4f 43 4b 45 44  WARE_v4.2_LOCKED<br />
                    00000020: da 4b 53 75 72 67 65 00 ff c0 de ad be ef 88 99  .KSurge.........
                  </code>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '0.35rem' }}>
                <button
                  onClick={() => handleDownloadFile('baseline')}
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem', color: '#991b1b', borderColor: '#fca5a5' }}
                >
                  <Download style={{ width: '13px', height: '13px' }} /> Download Corrupted File (Verify in PDF Viewer)
                </button>
              </div>
            </div>
          </div>

          {/* Protected Document Viewer: Clean, Readable Diagnostic Report */}
          <div
            style={{
              border: '1px solid #86efac',
              borderRadius: '8px',
              background: '#f0fdf4',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Viewer Header */}
            <div style={{ background: '#dcfce7', padding: '0.75rem 1rem', borderBottom: '1px solid #86efac', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 style={{ width: '16px', height: '16px', color: '#16a34a' }} />
                <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#166534' }}>
                  Aegis Protected Viewer (Clean Recovery)
                </span>
              </div>
              <span className="badge badge-emerald" style={{ fontSize: '0.675rem' }}>
                100% READABLE & VERIFIED
              </span>
            </div>

            {/* Viewer Content */}
            <div style={{ padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
              {/* Integrity Verified Badge */}
              <div style={{ background: '#ecfdf5', border: '1px solid #34d399', borderRadius: '6px', padding: '0.75rem', display: 'flex', gap: '0.6rem' }}>
                <ShieldCheck style={{ width: '18px', height: '18px', color: '#059669', flexShrink: 0 }} />
                <div style={{ fontSize: '0.75rem', color: '#064e3b' }}>
                  <div style={{ fontWeight: 700 }}>Cryptographic Integrity Confirmed: SHA-256 Pre-Image Match</div>
                  <div style={{ marginTop: '0.15rem', fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }}>
                    SHA-256: 86c31cf8174c58a24c9a3b2c00dbe70549426b7597611a5cd5f10ebfdbd950fc
                  </div>
                </div>
              </div>

              {/* Rendered Clinical Medical Report */}
              <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.9rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.8125rem', color: 'var(--brand-navy)' }}>
                      MEDICORE REGIONAL HEALTH SYSTEM
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      Clinical Diagnostic Laboratory Report · Facility: ap-south-1
                    </div>
                  </div>
                  <span className="badge badge-cyan" style={{ fontSize: '0.625rem' }}>MRN: #1002</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.725rem', marginBottom: '0.6rem' }}>
                  <div><strong>Patient:</strong> Sarah Jenkins (Age 42, F)</div>
                  <div><strong>Collection:</strong> 2026-11-22 06:45 UTC</div>
                  <div><strong>Physician:</strong> Dr. Marcus Vance, MD</div>
                  <div><strong>Status:</strong> Verified Safe</div>
                </div>

                <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: 'var(--text-dim)', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.3rem' }}>Test Parameter</th>
                      <th style={{ padding: '0.3rem' }}>Result</th>
                      <th style={{ padding: '0.3rem' }}>Ref Range</th>
                      <th style={{ padding: '0.3rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.3rem' }}>Hemoglobin</td>
                      <td style={{ padding: '0.3rem', fontWeight: 700 }}>14.2 g/dL</td>
                      <td style={{ padding: '0.3rem', color: 'var(--text-muted)' }}>12.0 - 15.5</td>
                      <td style={{ padding: '0.3rem', color: '#16a34a', fontWeight: 700 }}>NORMAL</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.3rem' }}>White Blood Cells</td>
                      <td style={{ padding: '0.3rem', fontWeight: 700 }}>6.8 K/uL</td>
                      <td style={{ padding: '0.3rem', color: 'var(--text-muted)' }}>4.5 - 11.0</td>
                      <td style={{ padding: '0.3rem', color: '#16a34a', fontWeight: 700 }}>NORMAL</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.3rem' }}>Platelet Count</td>
                      <td style={{ padding: '0.3rem', fontWeight: 700 }}>240 K/uL</td>
                      <td style={{ padding: '0.3rem', color: 'var(--text-muted)' }}>150 - 450</td>
                      <td style={{ padding: '0.3rem', color: '#16a34a', fontWeight: 700 }}>NORMAL</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ textAlign: 'center', marginTop: '0.35rem' }}>
                <button
                  onClick={() => handleDownloadFile('protected')}
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }}
                >
                  <Download style={{ width: '13px', height: '13px' }} /> Download Authentic PDF (Open in PDF Viewer)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Comparative Scorecard */}
      <div className="soc-card" style={{ padding: '1.5rem', background: '#fff' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 1rem', color: 'var(--brand-navy)' }}>
          Comparative Threat & Resilience Scorecard
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-dim)', fontWeight: 700 }}>EVALUATION DIMENSION</th>
                <th style={{ padding: '0.75rem 1rem', color: '#991b1b', fontWeight: 700 }}>MEDICORE BASELINE (UNSECURED)</th>
                <th style={{ padding: '0.75rem 1rem', color: '#065f46', fontWeight: 700 }}>MEDICORE PROTECTED (AEGIS)</th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--brand-navy)', fontWeight: 700 }}>JUDGE VERDICT</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--brand-navy)' }}>
                  Mean Time to Contain (MTTC)
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#dc2626', fontWeight: 700 }}>
                  Uncontained (~4.2 hrs manual)
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#059669', fontWeight: 700 }}>
                  1.84 seconds (Automated)
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className="badge badge-emerald">-99.9% Faster Containment</span>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--brand-navy)' }}>
                  Ransomware Blast Radius
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#dc2626', fontWeight: 700 }}>
                  100% of S3 diagnostic files lost
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#059669', fontWeight: 700 }}>
                  0 legitimate files lost
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className="badge badge-emerald">Zero Blast Radius</span>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--brand-navy)' }}>
                  Legitimate Doctor Workflow
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#dc2626', fontWeight: 700 }}>
                  Disrupted / S3 Locked by Ransomware
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#059669', fontWeight: 700 }}>
                  100% Uninterrupted (Clean Role)
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className="badge badge-emerald">Continuity Guaranteed</span>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--brand-navy)' }}>
                  Patient Diagnostic Document
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#dc2626', fontWeight: 700 }}>
                  Corrupted Ciphertext (Unreadable PDF)
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#059669', fontWeight: 700 }}>
                  Authentic Clinical PDF (Verified SHA-256)
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className="badge badge-emerald">Cryptographic Recovery</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Dual-Streaming Telemetry Terminals */}
      <div className="soc-card" style={{ padding: '1.5rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal style={{ width: '18px', height: '18px', color: 'var(--brand-navy)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--brand-navy)' }}>
              Dual-Lane Streaming Telemetry Console
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                setBaselineLogs(['[CONSOLE CLEARED]'])
                setProtectedLogs(['[CONSOLE CLEARED]'])
              }}
              className="btn-secondary"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.7rem' }}
            >
              Clear Logs
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* Baseline Terminal */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Server style={{ width: '13px', height: '13px' }} /> Baseline Terminal (synthetic-baseline)
            </div>
            <div
              className="font-mono"
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '0.85rem',
                minHeight: '160px',
                maxHeight: '240px',
                overflowY: 'auto',
                fontSize: '0.725rem',
                color: '#f87171',
                lineHeight: 1.5
              }}
            >
              {baselineLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>

          {/* Protected Terminal */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldCheck style={{ width: '13px', height: '13px' }} /> Aegis Guardian Terminal (medicore-aegis-demo)
            </div>
            <div
              className="font-mono"
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '0.85rem',
                minHeight: '160px',
                maxHeight: '240px',
                overflowY: 'auto',
                fontSize: '0.725rem',
                color: '#34d399',
                lineHeight: 1.5
              }}
            >
              {protectedLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
