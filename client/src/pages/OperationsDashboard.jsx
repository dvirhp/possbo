import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Clock3, RefreshCw, Search, Server, ShieldAlert } from 'lucide-react'
import OperationsInsights from '../components/OperationsInsights'
import { operationsService } from '../services/operationsService'
import '../styles/operations-dashboard.css'

const labels = { error: 'שגיאה', warn: 'אזהרה', info: 'מידע' }
export default function OperationsDashboard() {
  const [summary, setSummary] = useState(null), [insights, setInsights] = useState(null), [events, setEvents] = useState([])
  const [filters, setFilters] = useState({ hours: 24, level: '', search: '' })
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [selected, setSelected] = useState(null)
  const load = useCallback(async () => { setLoading(true); setError(''); try {
    const [a, b, c] = await Promise.all([operationsService.summary(filters.hours), operationsService.events({ level: filters.level || undefined, search: filters.search || undefined, limit: 100 }), operationsService.insights(filters.hours)])
    setSummary(a.data); setEvents(b.data.events || []); setInsights(c.data)
  } catch (requestError) { setError(requestError.response?.data?.error || 'לא ניתן לטעון את נתוני המערכת') } finally { setLoading(false) } }, [filters])
  useEffect(() => { load() }, [load])
  const count = level => summary?.levels?.find(item => item.level === level)?._count?._all || 0
  return <main className="ops-page" dir="rtl">
    <header className="ops-header"><div><span><Activity size={18}/> ניטור מרכזי</span><h1>לוגים ותקינות המערכת</h1><p>בריאות המערכת, פרסומים, אינטגרציות, שימוש עסקי וכל אירועי המערכת במקום אחד.</p></div><button onClick={load} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''}/> רענון</button></header>
    <section className="ops-kpis"><article><Activity/><div><small>כל האירועים</small><strong>{summary?.total ?? '—'}</strong></div></article><article className="danger"><ShieldAlert/><div><small>שגיאות</small><strong>{count('error')}</strong></div></article><article className="warning"><AlertTriangle/><div><small>אזהרות</small><strong>{count('warn')}</strong></div></article><article className={summary?.workerHealthy ? '' : 'danger'}><Server/><div><small>מצב Worker</small><strong>{summary?.workerHealthy ? 'תקין' : 'לא זמין'}</strong></div></article></section>
    <OperationsInsights data={insights}/>
    <section className="ops-filters"><label><Clock3 size={15}/><select value={filters.hours} onChange={e => setFilters(v => ({ ...v, hours: Number(e.target.value) }))}><option value="1">שעה</option><option value="24">24 שעות</option><option value="168">7 ימים</option><option value="720">30 ימים</option></select></label><select value={filters.level} onChange={e => setFilters(v => ({ ...v, level: e.target.value }))}><option value="">כל הרמות</option><option value="error">שגיאות</option><option value="warn">אזהרות</option><option value="info">מידע</option></select><label className="ops-search"><Search size={16}/><input value={filters.search} onChange={e => setFilters(v => ({ ...v, search: e.target.value }))} placeholder="חיפוש..."/></label></section>
    {error && <div className="ops-error">{error}</div>}<section className="ops-table-wrap"><table className="ops-table"><thead><tr><th>זמן</th><th>רמה</th><th>משתמש</th><th>שירות / מודול</th><th>אירוע</th><th>הודעה</th><th>סטטוס</th><th>משך</th><th>Request ID</th></tr></thead><tbody>{events.map(x => <tr key={x.id} onClick={() => setSelected(x)} className="ops-clickable"><td>{new Date(x.timestamp).toLocaleString('he-IL')}</td><td><span className={`ops-level ${x.level}`}>{labels[x.level] || x.level}</span></td><td>{x.user?.name || x.user?.email || x.userId || 'מערכת'}</td><td>{x.service} / {x.module}</td><td>{x.event}</td><td title={x.message}>{x.message}</td><td>{x.statusCode || '—'}</td><td>{x.durationMs != null ? `${x.durationMs}ms` : '—'}</td><td className="ops-request">{x.requestId || '—'}</td></tr>)}</tbody></table>{!loading && !events.length && <p className="ops-empty">לא נמצאו אירועים.</p>}</section>
    {selected && <div className="ops-modal" onClick={() => setSelected(null)}><article onClick={e => e.stopPropagation()}><button onClick={() => setSelected(null)}>×</button><h2>פרטי אירוע מלאים</h2><dl><dt>משתמש</dt><dd>{selected.user?.name || '—'} · {selected.user?.email || '—'} · {selected.userId || '—'}</dd><dt>הודעה</dt><dd>{selected.message}</dd><dt>קוד שגיאה</dt><dd>{selected.errorCode || '—'}</dd><dt>Request ID</dt><dd>{selected.requestId || '—'}</dd></dl>{selected.errorStack && <><h3>Stack trace</h3><pre>{selected.errorStack}</pre></>}<h3>Metadata</h3><pre>{JSON.stringify(selected.metadata, null, 2)}</pre></article></div>}
  </main>
}
