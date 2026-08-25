import { Bot, Cable, Gauge, Megaphone, Users } from 'lucide-react'

const fmt = number => new Intl.NumberFormat('he-IL').format(number || 0)
const status = (rows = [], name) => rows.find(row => row.status === name)?._count?._all || 0
const provider = (rows = [], name) => rows.filter(row => row.provider === name).reduce((sum, row) => sum + row._count._all, 0)
function Metric({ label, metric, note, tone = '' }) { return <div className={`ops-metric ${tone}`}><small>{label}</small><strong>{metric}</strong>{note && <span>{note}</span>}</div> }

export default function OperationsInsights({ data }) {
  if (!data) return null
  const { system, publishing, integrations, business, ai } = data
  return <div className="ops-insights">
    <section className="ops-panel"><h2><Gauge size={20}/> בריאות המערכת</h2><div className="ops-metric-grid">
      <Metric label="בקשות API" metric={fmt(system.requests)} note={`${system.requestChange >= 0 ? '+' : ''}${system.requestChange}% מתקופה קודמת`}/>
      <Metric label="שיעור שגיאות" metric={`${system.errorRate}%`} note={`${system.affectedUsers} משתמשים הושפעו`} tone={system.errorRate > 5 ? 'bad' : 'good'}/>
      <Metric label="זמן תגובה ממוצע" metric={`${system.avgLatencyMs}ms`} note={`מקסימום ${system.maxLatencyMs}ms`} tone={system.avgLatencyMs > 1000 ? 'warn' : 'good'}/>
    </div></section>
    <section className="ops-panel"><h2><Megaphone size={20}/> פרסומים ותורים</h2><div className="ops-metric-grid">
      <Metric label="שיעור הצלחה" metric={`${publishing.successRate}%`} note={`${publishing.success} הצליחו · ${publishing.failed} נכשלו`} tone={publishing.successRate < 90 && publishing.total ? 'bad' : 'good'}/>
      <Metric label="פרסומים בתקופה" metric={fmt(publishing.total)} note={`${publishing.totalChange >= 0 ? '+' : ''}${publishing.totalChange}% מתקופה קודמת`}/>
      <Metric label="עבודות ממתינות" metric={fmt(status(publishing.jobs, 'PENDING'))} note={`${status(publishing.jobs, 'FAILED')} עבודות נכשלו`} tone={status(publishing.jobs, 'FAILED') ? 'warn' : ''}/>
    </div><div className="ops-platforms">{publishing.byPlatform.map(row => <span key={`${row.platform}-${row.status}`}>{row.platform}: {row.status === 'SUCCESS' ? 'הצליחו' : 'נכשלו'} {row._count._all}</span>)}</div></section>
    <section className="ops-panel"><h2><Cable size={20}/> חיבורים ואינטגרציות</h2><div className="ops-metric-grid">
      <Metric label="Facebook" metric={fmt(provider(integrations.accounts, 'FACEBOOK'))} note={`${status(integrations.accounts.filter(x => x.provider === 'FACEBOOK'), 'ACTIVE')} פעילים`}/>
      <Metric label="Instagram" metric={fmt(provider(integrations.accounts, 'INSTAGRAM'))} note={`${status(integrations.accounts.filter(x => x.provider === 'INSTAGRAM'), 'ACTIVE')} פעילים`}/>
      <Metric label="WhatsApp" metric={fmt(integrations.whatsappConnected)} note="סשנים מחוברים כרגע"/>
    </div></section>
    <section className="ops-panel"><h2><Users size={20}/> שימוש עסקי</h2><div className="ops-metric-grid">
      <Metric label="משתמשים פעילים" metric={fmt(business.activeUsers)} note={`מתוך ${business.totalUsers} משתמשים`}/><Metric label="משתמשים חדשים" metric={fmt(business.newUsers)} note="בתקופה שנבחרה"/><Metric label="יוצרי פוסטים" metric={fmt(business.creators)} note={`${business.postsCreated} פוסטים נוצרו`}/>
    </div></section>
    <section className="ops-panel"><h2><Bot size={20}/> שימוש ב-AI</h2><div className="ops-metric-grid">
      <Metric label="יצירות שהושלמו" metric={fmt(ai.requests)} note={`${ai.users} משתמשים ייחודיים`}/><Metric label="שיעור הצלחה" metric={`${ai.successRate}%`} note={`${ai.failures} שגיאות`} tone={ai.failures ? 'warn' : 'good'}/><Metric label="טוקנים" metric={fmt(ai.totalTokens)} note={`זמן ממוצע ${ai.avgLatencyMs}ms`}/>
    </div></section>
    {!!publishing.recentFailures.length && <section className="ops-panel ops-failures"><h2>כשלי פרסום אחרונים</h2>{publishing.recentFailures.map(item => <div key={item.id}><b>{item.platform}</b><span>{item.user?.name || item.user?.email || 'משתמש לא ידוע'}</span><p>{item.errorMessage || 'לא נשמר פירוט שגיאה'}</p></div>)}</section>}
  </div>
}
