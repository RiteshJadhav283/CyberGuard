'use client'
import { useCallback, useEffect, useState } from 'react'

type User = {role:string; customer:string}
type Conn = {id:string; label:string; mode:string; enabled:boolean; health:string; checked_at:number; bucket:string; prefix:string; recovery_bucket:string; canary:string; slack_configured:boolean; jira_configured:boolean}
type Case = {id:string; label:string; mode:string; actor:string; score:number; stage:string; last_at:number}
type Event = {event_id:string; label:string; actor:string; object_key:string; operation:string; at:number; received:number; mode:string}
type Item = {key:string; source:string; observed:string; destination:string; sha256:string}
type Job = {id:string; kind:string; state:string; expires:number; payload:{items?:Item[]; skipped?:string[]; actor?:string; bucket?:string; prefix?:string; recovery_bucket?:string}; result:{verified?:Record<string,string>; failed?:Record<string,string>; error?:string; verification?:string; issue?:string}}
type Report = Case & {connection:Conn; history:{previous_events:number;previous_files:number}; evidence:string[]; events:Event[]; jobs:Job[]; timeline:{id:number; at:number; actor:string; action:string; detail:string}[]}
type Snapshot = {connections:Conn[]; cases:Case[]; activity:Event[]}
type Request = (path:string,auth?:string,options?:RequestInit)=>Promise<Response>
type Props = {user:User; token:string; request:Request}
const stamp=(time:number)=>time ? new Date(time*1000).toLocaleString() : 'Awaiting check'
const words=(value:string)=>value.replaceAll('_',' ')

