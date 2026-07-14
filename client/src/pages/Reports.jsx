import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { groupsService } from '../services/groupsService'
import { FileText, Download, Calendar, TrendingUp, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Eye, X, ExternalLink } from 'lucide-react'
import '../styles/reports.css'

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'יומי' },
  { value: 'weekly', label: 'שבועי' },
  { value: 'monthly', label: 'חודשי' },
  { value: 'custom', label: 'מותאם אישית' },
]

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function ReportsDatePicker({ initialFrom, initialTo, onApply, onCancel, period, onPeriodChange }) {
  const toDS = (d) => d.toISOString().split('T')[0]
  const [calMonth, setCalMonth] = useState(() => {
    const d = initialFrom ? new Date(initialFrom) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [rangeStart, setRangeStart] = useState(initialFrom || '')
  const [rangeEnd, setRangeEnd] = useState(initialTo || '')
  const [hoverDate, setHoverDate] = useState(null)
  const [manualFrom, setManualFrom] = useState(initialFrom || '')
  const [manualTo, setManualTo] = useState(initialTo || '')

  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const monthName = calMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  const dayToStr = (day) => toDS(new Date(year, month, day))

  const isInRange = (day) => {
    if (!day) return false
    const ds = dayToStr(day)
    const end = rangeEnd || hoverDate || ''
    if (!rangeStart) return false
    if (!end) return ds === rangeStart
    const min = rangeStart < end ? rangeStart : end
    const max = rangeStart < end ? end : rangeStart
    return ds >= min && ds <= max
  }

  const isStart = (day) => day && dayToStr(day) === rangeStart
  const isEnd = (day) => day && dayToStr(day) === (rangeEnd || hoverDate)

  const handleDayClick = (day) => {
    const ds = dayToStr(day)
    if (!rangeStart || rangeEnd) {
      setRangeStart(ds); setRangeEnd(''); setManualFrom(ds); setManualTo('')
    } else {
      let from = rangeStart, to = ds
      if (from > to) [from, to] = [to, from]
      setRangeStart(from); setRangeEnd(to); setManualFrom(from); setManualTo(to)
      onApply(from, to)
    }
  }

  const handlePreset = (numDays) => {
    const to = toDS(new Date())
    const from = toDS(new Date(Date.now() - numDays * 24 * 60 * 60 * 1000))
    onApply(from, to)
  }

  const handleManualApply = () => {
    if (manualFrom) {
      const to = manualTo || toDS(new Date())
      manualFrom > to ? onApply(to, manualFrom) : onApply(manualFrom, to)
    }
  }

  return (
    <div className="drp-dropdown">
      <div className="drp-period-row">
        {PERIOD_OPTIONS.filter(o => o.value !== 'custom').map(opt => (
          <button
            key={opt.value}
            className={`drp-period-btn ${period === opt.value ? 'active' : ''}`}
            onClick={() => onPeriodChange(opt.value)}
          >{opt.label}</button>
        ))}
      </div>
      <div className="drp-calendar">
        <div className="drp-cal-nav">
          <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span>{monthName}</span>
          <button onClick={() => setCalMonth(new Date(year, month - 1, 1))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div className="drp-cal-grid">
          {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map(d => <span key={d} className="drp-weekday">{d}</span>)}
          {days.map((day, i) => (
            <span key={i}
              className={`drp-day ${!day ? 'empty' : ''} ${day && isInRange(day) ? 'in-range' : ''} ${day && isStart(day) ? 'range-start' : ''} ${day && isEnd(day) ? 'range-end' : ''} ${day && dayToStr(day) === toDS(today) ? 'today' : ''}`}
              onClick={() => day && handleDayClick(day)}
              onMouseEnter={() => { if (rangeStart && !rangeEnd && day) setHoverDate(dayToStr(day)) }}
            >{day || ''}</span>
          ))}
        </div>
      </div>
      <div className="drp-inputs">
        <div className="drp-input-group"><label>מ-</label><input type="date" value={manualFrom} onChange={e => { setManualFrom(e.target.value); setRangeStart(e.target.value) }} onKeyDown={e => e.key === 'Enter' && handleManualApply()} /></div>
        <div className="drp-input-group"><label>עד</label><input type="date" value={manualTo} onChange={e => { setManualTo(e.target.value); setRangeEnd(e.target.value) }} onKeyDown={e => e.key === 'Enter' && handleManualApply()} /></div>
      </div>
      <div className="drp-presets">
        <button onClick={() => handlePreset(7)}>7 ימים</button>
        <button onClick={() => handlePreset(14)}>14 ימים</button>
        <button onClick={() => handlePreset(30)}>30 ימים</button>
        <button onClick={() => handlePreset(90)}>90 ימים</button>
      </div>
      <div className="drp-actions">
        <button className="drp-cancel" onClick={onCancel}>ביטול</button>
        <button className="drp-apply" onClick={handleManualApply}>החל</button>
      </div>
    </div>
  )
}

export default function Reports() {
  const navigate = useNavigate()
  const { user, authChecked, posts, campaigns, groups, jobs, ensureFresh } = useAppData()
  const [period, setPeriod] = useState('weekly')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showMoreHistory, setShowMoreHistory] = useState(false)
  const [showMoreScheduled, setShowMoreScheduled] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [kpiPopup, setKpiPopup] = useState(null) // 'success' | 'failed' | null
  const [selectedItem, setSelectedItem] = useState(null) // post detail popup
  const datePickerRef = useRef(null)

  useEffect(() => {
    if (authChecked && !user) navigate('/login')
  }, [authChecked, user, navigate])

  // Ensure data is fresh when opening reports
  useEffect(() => {
    ensureFresh()
  }, [])

  // Close date picker on outside click
  useEffect(() => {
    if (!showDatePicker) return
    const handler = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setShowDatePicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDatePicker])

  // Compute the effective start date for filtering
  const startDate = useMemo(() => {
    if (period === 'custom' && dateRange.from) {
      return new Date(dateRange.from)
    }
    const now = new Date()
    if (period === 'daily') { const d = new Date(); d.setDate(now.getDate() - 1); return d }
    if (period === 'weekly') { const d = new Date(); d.setDate(now.getDate() - 7); return d }
    const d = new Date(); d.setMonth(now.getMonth() - 1); return d
  }, [period, dateRange])

  const endDate = useMemo(() => {
    if (period === 'custom' && dateRange.to) {
      const d = new Date(dateRange.to)
      d.setHours(23, 59, 59, 999)
      return d
    }
    return new Date()
  }, [period, dateRange])

  // Open a detail popup for a publication history item
  const openDetail = useCallback((item) => {
    // Find matching publication from posts array to get full data
    const pub = posts?.find(p => p.id === item.id)
    // Find matching campaign from campaigns array
    const postId = pub?.postId || pub?.post?.id || item.postId
    const campaign = campaigns?.find(c => c.id === postId)
    setSelectedItem({
      ...item,
      post: pub?.post || campaign || null,
      group: pub?.group || null,
      postUrl: pub?.postUrl || pub?.externalPostUrl || null,
      publishedAt: pub?.publishedAt || item.date,
      images: campaign?.images || pub?.post?.images || [],
      content: campaign?.content || pub?.post?.content || '',
      title: campaign?.title || pub?.post?.title || item.campaignName,
    })
  }, [posts, campaigns])

  // Compute stats based on period
  const stats = useMemo(() => {
    if (!posts?.length) return { total: 0, success: 0, failed: 0, successRate: 0, groups: 0, exposure: 0 }

    const filtered = posts.filter(p => {
      const d = new Date(p.publishedAt || p.createdAt)
      return d >= startDate && d <= endDate
    })
    const success = filtered.filter(p => p.status === 'SUCCESS').length
    const failed = filtered.filter(p => p.status === 'FAILED').length
    const total = filtered.length
    const uniqueGroups = new Set(filtered.map(p => p.groupId).filter(Boolean)).size
    const exposure = filtered.reduce((sum, p) => sum + (p.groupMemberCount || 0), 0)

    return { total, success, failed, successRate: total ? Math.round((success / total) * 100) : 0, groups: uniqueGroups, exposure }
  }, [posts, startDate, endDate])

  // Recent activity log
  const recentActivity = useMemo(() => {
    if (!posts?.length) return []
    return [...posts]
      .filter(p => {
        const d = new Date(p.publishedAt || p.createdAt)
        return d >= startDate && d <= endDate
      })
      .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
      .slice(0, showMoreHistory ? 30 : 10)
      .map(p => ({
        id: p.id,
        postId: p.postGroupId || p.postId || p.id,
        campaignName: p.post?.title || p.campaignTitle || p.title || p.post?.content?.slice(0, 40) || 'ללא שם',
        groupName: p.group?.name || p.groupName || 'לא ידוע',
        status: p.status,
        date: p.publishedAt || p.createdAt,
        error: p.errorMessage || p.error,
      }))
  }, [posts, showMoreHistory, startDate, endDate])

  // Success/Failed lists for KPI popups
  const successList = useMemo(() => {
    if (!posts?.length) return []
    return [...posts]
      .filter(p => {
        const d = new Date(p.publishedAt || p.createdAt)
        return d >= startDate && d <= endDate && p.status === 'SUCCESS'
      })
      .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
      .map(p => ({
        id: p.id,
        postId: p.postGroupId || p.postId || p.id,
        campaignName: p.post?.title || p.campaignTitle || p.title || p.post?.content?.slice(0, 40) || 'ללא שם',
        groupName: p.group?.name || p.groupName || 'לא ידוע',
        date: p.publishedAt || p.createdAt,
      }))
  }, [posts, startDate, endDate])

  const failedList = useMemo(() => {
    if (!posts?.length) return []
    return [...posts]
      .filter(p => {
        const d = new Date(p.publishedAt || p.createdAt)
        return d >= startDate && d <= endDate && p.status === 'FAILED'
      })
      .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
      .map(p => ({
        id: p.id,
        postId: p.postGroupId || p.postId || p.id,
        campaignName: p.post?.title || p.campaignTitle || p.title || p.post?.content?.slice(0, 40) || 'ללא שם',
        groupName: p.group?.name || p.groupName || 'לא ידוע',
        date: p.publishedAt || p.createdAt,
        error: p.errorMessage || p.error || null,
      }))
  }, [posts, startDate, endDate])

  // Upcoming scheduled — combine pending jobs + scheduled campaigns
  const upcoming = useMemo(() => {
    const now = new Date()
    const items = []
    const seen = new Set()

    // Pending jobs with scheduled times
    if (jobs?.length) {
      jobs.forEach(j => {
        if ((j.status === 'PENDING' || j.status === 'RUNNING') && j.scheduledAt) {
          const key = `job-${j.id}`
          if (!seen.has(key)) {
            seen.add(key)
            items.push({
              id: j.id,
              postId: j.postGroup?.post?.id || j.postGroupId || j.id,
              campaignName: j.postGroup?.post?.title || j.postGroup?.post?.content?.slice(0, 40) || 'ללא שם',
              groupName: j.postGroup?.group?.name || 'קבוצה',
              scheduledAt: j.scheduledAt,
            })
          }
        }
      })
    }

    // Campaigns with scheduledAt that haven't been fully published
    if (campaigns?.length) {
      campaigns.forEach(c => {
        if (c.scheduledAt && (c.status === 'scheduled' || c.status === 'recurring' || c.status === 'active') && !c.isPaused) {
          const key = `campaign-${c.id}`
          if (!seen.has(key)) {
            // Don't add if we already have jobs for this campaign
            const hasJob = items.some(i => i.postId === c.id)
            if (!hasJob) {
              seen.add(key)
              const groupName = c.groupNames?.join(', ') || `${c.groupCount || 0} קבוצות`
              items.push({
                id: c.id,
                postId: c.id,
                campaignName: c.title || c.content?.substring(0, 40) || 'ללא שם',
                groupName,
                scheduledAt: c.scheduledAt,
              })
            }
          }
        }
      })
    }

    return items
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      .slice(0, showMoreScheduled ? 20 : 7)
  }, [jobs, campaigns, showMoreScheduled])

  const formatDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  const formatNumber = (n) => {
    if (!n) return '0'
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return n.toString()
  }

  const handleDownloadPDF = async () => {
    setGenerating(true)
    try {
      // Generate PDF report using browser print
      const content = document.querySelector('.reports-content')
      const printWindow = window.open('', '_blank')
      printWindow.document.write(`
        <html dir="rtl">
        <head>
          <title>דוח PostIt - ${period === 'daily' ? 'יומי' : period === 'weekly' ? 'שבועי' : 'חודשי'}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #222; direction: rtl; }
            h1 { color: #6366f1; font-size: 24px; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
            h2 { color: #333; font-size: 18px; margin-top: 32px; }
            .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0; }
            .kpi { border: 1px solid #ddd; border-radius: 8px; padding: 16px; text-align: center; }
            .kpi-val { font-size: 28px; font-weight: 700; color: #6366f1; }
            .kpi-label { font-size: 12px; color: #666; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { background: #f5f5f5; padding: 8px 12px; text-align: right; border-bottom: 2px solid #ddd; font-size: 12px; }
            td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
            .success { color: #16a34a; font-weight: 600; }
            .failed { color: #dc2626; font-weight: 600; }
            .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; }
          </style>
        </head>
        <body>
          <h1>📊 דוח פעילות PostIt</h1>
          <p>תקופה: ${period === 'daily' ? 'יומי (24 שעות אחרונות)' : period === 'weekly' ? 'שבועי (7 ימים אחרונים)' : 'חודשי (30 ימים אחרונים)'}</p>
          <p>תאריך הפקה: ${new Date().toLocaleDateString('he-IL')}</p>
          
          <div class="kpis">
            <div class="kpi"><div class="kpi-val">${stats.total}</div><div class="kpi-label">סה"כ פרסומים</div></div>
            <div class="kpi"><div class="kpi-val">${stats.success}</div><div class="kpi-label">הצליחו</div></div>
            <div class="kpi"><div class="kpi-val">${stats.failed}</div><div class="kpi-label">נכשלו</div></div>
            <div class="kpi"><div class="kpi-val">${stats.successRate}%</div><div class="kpi-label">אחוז הצלחה</div></div>
            <div class="kpi"><div class="kpi-val">${stats.groups}</div><div class="kpi-label">קבוצות פעילות</div></div>
            <div class="kpi"><div class="kpi-val">${formatNumber(stats.exposure)}</div><div class="kpi-label">חשיפה משוערת</div></div>
          </div>

          <h2>היסטוריית פרסומים</h2>
          <table>
            <thead><tr><th>שם קמפיין</th><th>קבוצת פרסום</th><th>סטטוס</th><th>תאריך</th></tr></thead>
            <tbody>
              ${recentActivity.map(a => `
                <tr>
                  <td>${a.campaignName}</td>
                  <td>${a.groupName}</td>
                  <td class="${a.status === 'SUCCESS' ? 'success' : 'failed'}">${a.status === 'SUCCESS' ? '✅ הצלחה' : '❌ נכשל'}</td>
                  <td>${formatDate(a.date)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${upcoming.length ? `
            <h2>פרסומים מתוזמנים</h2>
            <table>
              <thead><tr><th>קבוצה</th><th>כותרת</th><th>תאריך תזמון</th></tr></thead>
              <tbody>
                ${upcoming.map(u => `<tr><td>${u.groupName}</td><td>${u.postTitle || '-'}</td><td>${formatDate(u.scheduledAt)}</td></tr>`).join('')}
              </tbody>
            </table>
          ` : ''}

          <div class="footer">הופק אוטומטית על ידי PostIt • ${new Date().toLocaleDateString('he-IL')}</div>
        </body>
        </html>
      `)
      printWindow.document.close()
      setTimeout(() => { printWindow.print() }, 500)
    } catch {
      // fallback
    } finally {
      setGenerating(false)
    }
  }

  if (!authChecked || !user) return null

  return (
    <div className="reports-page">
      <div className="reports-topbar">
        <h1 className="reports-title">דוחות וסיכום</h1>
        <div className="reports-topbar-actions">
          <div className="reports-date-wrap" ref={datePickerRef}>
            <button className="dash-date-btn" onClick={() => setShowDatePicker(!showDatePicker)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {period === 'custom' && dateRange.from
                ? `${new Date(dateRange.from).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} – ${new Date(dateRange.to).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}`
                : PERIOD_OPTIONS.find(o => o.value === period)?.label || 'שבועי'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showDatePicker && (
              <ReportsDatePicker
                initialFrom={dateRange.from}
                initialTo={dateRange.to}
                period={period}
                onPeriodChange={(p) => { setPeriod(p); setShowDatePicker(false) }}
                onApply={(from, to) => { setPeriod('custom'); setDateRange({ from, to }); setShowDatePicker(false) }}
                onCancel={() => setShowDatePicker(false)}
              />
            )}
          </div>
          <button className="reports-download-btn" onClick={handleDownloadPDF} disabled={generating}>
            <Download size={16} />
            {generating ? 'מפיק...' : 'הורד PDF'}
          </button>
        </div>
      </div>

      <div className="reports-content">

        {/* KPI Cards */}
        <div className="reports-kpis">
          <div className="reports-kpi">
            <div className="reports-kpi-icon"><FileText size={22} /></div>
            <div className="reports-kpi-val">{stats.total}</div>
            <div className="reports-kpi-label">סה"כ פרסומים</div>
          </div>
          <div className="reports-kpi success clickable" onClick={() => stats.success > 0 && setKpiPopup('success')}>
            <div className="reports-kpi-icon"><CheckCircle size={22} /></div>
            <div className="reports-kpi-val">{stats.success}</div>
            <div className="reports-kpi-label">הצליחו</div>
          </div>
          <div className="reports-kpi failed clickable" onClick={() => stats.failed > 0 && setKpiPopup('failed')}>
            <div className="reports-kpi-icon"><XCircle size={22} /></div>
            <div className="reports-kpi-val">{stats.failed}</div>
            <div className="reports-kpi-label">נכשלו</div>
          </div>
          <div className="reports-kpi">
            <div className="reports-kpi-icon"><TrendingUp size={22} /></div>
            <div className="reports-kpi-val">{stats.successRate}%</div>
            <div className="reports-kpi-label">אחוז הצלחה</div>
          </div>
          <div className="reports-kpi">
            <div className="reports-kpi-icon"><Calendar size={22} /></div>
            <div className="reports-kpi-val">{stats.groups}</div>
            <div className="reports-kpi-label">קבוצות פעילות</div>
          </div>
          <div className="reports-kpi">
            <div className="reports-kpi-icon"><Eye size={22} /></div>
            <div className="reports-kpi-val">{formatNumber(stats.exposure)}</div>
            <div className="reports-kpi-label">חשיפה משוערת</div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="reports-section">
          <h2 className="reports-section-title">פעילות אחרונה</h2>
          {recentActivity.length === 0 ? (
            <div className="reports-empty">אין פעילות לתצוגה</div>
          ) : (
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>שם קמפיין</th>
                    <th>קבוצת פרסום</th>
                    <th>סטטוס</th>
                    <th>תאריך</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map(a => (
                    <tr key={a.id} onClick={() => openDetail(a)}>
                      <td className="reports-cell-campaign">{a.campaignName}</td>
                      <td className="reports-cell-group">{a.groupName}</td>
                      <td>
                        <span className={`reports-status ${a.status === 'SUCCESS' ? 'success' : 'failed'}`}>
                          {a.status === 'SUCCESS' ? <><CheckCircle size={14} /> הצלחה</> : <><XCircle size={14} /> נכשל</>}
                        </span>
                      </td>
                      <td className="reports-cell-date">{formatDate(a.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {posts?.length > 10 && (
                <button className="reports-show-more" onClick={() => setShowMoreHistory(!showMoreHistory)}>
                  {showMoreHistory ? <><ChevronUp size={14} /> הצג פחות</> : <><ChevronDown size={14} /> הצג עוד</>}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Upcoming Scheduled */}
        <div className="reports-section">
          <h2 className="reports-section-title">
            <Clock size={18} />
            מתוזמן בקרוב
          </h2>
          {upcoming.length === 0 ? (
            <div className="reports-empty">אין פרסומים מתוזמנים</div>
          ) : (
            <div className="reports-table-wrap">
              <table className="reports-table scheduled">
                <thead>
                  <tr>
                    <th>שם קמפיין</th>
                    <th>קבוצת פרסום</th>
                    <th>סטטוס</th>
                    <th>תאריך תזמון</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map(u => (
                    <tr key={u.id} onClick={() => navigate(`/post/${u.postId}`)}>
                      <td className="reports-cell-campaign">{u.campaignName}</td>
                      <td className="reports-cell-group">{u.groupName}</td>
                      <td><span className="reports-status scheduled">⏱ מתוזמן</span></td>
                      <td className="reports-cell-date">{formatDate(u.scheduledAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {jobs?.filter(j => j.status === 'PENDING').length > 7 && (
                <button className="reports-show-more" onClick={() => setShowMoreScheduled(!showMoreScheduled)}>
                  {showMoreScheduled ? <><ChevronUp size={14} /> הצג פחות</> : <><ChevronDown size={14} /> הצג עוד</>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI Detail Popup */}
      {kpiPopup && (
        <div className="reports-popup-overlay" onClick={() => setKpiPopup(null)}>
          <div className="reports-popup" onClick={e => e.stopPropagation()}>
            <div className="reports-popup-header">
              <h3>{kpiPopup === 'success' ? '✅ פרסומים שהצליחו' : '❌ פרסומים שנכשלו'}</h3>
              <button className="reports-popup-close" onClick={() => setKpiPopup(null)}><X size={18} /></button>
            </div>
            <div className="reports-popup-body">
              {(kpiPopup === 'success' ? successList : failedList).length === 0 ? (
                <div className="reports-empty">אין נתונים</div>
              ) : (
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>שם קמפיין</th>
                      <th>קבוצה</th>
                      <th>תאריך</th>
                      {kpiPopup === 'failed' && <th>סיבה</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(kpiPopup === 'success' ? successList : failedList).map(item => (
                      <tr key={item.id} onClick={() => { setKpiPopup(null); openDetail(item) }}>
                        <td className="reports-cell-campaign">{item.campaignName}</td>
                        <td className="reports-cell-group">{item.groupName}</td>
                        <td className="reports-cell-date">{formatDate(item.date)}</td>
                        {kpiPopup === 'failed' && (
                          <td className="reports-cell-error">
                            {item.error || 'סיבה לא ידועה — שלח מייל לבירור'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post Detail Popup */}
      {selectedItem && (
        <div className="reports-detail-overlay" onClick={() => setSelectedItem(null)}>
          <div className="reports-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="reports-detail-header">
              <button className="reports-popup-close" onClick={() => setSelectedItem(null)}><X size={18} /></button>
              <h3>{selectedItem.title || selectedItem.campaignName || 'פרטי פרסום'}</h3>
            </div>

            {/* Images */}
            {selectedItem.images?.length > 0 && (
              <div className="reports-detail-images">
                <img src={selectedItem.images[0]?.startsWith('/uploads') ? `http://localhost:5001${selectedItem.images[0]}` : selectedItem.images[0]} alt="" />
                {selectedItem.images.length > 1 && (
                  <span className="reports-detail-img-count">+{selectedItem.images.length - 1}</span>
                )}
              </div>
            )}

            <div className="reports-detail-body">
              {/* Content */}
              {selectedItem.content && (
                <p className="reports-detail-content">{selectedItem.content}</p>
              )}

              {/* Meta info */}
              <div className="reports-detail-meta">
                {selectedItem.groupName && (
                  <div className="reports-detail-row">
                    <span className="reports-detail-label">קבוצה</span>
                    <span>{selectedItem.group?.name || selectedItem.groupName}</span>
                  </div>
                )}
                <div className="reports-detail-row">
                  <span className="reports-detail-label">סטטוס</span>
                  <span className={`reports-status ${selectedItem.status === 'SUCCESS' ? 'success' : selectedItem.status === 'FAILED' ? 'failed' : 'scheduled'}`}>
                    {selectedItem.status === 'SUCCESS' ? <><CheckCircle size={14} /> פורסם בהצלחה</> : selectedItem.status === 'FAILED' ? <><XCircle size={14} /> נכשל</> : <><Clock size={14} /> מתוזמן</>}
                  </span>
                </div>
                {selectedItem.publishedAt && (
                  <div className="reports-detail-row">
                    <span className="reports-detail-label">{selectedItem.status === 'FAILED' ? 'תאריך ניסיון' : 'תאריך פרסום'}</span>
                    <span>{new Date(selectedItem.publishedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                {selectedItem.error && (
                  <div className="reports-detail-row error">
                    <span className="reports-detail-label">סיבת כישלון</span>
                    <span className="reports-detail-error">{selectedItem.error}</span>
                  </div>
                )}
                {selectedItem.postUrl && (
                  <div className="reports-detail-row">
                    <span className="reports-detail-label">קישור</span>
                    <a href={selectedItem.postUrl} target="_blank" rel="noopener noreferrer" className="reports-detail-link">
                      <ExternalLink size={14} /> צפה בפוסט בפייסבוק
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
