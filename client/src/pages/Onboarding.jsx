import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Circle, RefreshCw, ShieldCheck, PlugZap } from 'lucide-react'
import { useAppData } from '../context/DataProvider'
import '../styles/onboarding.css'

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, campaigns, posts, jobs, recentCampaigns, checkAuth, forceRefresh, refreshing } = useAppData()
  const [checking, setChecking] = useState(false)
  const connections = [
    { name: 'Facebook', connected: Boolean(user?.fbSessionValid), detail: user?.fbSessionValid ? 'החיבור פעיל ומוכן לפרסום' : 'נדרש חיבור או חידוש session' },
    { name: 'Instagram', connected: Boolean(user?.instagramConnected), detail: user?.instagramConnected ? `מחובר${user?.instagramUsername ? ` כ-@${user.instagramUsername}` : ''}` : 'נדרש חשבון Business או Creator' },
    { name: 'WhatsApp', connected: Boolean(user?.whatsappSessionConnected), detail: user?.whatsappSessionConnected ? (user?.whatsappSessionPhone || 'החיבור פעיל') : 'נדרש סריקת QR וחיבור פעיל' },
  ]
  const hasConnection = connections.some(item => item.connected)
  const hasDraft = campaigns.length > 0 || (recentCampaigns?.drafts?.length || 0) > 0
  const hasPublication = posts.length > 0 || jobs.length > 0 || (recentCampaigns?.history?.length || 0) > 0
  const steps = useMemo(() => [
    { label: 'אימות כתובת המייל', description: 'מגן על החשבון ומאפשר שחזור גישה.', done: Boolean(user?.emailVerified), action: () => navigate('/dashboard?tab=account'), actionLabel: 'בדיקת החשבון' },
    { label: 'חיבור פלטפורמה ראשונה', description: 'מספיק לחבר פלטפורמה אחת כדי להתחיל.', done: hasConnection, action: () => navigate('/dashboard?tab=account'), actionLabel: 'לחיבור חשבונות' },
    { label: 'יצירת טיוטה ראשונה', description: 'כתבו פוסט או ייבאו טיוטות מקובץ CSV.', done: hasDraft, action: () => navigate('/create-post'), actionLabel: 'יצירת פוסט' },
    { label: 'תזמון או פרסום ראשון', description: 'בדקו את ה-preview ובחרו פרסום מיידי או מתוזמן.', done: hasPublication, action: () => navigate('/create-post'), actionLabel: 'המשך לפרסום' },
  ], [user?.emailVerified, hasConnection, hasDraft, hasPublication, navigate])
  const completed = steps.filter(step => step.done).length
  const percent = Math.round((completed / steps.length) * 100)

  const refreshHealth = async () => {
    setChecking(true)
    try { await checkAuth(); await forceRefresh() } finally { setChecking(false) }
  }

  return <main className="onboarding-page" dir="rtl">
    <header className="onboarding-header"><div><span>התחלה מהירה</span><h1>מכינים את Possbo לפרסום</h1><p>ההתקדמות מתעדכנת אוטומטית לפי מצב החשבון.</p></div><div className="onboarding-score"><b>{percent}%</b><small>{completed} מתוך {steps.length}</small></div></header>
    <div className="onboarding-progress" aria-label={`${percent}% הושלמו`}><span style={{ width: `${percent}%` }}/></div>
    <section className="onboarding-grid">
      <div className="onboarding-card"><h2><ShieldCheck/> Checklist</h2>{steps.map(step => <div className={`onboarding-step ${step.done ? 'done' : ''}`} key={step.label}><span className="onboarding-step-icon">{step.done ? <Check/> : <Circle/>}</span><div><strong>{step.label}</strong><p>{step.description}</p></div>{!step.done && <button type="button" onClick={step.action}>{step.actionLabel}</button>}</div>)}</div>
      <div className="onboarding-card"><div className="onboarding-card-title"><h2><PlugZap/> תקינות חיבורים</h2><button type="button" className="onboarding-refresh" onClick={refreshHealth} disabled={checking || refreshing}><RefreshCw className={checking || refreshing ? 'spin' : ''}/> בדיקה מחדש</button></div>{connections.map(connection => <div className={`onboarding-connection ${connection.connected ? 'healthy' : ''}`} key={connection.name}><span/><div><strong>{connection.name}</strong><p>{connection.detail}</p></div><b>{connection.connected ? 'תקין' : 'לא מחובר'}</b></div>)}<p className="onboarding-optional">אין חובה לחבר את כל הפלטפורמות. חברו רק את הערוצים שבהם אתם מפרסמים.</p></div>
    </section>
  </main>
}