export default function Operations({user,token,request}:Props) {
  const [view,setView]=useState('Incidents')
  const [snapshot,setSnapshot]=useState<Snapshot>({connections:[],cases:[],activity:[]})
  const [selected,setSelected]=useState<string|null>(null)
  const [report,setReport]=useState<Report|null>(null)
  const [keys,setKeys]=useState<string[]>([])
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [loaded,setLoaded]=useState(false)
  const [feedError,setFeedError]=useState('')
  const canReview=user.role!=='viewer'
  const admin=user.role==='admin'
  const call=useCallback(async(path:string,method='GET',body?:unknown)=>{
    const res=await request('/ops'+path,token,{method,body:body===undefined?undefined:JSON.stringify(body)})
    return res.json()
  },[request,token])
  useEffect(()=>{setSelected(new URLSearchParams(location.search).get('case'))},[])
  useEffect(()=>{
    let active=true
    let timer:ReturnType<typeof setTimeout>
    let refreshing=false
    let socket:WebSocket|undefined
    async function refresh(){
      if(!active||refreshing)return
      refreshing=true
      clearTimeout(timer)
      try {
        const [overview,detail]=await Promise.all([call('/overview'),selected?call('/cases/'+selected):null])
        if(active){setSnapshot(overview);setReport(detail);setLoaded(true);setFeedError('')}
      } catch(e){if(active)setFeedError(e instanceof Error?e.message:'Unable to refresh')}
      refreshing=false
      if(active)timer=setTimeout(refresh,socket?.readyState===WebSocket.OPEN?15000:3000)
    }
    refresh()
    socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/v1/ops/stream')
    socket.onopen=()=>{if(active)socket?.send(token)}
    socket.onmessage=e=>{if(active&&JSON.parse(e.data).changed)refresh()}
    return ()=>{active=false;clearTimeout(timer);socket?.close()}
  },[call,selected,token])
  async function act(path:string,body?:unknown) {
    setBusy(true);setError('')
    try {
      await call(path,'POST',body)
      setSnapshot(await call('/overview'))
      if(selected)setReport(await call('/cases/'+selected))
    } catch(e){setError(e instanceof Error?e.message:'Action failed')}
    finally{setBusy(false)}
  }
  async function download(path:string,name:string){
    try{
      const response=await request('/ops'+path,token)
      const url=URL.createObjectURL(await response.blob())
      const a=document.createElement('a');a.href=url;a.download=name;a.click()
      setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setError(e instanceof Error?e.message:'Download failed')}
  }
  function open(id:string|null){setSelected(id);setReport(null);setKeys([]);setReason('');setError('')}
  const path='/cases/'+selected
  return <div className="operations">
    <div className="switcher" aria-label="Workspace sections">{['Incidents','Connections','Activity'].map(name=>
      <button key={name} aria-pressed={view===name} onClick={()=>{setView(name);open(null)}}>{name}</button>)}</div>
    {(error||feedError)&&<p className="error" role="alert">{error||feedError}</p>}
    {(!loaded&&!feedError)&&<p>Loading customer workspace…</p>}
    {loaded && view==='Connections' && <><h1>Connections</h1>
      {admin&&!snapshot.connections.some(c=>c.mode==='replay')&&<button disabled={busy} onClick={()=>act('/connections/replay')}>Add practice bucket</button>}
      {!snapshot.connections.length&&<p>No buckets connected. AWS connections appear here after the customer role is registered.</p>}
      {snapshot.connections.map(c=><section key={c.id}><div className="sectionhead"><h2>{c.label}</h2><b>{c.mode.toUpperCase()}</b></div>
        <dl><dt>Connection ID</dt><dd>{c.id}</dd><dt>Source</dt><dd>{c.bucket}/{c.prefix}</dd><dt>Recovery bucket</dt><dd>{c.recovery_bucket}</dd>
          <dt>Canary</dt><dd>{c.canary||'Unconfigured'}</dd><dt>Monitoring</dt><dd>{c.health} · {stamp(c.checked_at)}</dd>
          <dt>Slack notifications</dt><dd>{c.slack_configured?'Configured':'Unconfigured'}</dd><dt>Jira tickets</dt><dd>{c.jira_configured?'Configured':'Unconfigured'}</dd></dl>
        {admin&&<button disabled={busy} onClick={()=>act('/connections/'+c.id+'/enabled/'+!c.enabled)}>{c.enabled?'Pause monitoring':'Enable connection'}</button>}
        {canReview&&c.enabled&&c.mode==='replay'&&<><h3>Replay activity</h3><div className="actions">
          {['routine','bulk','canary','correlated'].map(s=><button disabled={busy} key={s} onClick={()=>act('/connections/'+c.id+'/replay/'+s)}>{s}</button>)}</div></>}
      </section>)}</>}
    {loaded && view==='Activity'&&<><h1>File activity</h1>{snapshot.activity.length===0?<p>No observed file changes.</p>:
      <div className="scroll"><table><thead><tr><th>Observed change</th><th>Identity</th><th>Event time</th><th>Source</th></tr></thead><tbody>
      {snapshot.activity.map((e,i)=><tr key={i}><td>{e.object_key}<small>{e.operation}</small></td><td>{e.actor}</td><td>{stamp(e.at)}</td><td>{e.mode}</td></tr>)}</tbody></table></div>}</>}
    {loaded&&view==='Incidents'&&!selected&&<><h1>Incident queue</h1>
      {!snapshot.cases.length?<section><h2>No detected incidents</h2><p>{snapshot.connections.length?'Monitored activity and replay results appear here.':'Open Connections to add a practice bucket or activate customer monitoring.'}</p></section>:
      snapshot.cases.map(c=><button className="case" key={c.id} onClick={()=>open(c.id)}>
        <strong>{c.label} · {words(c.stage)}</strong><span>Risk {c.score}/100 · {c.actor}</span><small>{stamp(c.last_at)} · {c.mode}</small></button>)}</>}
    {view==='Incidents'&&selected&&<><button onClick={()=>open(null)}>Back to queue</button>
      {report&&<><div className="sectionhead"><h1>Incident review</h1><b>{report.connection.mode.toUpperCase()}</b></div>
        <section><div className="sectionhead"><h2>{report.connection.label}</h2><strong>Risk {report.score}/100</strong></div>
          <p>{words(report.stage)} · {report.actor}</p><p>Prior activity: {report.history.previous_events} changes across {report.history.previous_files} files.</p><ul>{report.evidence.map(e=><li key={e}>{e}</li>)}</ul>
          <button onClick={()=>download(path+'/export','aegis-incident.json')}>Export evidence</button></section>
        {canReview&&<section><h2>Response decision</h2><label>Decision reason<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>
          <div className="actions">{report.stage==='open'&&<button disabled={busy} onClick={()=>act(path+'/step',{action:'review'})}>Begin review</button>}
          {['open','review'].includes(report.stage)&&<>
            <button disabled={busy||!reason.trim()} onClick={()=>act(path+'/step',{action:'skip_containment',reason})}>Skip containment</button>
            <button disabled={busy} onClick={()=>act(path+'/containment/restrict')}>Preview restriction</button></>}
          {['contained','containment_uncertain','recovered','partial_recovery'].includes(report.stage)&&<button disabled={busy} onClick={()=>act(path+'/containment/reverse')}>Preview reversal</button>}
          {['containment_skipped','reversed','recovered','partial_recovery'].includes(report.stage)&&<button disabled={busy||!reason.trim()} onClick={()=>act(path+'/step',{action:'close',reason})}>Close case</button>}</div></section>}
        <section><h2>Affected files</h2>{Array.from(new Set(report.events.map(e=>e.object_key))).map(k=><label className="check" key={k}>
          <input type="checkbox" checked={keys.includes(k)} onChange={e=>setKeys(e.target.checked?[...keys,k]:keys.filter(x=>x!==k))}/>{k}</label>)}
          {canReview&&<button disabled={busy||!keys.length} onClick={()=>act(path+'/recovery',{keys})}>Preview selected recovery</button>}</section>
        <section><h2>Approvals and results</h2>{!report.jobs.length&&<p>No actions proposed.</p>}
          {report.jobs.map(j=><article key={j.id}><h3>{words(j.kind)} · {j.state}</h3>
            {j.payload.actor&&<p>{j.payload.actor} · {j.payload.bucket}/{j.payload.prefix}</p>}
            {j.payload.items?.map((i,n)=><details key={i.key}><summary>{i.key} · {j.result.verified?.[n]?'verified':j.result.failed?.[n]||'selected'}</summary>
              <dl>{Object.entries(i).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}<dt>Destination bucket</dt><dd>{j.payload.recovery_bucket}</dd></dl>
              {j.result.verified?.[n]&&<button onClick={()=>download(path+'/jobs/'+j.id+'/files/'+n,'recovered-report')}>Download verified copy</button>}</details>)}
            {!!j.payload.skipped?.length&&<p>Missing trusted history: {j.payload.skipped.join(', ')}</p>}
            {j.result.issue&&<p>Jira issue {j.result.issue}</p>}{j.result.error&&<p>{j.result.error}</p>}{j.result.verification&&<p>{j.result.verification}</p>}
            {j.state==='preview'&&<p>Approval expires {stamp(j.expires)}</p>}
            {j.state==='preview'&&admin&&<div className="actions">{['approve','reject'].map(v=><button disabled={busy||j.expires*1000<=Date.now()} key={v} onClick={()=>act(path+'/jobs/'+j.id+'/'+v)}>{v}</button>)}</div>}
          </article>)}</section>
        <section><h2>Audit timeline</h2><ol>{report.timeline.map(t=><li key={t.id}>{words(t.action)} <small>{stamp(t.at)} · {t.actor} · {t.detail}</small></li>)}</ol></section>
      </>}
    </>}
  </div>
}
