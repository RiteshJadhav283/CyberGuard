'use client'
import { useState, useCallback, type FormEvent } from 'react'

import Operations from './operations'

type User = { email: string; role: string; customer: string }
type Case = { id: string; title: string; object_key: string }
type Plan = { id: string; source: string; observed: string; destination: string; expected_hash: string; status: string; expires: number }
type Detail = Case & { plans: Plan[]; timeline: { action: string; at: number; actor: string }[] }

export default function Console() {
  const [workspace,setWorkspace]=useState(true)
  const [token, setToken] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const request=useCallback(async (path: string, auth = token, options: RequestInit = {}) => {
    const response = await fetch('/api/v1' + path, { ...options, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? {Authorization: 'Bearer ' + auth} : {}) } })
    if (!response.ok) {
      if (response.status === 401 && auth) { setUser(null); setToken(''); setDetail(null); setCases([]) }
      const data = await response.json().catch(() => ({}))
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Request failed (' + response.status + ')')
    }
    return response
  },[token])
  async function perform(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Request failed') }
    finally { setBusy(false) }
  }
  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await perform(async () => {
      const res = await request('/auth/login', '', {method: 'POST', body: JSON.stringify(Object.fromEntries(form))})
      const auth = (await res.json()).access_token
      const account = await (await request('/auth/me', auth)).json()
      const items = await (await request('/incidents', auth)).json()
      setToken(auth); setCases(items); setUser(account)
    })
  }
  async function openCase(id: string) {
    setDetail(await (await request('/incidents/' + id)).json())
  }
  async function download(id: string) {
    const file = await (await request('/plans/' + id + '/file')).blob()
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url; link.download = 'sample-001.txt'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main>
    <header><strong>AEGIS</strong><span>Customer security console</span></header>
    {error && <p className="error" role="alert">{error}</p>}
    {!user ? <section className="login"><h1>Incident console</h1>
      <p>Sign in with your provisioned demo account.</p>
      <form onSubmit={signIn}><label>Email<input name="email" type="email" required autoComplete="username" /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
        <button disabled={busy}>Sign in</button></form></section>
    : <><nav><span>{user.customer} / {user.role}</span>
      <button disabled={busy} onClick={() => perform(async () => {
        await request('/auth/logout', token, {method:'POST'}); setUser(null); setToken(''); setCases([]); setDetail(null)
      })}>Sign out</button></nav>
      <div className="tabs"><button aria-pressed={workspace} onClick={()=>setWorkspace(true)}>Security operations</button>
      <button aria-pressed={!workspace} onClick={()=>setWorkspace(false)}>Single-report fixture</button></div>
      {workspace?<Operations user={user} token={token} request={request}/>:<><h1>{detail ? detail.title : 'Incidents'}</h1>
      {!detail ? <section><h2>Incident list</h2>{cases.length === 0 ? <p>No incidents recorded for this customer.</p> :
        cases.map(item => <button className="case" key={item.id} disabled={busy} onClick={() => perform(() => openCase(item.id))}>
          {item.title}<small>{item.object_key}</small></button>)}</section> :
      <><button disabled={busy} onClick={() => setDetail(null)}>Back to incidents</button>
        <section><h2>Recovery preview</h2><p>{detail.object_key}</p>
          {user.role !== 'viewer' && <button disabled={busy} onClick={() => perform(async () => {
            await request('/incidents/' + detail.id + '/plans', token, {method:'POST'}); await openCase(detail.id)
          })}>Prepare preview</button>}
          {!detail.plans.length && <p>No recovery plans prepared.</p>}
          {detail.plans.map(plan => <article key={plan.id}><h3>Single-report plan · {plan.status}</h3><dl>
            <dt>Original version to copy</dt><dd>{plan.source}</dd><dt>Observed revision</dt><dd>{plan.observed}</dd>
            <dt>Recovery destination</dt><dd>{plan.destination}</dd><dt>Expected SHA-256</dt><dd>{plan.expected_hash}</dd>
            <dt>Approval expires</dt><dd>{new Date(plan.expires * 1000).toLocaleString()}</dd></dl>
            {plan.status === 'pending' && user.role === 'admin' && <button disabled={busy} onClick={() => perform(async () => {
              await request('/plans/' + plan.id + '/approve', token, {method:'POST'}); await openCase(detail.id)
            })}>Approve and recover this version</button>}
            {plan.status === 'verified' && <button disabled={busy} onClick={() => perform(() => download(plan.id))}>Download verified copy</button>}
          </article>)}</section>
        <section><h2>Audit timeline</h2><ol>{detail.timeline.map((event, i) => <li key={i}>
          <time>{new Date(event.at * 1000).toLocaleTimeString()}</time> {event.action.replaceAll('_',' ')}</li>)}</ol></section></>}</>}
    </>}
  </main>
}
