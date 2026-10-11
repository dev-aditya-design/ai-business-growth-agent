import { useEffect } from 'react';
import { supabase } from './supabase.js';
import { useMemo, useState } from 'react';

const leadsSeed = [
  { id: 1, name: 'Aarav Mehta', company: 'Summit Fitness', email: 'aarav@example.com', source: 'Website', score: 92, status: 'Qualified', value: 4200, date: 'Oct 10' },
  { id: 2, name: 'Priya Shah', company: 'Bloom & Co.', email: 'priya@example.com', source: 'Referral', score: 86, status: 'Contacted', value: 3100, date: 'Oct 09' },
  { id: 3, name: 'Kabir Rao', company: 'Urban Nest Realty', email: 'kabir@example.com', source: 'Website', score: 74, status: 'New', value: 5600, date: 'Oct 09' },
  { id: 4, name: 'Sara Khan', company: 'The Green Table', email: 'sara@example.com', source: 'Campaign', score: 62, status: 'Follow-up', value: 1900, date: 'Oct 08' },
  { id: 5, name: 'Rohan Das', company: 'Nova Digital', email: 'rohan@example.com', source: 'Referral', score: 44, status: 'New', value: 2500, date: 'Oct 07' },
];
const nav = [
  { section: 'WORKSPACE', items: [['Overview','◫'], ['Leads','♧'], ['AI Agent','✧'], ['Automations','⟳'], ['Analytics','▥']] },
  { section: 'MANAGE', items: [['Messages','✉'], ['Settings','⚙']] },
];
const weekly = [32, 48, 39, 65, 55, 83, 71];
const format = n => new Intl.NumberFormat('en-US').format(n);
function Icon({ children, className = '' }) { return <span aria-hidden="true" className={className}>{children}</span>; }
function App({ session, onSignOut }) {
  const [page, setPage] = useState('Overview');
  const [sidebar, setSidebar] = useState(false);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [scoringId, setScoringId] = useState(null);
  const [followupLead, setFollowupLead] = useState(null);
  const [followupDraft, setFollowupDraft] = useState(null);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState('');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ name: '', company: '', email: '' });
  const [period, setPeriod] = useState('7 days');
  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (!active) return;
      if (error) setDataError(error.message);
      else setLeads((data || []).map(l => ({...l, value: Number(l.estimated_value), date: new Date(l.created_at).toLocaleDateString(), score: l.score ?? 0})));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [session.user.id]);
  const filtered = useMemo(() => leads.filter(l => [l.name,l.company,l.email].join(' ').toLowerCase().includes(search.toLowerCase()) && (filter === 'All' || l.status === filter)), [leads, search, filter]);
  const qualified = leads.filter(l => l.status === 'Qualified').length;
  const chartDays = period === '7 days' ? 7 : 30;
  const chartData = Array.from({length: chartDays}, (_,i) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(chartDays-1-i)); return {label: d.toLocaleDateString(undefined,{month:'short',day:'numeric'}), count: leads.filter(l => l.created_at && new Date(l.created_at).toDateString() === d.toDateString()).length}; });
  const chartMax = Math.max(1,...chartData.map(d=>d.count));
  function notify(message) { setToast(message); window.setTimeout(() => setToast(''), 3600); }
  function openNew() { setEditing(null); setForm({name:'',company:'',email:'',status:'New',estimated_value:'0'}); setModal(true); }
  function openEdit(lead) { setEditing(lead); setForm({name:lead.name,company:lead.company,email:lead.email,status:lead.status,estimated_value:String(lead.estimated_value ?? 0)}); setModal(true); }
  async function deleteLead(lead) {
    if (!window.confirm(`Delete ${lead.name}? This cannot be undone.`)) return;
    setDeletingId(lead.id);
    const {data,error} = await supabase.from('leads').delete().eq('id',lead.id).eq('user_id',session.user.id).select('id');
    if (error) notify(error.message);
    else if (!data?.length) notify('Lead not found or access denied');
    else { setLeads(prev=>prev.filter(l=>l.id!==lead.id)); notify('Lead deleted'); }
    setDeletingId(null);
  }
  async function scoreLead(lead) {
    if (scoringId) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (!apiBase || !/^https:\/\/[^/]+$/.test(apiBase)) {
      notify('AI scoring API is not configured.'); return;
    }
    setScoringId(lead.id);
    try {
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSession?.access_token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`${apiBase}/api/ai/leads/${encodeURIComponent(lead.id)}/score`, {
        method: 'POST', headers: { Authorization: `Bearer ${currentSession.access_token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'AI scoring failed');
      if (!Number.isInteger(result.score) || result.score < 0 || result.score > 100) throw new Error('Invalid AI scoring response');
      setLeads(prev => prev.map(l => l.id === lead.id ? {...l, score: result.score, ai_reason: result.reason, ai_next_action: result.next_action} : l));
      notify('AI score saved');
    } catch (error) {
      notify(error.message || 'AI scoring failed');
    } finally {
      setScoringId(null);
    }
  }
  async function generateFollowup(lead) {
    setFollowupLead(lead);
    setFollowupDraft(null);
    setFollowupError('');
    setFollowupLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL;
      if (!apiBase || !/^https:\\/\\/[^/]+$/.test(apiBase)) throw new Error('Follow-up API is not configured.');
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSession?.access_token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`${apiBase}/api/ai/leads/${encodeURIComponent(lead.id)}/follow-up`, {
        method: 'POST', headers: { Authorization: `Bearer ${currentSession.access_token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not generate follow-up');
      if (typeof result.subject !== 'string' || typeof result.message !== 'string') throw new Error('Invalid follow-up response');
      setFollowupDraft({ subject: result.subject, message: result.message });
    } catch (error) {
      setFollowupError(error.message || 'Could not generate follow-up');
    } finally {
      setFollowupLoading(false);
    }
  }
  async function addLead(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.company.trim() || !form.email.trim() || !form.email.includes('@') || !form.email.split('@')[1]?.includes('.')) { notify('Enter a valid name, company and email.'); return; }
    const amount = Number(form.estimated_value ?? 0);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999) { notify('Enter a valid pipeline value'); return; }
    setSaving(true);
    const payload = {name:form.name.trim(),company:form.company.trim(),email:form.email.trim(),status:editing ? form.status : 'New',estimated_value:amount};
    const query = editing
      ? supabase.from('leads').update(payload).eq('id',editing.id).eq('user_id',session.user.id).select().single()
      : supabase.from('leads').insert({...payload,user_id:session.user.id}).select().single();
    const {data,error} = await query;
    setSaving(false);
    if (error) { notify(error.message); return; }
    const normalized = {...data,value:Number(data.estimated_value),score:data.score??0,date:new Date(data.created_at).toLocaleDateString()};
    setLeads(prev=>editing ? prev.map(l=>l.id===editing.id?normalized:l) : [normalized,...prev]);
    setModal(false); setEditing(null); setPage('Leads'); notify(editing?'Lead updated':'Lead saved securely');
  }
  const menu = (item) => { setPage(item); setSidebar(false); setSearch(''); setFilter('All'); };
  return <div className="min-h-screen bg-[#f7f9fc] text-slate-900 lg:flex">
    {sidebar && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setSidebar(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#101c34] text-slate-300 flex flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebar ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-6 py-7 flex items-center gap-3 border-b border-white/10"><div className="h-10 w-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-black text-xl">✦</div><div><div className="text-white font-bold tracking-tight text-lg">GrowthPilot <span className="text-indigo-400">AI</span></div><div className="text-[10px] uppercase tracking-[.18em] text-slate-400">Business intelligence</div></div></div>
      <div className="px-3 py-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">{nav.map(group => <div key={group.section} className="mb-8"><p className="px-4 mb-3 text-[10px] font-semibold tracking-[.19em] text-slate-500">{group.section}</p>{group.items.map(([item, glyph]) => <button key={item} onClick={() => menu(item)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium mb-1 transition-colors ${page === item ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'hover:bg-white/10 hover:text-white'}`}><span className="text-lg w-5 text-center">{glyph}</span>{item}{item === 'Messages' && <span className="ml-auto rounded-full bg-white/10 text-xs px-2">3</span>}</button>)}</div>)}</div>
      <div className="shrink-0 border-t border-white/10 p-3"><div className="hidden xl:block rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-indigo-300 font-semibold">DEMO WORKSPACE</p><p className="text-xs text-slate-400 mt-2 leading-5">Private leads database connected. AI lead scoring is available for signed-in users; outbound automation is not connected yet.</p></div><div className="flex items-center gap-3 px-2 pt-2 min-w-0"><div className="h-9 w-9 bg-indigo-200 text-indigo-900 rounded-full flex items-center justify-center font-bold">A</div><div><p className="text-white text-sm font-semibold">Workspace Admin</p><p className="text-xs text-slate-400 truncate max-w-[155px]" title={session.user.email}>{session.user.email}</p></div></div><button type="button" onClick={onSignOut} className="mt-2 w-full rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">Sign out</button></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="h-20 bg-white border-b border-slate-200 px-5 sm:px-8 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><button className="lg:hidden text-2xl" onClick={() => setSidebar(true)} aria-label="Open menu">☰</button><div><p className="text-xs text-slate-400">Workspace / {page}</p><h1 className="font-bold text-xl tracking-tight">{page}</h1></div></div><div className="flex items-center gap-3"><span className="hidden sm:inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">● Secure workspace</span><button onClick={() => notify('Notifications are coming in a future milestone')} aria-label="Notifications" className="h-10 w-10 rounded-xl border border-slate-200 hover:bg-slate-50">♧</button><div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-700 font-bold grid place-items-center">A</div></div></header>
      <main className="mx-auto max-w-[1480px] px-5 sm:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">Growth workspace</p><h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{page === 'Overview' ? 'Good morning, welcome back 👋' : page}</h2><p className="text-slate-500 text-sm mt-2">{page === 'Overview' ? 'Here’s a snapshot of your business pipeline.' : 'Manage your private leads and pipeline.'}</p></div><button onClick={openNew} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 font-semibold text-sm shadow-md shadow-indigo-200">＋ Add new lead</button></div>
        {dataError && <p role="alert" className="mb-5 rounded-xl bg-red-50 text-red-700 p-4">Database error: {dataError}</p>}
        {loading && <p className="mb-5 text-slate-500">Loading leads...</p>}
        {page === 'Overview' ? <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-7">
            {[['Total leads',format(leads.length),'↗','bg-indigo-50 text-indigo-600','♧'],['Qualified leads',format(qualified),'↗','bg-emerald-50 text-emerald-600','✓'],['Potential pipeline','$'+format(leads.reduce((s,l)=>s+l.value,0)),'↗','bg-amber-50 text-amber-600','$'],['Pending follow-ups',String(leads.filter(l=>l.status==='Follow-up').length),'→','bg-rose-50 text-rose-600','◷']].map(([label,value,trend,color,glyph]) => <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"><div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`h-10 w-10 grid place-items-center rounded-xl text-lg ${color}`}>{glyph}</span></div><div className="text-3xl font-bold mt-4 tracking-tight">{value}</div><p className="text-xs text-slate-400 mt-2"><span className="text-emerald-600 font-semibold">{trend}</span> Your saved lead data</p></div>)}
          </div>
          <div className="grid xl:grid-cols-3 gap-6 mb-7"><section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-lg">Lead activity</h3><p className="text-xs text-slate-400 mt-1">Actual new leads by day</p></div><select value={period} onChange={e=>setPeriod(e.target.value)} aria-label="Chart period" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"><option>7 days</option><option>30 days</option></select></div><div className="mt-8 h-56 flex items-end justify-between gap-3 border-b border-slate-100 pb-1">{chartData.map((item,i)=><div key={i} className="flex-1 flex flex-col justify-end items-center h-full gap-2"><div title={`${item.label}: ${item.count} new leads`} className="w-full max-w-14 rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-300 hover:from-indigo-700 transition-all" style={{height:`${Math.max(2,item.count/chartMax*100)}%`}}></div><span className="text-[11px] text-slate-400">{period==='7 days'?item.label:(i%5===0?item.label:'')}</span></div>)}</div></section>
          <section className="rounded-2xl bg-[#172747] p-6 text-white shadow-sm flex flex-col"><span className="inline-flex self-start text-xs rounded-full bg-indigo-500/30 text-indigo-200 px-3 py-1">✦ AI ASSISTANT</span><h3 className="text-2xl font-bold mt-7 leading-tight">Smarter growth starts here.</h3><p className="text-sm text-slate-300 leading-6 mt-4">Score your saved leads with AI from the Leads page. Outreach automation is not enabled; messages require human approval.</p><div className="mt-auto pt-8"><button onClick={()=>menu('AI Agent')} className="rounded-xl bg-white text-slate-900 font-semibold text-sm px-5 py-3 hover:bg-indigo-50">Explore AI agent →</button></div></section></div>
          <LeadTable leads={filtered} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} compact onViewAll={()=>menu('Leads')} onEdit={openEdit} onDelete={deleteLead} deletingId={deletingId} onScore={scoreLead} scoringId={scoringId} onFollowup={generateFollowup}/>
        </> : page === 'Leads' ? <LeadTable leads={filtered} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onEdit={openEdit} onDelete={deleteLead} deletingId={deletingId} onScore={scoreLead} scoringId={scoringId} onFollowup={generateFollowup}/> : <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 sm:p-16 text-center"><div className="h-16 w-16 bg-indigo-50 text-indigo-600 rounded-2xl grid place-items-center text-3xl mx-auto">✦</div><h3 className="text-xl font-bold mt-5">{page} workspace</h3><p className="text-slate-500 text-sm max-w-md mx-auto mt-3 leading-6">This module is planned for an upcoming milestone. The current dashboard is a frontend prototype; no live AI, messaging, or automations are running.</p><button onClick={()=>menu('Overview')} className="mt-6 text-indigo-600 font-semibold text-sm hover:underline">← Back to overview</button></section>}
        <p className="mt-8 text-xs text-slate-400 text-center">GrowthPilot AI · Portfolio prototype · Lead metrics and activity come from your private database.</p>
      </main>
    </div>
    {followupLead && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setFollowupLead(null)}}><div role="dialog" aria-modal="true" aria-label="Follow-up draft" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"><div className="flex justify-between items-start gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">GrowthPilot AI · Outreach assistant</p><h3 className="text-xl font-bold mt-2">Follow-up draft</h3><p className="text-sm text-slate-500 mt-1">{followupLead.name} · {followupLead.company}</p></div><button aria-label="Close follow-up draft" onClick={()=>setFollowupLead(null)} className="rounded-lg border px-3 py-2">✕</button></div><p className="mt-5 text-sm rounded-xl bg-amber-50 text-amber-900 p-3">Review and edit before using. This app never sends messages automatically.</p>{followupLoading && <p role="status" className="mt-5 text-sm text-slate-600">Generating your draft...</p>}{followupError && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{followupError}</p>}{followupDraft && <div className="mt-5 space-y-4"><label className="block text-sm font-semibold">Email subject<input value={followupDraft.subject} maxLength={120} onChange={e=>setFollowupDraft({...followupDraft,subject:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"/></label><label className="block text-sm font-semibold">Message<textarea rows={9} maxLength={1200} value={followupDraft.message} onChange={e=>setFollowupDraft({...followupDraft,message:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal leading-6"/></label><button onClick={async()=>{try{await navigator.clipboard.writeText(`Subject: ${followupDraft.subject}\n\n${followupDraft.message}`);notify('Draft copied');}catch{notify('Copy unavailable; select the text to copy');}}} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">Copy draft</button></div>}<div className="mt-5 flex justify-end"><button disabled={followupLoading} onClick={()=>generateFollowup(followupLead)} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Regenerate</button></div></div></div>}
    {toast && <div role="status" className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 text-white px-5 py-3 shadow-xl text-sm">{toast}</div>}
    {modal && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><div role="dialog" aria-modal="true" aria-labelledby="lead-dialog" className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"><div className="flex justify-between items-center"><h3 id="lead-dialog" className="text-xl font-bold">{editing ? "Edit lead" : "Add a new lead"}</h3><button onClick={()=>setModal(false)} aria-label="Close dialog" className="text-slate-500 text-2xl">×</button></div><p className="text-slate-500 text-sm mt-2">Saved to your private Supabase database.</p><form onSubmit={addLead} className="mt-6 space-y-4">{[['name','Full name'],['company','Company'],['email','Email address']].map(([key,label])=><label key={key} className="block text-sm font-medium">{label}<input required type={key==='email'?'email':'text'} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} maxLength={100} className="mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500" placeholder={label}/></label>)}<label className="block text-sm font-medium">Estimated pipeline value<input type="number" min="0" max="9999999999" step="0.01" value={form.estimated_value ?? "0"} onChange={e=>setForm({...form,estimated_value:e.target.value})} className="mt-2 w-full border rounded-xl px-4 py-3"/></label>{editing && <label className="block text-sm font-medium">Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="mt-2 w-full border rounded-xl px-4 py-3">{["New","Qualified","Contacted","Follow-up","Closed"].map(status=><option key={status}>{status}</option>)}</select></label>}<button disabled={saving} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl">{saving ? "Saving..." : editing ? "Save changes" : "Save lead"}</button></form></div></div>}
  </div>;
}
function LeadTable({leads,search,setSearch,filter,setFilter,compact=false,onViewAll,onEdit,onDelete,deletingId,onScore,scoringId,onFollowup}) {
  const [insightLead, setInsightLead] = useState(null);
  const selectedLead = leads.find(lead => lead.id === insightLead);
  return <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div className="p-6 flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-lg font-bold">{compact?'Recent leads':'Lead directory'}</h3><p className="text-slate-400 text-xs mt-1">Saved records · {leads.length} shown</p></div><div className="flex flex-wrap gap-2"><input aria-label="Search leads" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search leads..." className="border border-slate-200 rounded-xl px-4 py-2 text-sm w-44 sm:w-56 focus:ring-2 focus:ring-indigo-500 outline-none"/><select aria-label="Filter lead status" value={filter} onChange={e=>setFilter(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">{['All','New','Qualified','Contacted','Follow-up','Closed'].map(s=><option key={s}>{s}</option>)}</select></div></div><div className="overflow-x-auto"><table className="w-full text-left min-w-[700px]"><thead className="bg-slate-50 border-y border-slate-100 text-[11px] uppercase tracking-wider text-slate-400"><tr>{['Lead','Company','Source','AI score','Status','Added','Actions'].map(h=><th key={h} className="px-6 py-4 font-semibold">{h}</th>)}</tr></thead><tbody>{leads.length?leads.slice(0,compact?5:undefined).map(l=><tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="px-6 py-4"><div className="font-semibold text-sm">{l.name}</div><div className="text-xs text-slate-400 mt-1">{l.email}</div></td><td className="px-6 py-4 text-sm text-slate-600">{l.company}</td><td className="px-6 py-4 text-sm text-slate-500">{l.source}</td><td className="px-6 py-4"><div className="flex flex-col items-start gap-2">{l.score != null && l.ai_reason ? <><span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${l.score>=75?'bg-emerald-50 text-emerald-700':l.score>=50?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-700'}`}>{l.score}/100</span><button onClick={()=>setInsightLead(l.id)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap">View AI insights →</button></> : <span className="text-xs text-slate-400">Not scored</span>}</div></td><td className="px-6 py-4"><span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${l.status==='Qualified'?'bg-emerald-50 text-emerald-700':l.status==='Contacted'?'bg-indigo-50 text-indigo-700':l.status==='Follow-up'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-600'}`}>{l.status}</span></td><td className="px-6 py-4 text-sm text-slate-400">{l.date}</td><td className="px-6 py-4"><div className="flex items-center gap-2 whitespace-nowrap"><button disabled={!!scoringId} onClick={()=>onScore(l)} className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">{scoringId===l.id?'Scoring...':l.ai_reason?'↻ Rescore':'✧ Score with AI'}</button><button onClick={()=>onFollowup(l)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">✉ Follow-up</button><button onClick={()=>onEdit(l)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button><button disabled={deletingId===l.id} onClick={()=>onDelete(l)} className="rounded-lg px-2 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{deletingId===l.id?'Deleting...':'Delete'}</button></div></td></tr>):<tr><td colSpan="7" className="px-6 py-12 text-center text-slate-400 text-sm">No matching leads found.</td></tr>}</tbody></table></div>{compact&&<div className="px-6 py-4 border-t border-slate-100"><button onClick={onViewAll} className="text-sm font-semibold text-indigo-600 hover:underline">View all leads →</button></div>}{selectedLead && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setInsightLead(null)}}><div role="dialog" aria-modal="true" aria-label="AI lead insights" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">GrowthPilot AI · Lead intelligence</p><h3 className="mt-2 text-xl font-bold text-slate-900">{selectedLead.company}</h3><p className="mt-1 text-sm text-slate-500">{selectedLead.name}</p></div><button aria-label="Close AI insights" onClick={()=>setInsightLead(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50">✕</button></div><div className="mt-6 flex items-center gap-4 rounded-xl bg-slate-50 p-4"><div className="rounded-xl bg-white px-4 py-3 text-2xl font-extrabold text-indigo-700 shadow-sm">{selectedLead.score}<span className="text-sm text-slate-400">/100</span></div><div><p className="font-semibold text-slate-800">AI lead score</p><p className="text-xs text-slate-500">AI-generated assessment based on saved lead information</p></div></div><div className="mt-6"><h4 className="text-sm font-bold text-slate-900">Assessment</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{selectedLead.ai_reason || 'No assessment available yet.'}</p></div><div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><h4 className="text-sm font-bold text-indigo-900">Recommended next action</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedLead.ai_next_action || 'No recommendation available yet.'}</p></div><p className="mt-5 text-xs text-slate-400">AI scores are estimates, not guarantees of conversion.</p><button onClick={()=>setInsightLead(null)} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800">Done</button></div></div>}</section>;
}
export default App;
