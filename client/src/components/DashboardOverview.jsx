import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { groupsService } from '../services/groupsService'
import { Users, Send, Clock3, CheckCircle2, Heart, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Eye, ThumbsUp, MessageCircle } from 'lucide-react'
import PostsDataTable from './PostsDataTable'
import '../styles/posts-data-table.css'

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n?.toLocaleString?.() || '0'
}

function getDefaultDateRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

function formatDateRange(from, to) {
  const f = new Date(from)
  const t = new Date(to)
  return `${f.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} - ${t.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'היום'
  if (diffDays === 1) return 'מחר'
  if (diffDays === -1) return 'אתמול'
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function EngagementPlaceholderBars({ dateRange }) {
  const bars = useMemo(() => {
    const from = new Date(dateRange.from)
    const to = new Date(dateRange.to)
    const days = Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1)
    const count = Math.min(days, 30)
    // Generate consistent random heights using a simple seed
    const result = []
    for (let i = 0; i < count; i++) {
      const h = 20 + Math.floor(((Math.sin(i * 3.7 + 1.3) + 1) / 2) * 80)
      result.push(h)
    }
    return result
  }, [dateRange])

  return (
    <div className="eng-placeholder-bars">
      <span className="eng-placeholder-watermark">אין נתונים להצגה</span>
      <div className="eng-bars-container">
        {bars.map((h, i) => (
          <div key={i} className="eng-bar" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

function DateRangePicker({ initialFrom, initialTo, onApply, onCancel }) {
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

  const dayToStr = (day) => toDateStr(new Date(year, month, day))

  const isInRange = (day) => {
    if (!day) return false
    const ds = dayToStr(day)
    const start = rangeStart
    const end = rangeEnd || hoverDate || ''
    if (!start) return false
    if (!end) return ds === start
    const min = start < end ? start : end
    const max = start < end ? end : start
    return ds >= min && ds <= max
  }

  const isStart = (day) => day && dayToStr(day) === rangeStart
  const isEnd = (day) => day && dayToStr(day) === (rangeEnd || hoverDate)

  const handleDayClick = (day) => {
    const ds = dayToStr(day)
    if (!rangeStart || rangeEnd) {
      // Start new selection
      setRangeStart(ds)
      setRangeEnd('')
      setManualFrom(ds)
      setManualTo('')
    } else {
      // Complete selection
      let from = rangeStart, to = ds
      if (from > to) { [from, to] = [to, from] }
      setRangeStart(from)
      setRangeEnd(to)
      setManualFrom(from)
      setManualTo(to)
      // Auto-apply on end date click
      onApply(from, to)
    }
  }

  const handleDayHover = (day) => {
    if (rangeStart && !rangeEnd && day) {
      setHoverDate(dayToStr(day))
    }
  }

  const handlePreset = (days) => {
    const now = new Date()
    const to = toDateStr(now)
    const from = toDateStr(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
    onApply(from, to)
  }

  const handleTodayPreset = () => {
    const t = toDateStr(new Date())
    onApply(t, t)
  }

  const handleManualApply = () => {
    if (manualFrom) {
      const to = manualTo || toDateStr(new Date())
      let from = manualFrom
      if (from > to) { onApply(to, from) } else { onApply(from, to) }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleManualApply()
  }

  return (
    <div className="drp-dropdown">
      {/* Calendar */}
      <div className="drp-calendar">
        <div className="drp-cal-nav">
          <button onClick={() => setCalMonth(new Date(year, month - 1, 1))}><ChevronRight size={14} /></button>
          <span>{monthName}</span>
          <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}><ChevronLeft size={14} /></button>
        </div>
        <div className="drp-cal-grid">
          {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map(d => (
            <span key={d} className="drp-weekday">{d}</span>
          ))}
          {days.map((day, i) => (
            <span
              key={i}
              className={`drp-day ${!day ? 'empty' : ''} ${day && isInRange(day) ? 'in-range' : ''} ${day && isStart(day) ? 'range-start' : ''} ${day && isEnd(day) ? 'range-end' : ''} ${day && dayToStr(day) === toDateStr(today) ? 'today' : ''}`}
              onClick={() => day && handleDayClick(day)}
              onMouseEnter={() => handleDayHover(day)}
            >
              {day || ''}
            </span>
          ))}
        </div>
      </div>

      {/* Manual inputs */}
      <div className="drp-inputs">
        <div className="drp-input-group">
          <label>מ-</label>
          <input type="date" value={manualFrom} onChange={e => { setManualFrom(e.target.value); setRangeStart(e.target.value) }} onKeyDown={handleKeyDown} />
        </div>
        <div className="drp-input-group">
          <label>עד</label>
          <input type="date" value={manualTo} onChange={e => { setManualTo(e.target.value); setRangeEnd(e.target.value) }} onKeyDown={handleKeyDown} />
        </div>
      </div>

      {/* Presets */}
      <div className="drp-presets">
        <button onClick={handleTodayPreset}>היום</button>
        <button onClick={() => handlePreset(7)}>7 ימים</button>
        <button onClick={() => handlePreset(30)}>30 ימים</button>
      </div>

      {/* Actions */}
      <div className="drp-actions">
        <button className="drp-cancel" onClick={onCancel}>ביטול</button>
        <button className="drp-apply" onClick={handleManualApply}>החל</button>
      </div>
    </div>
  )
}

function MiniCalendar({ campaigns, posts }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthName = currentDate.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const scheduledDates = useMemo(() => {
    const set = new Set()
    if (campaigns) {
      campaigns.filter(c => c.status === 'ACTIVE' && (c.campaignType === 'RECURRING' || c.campaignType === 'SCHEDULED')).forEach(c => {
        if (c.nextRunAt) {
          const d = new Date(c.nextRunAt)
          if (d.getMonth() === month && d.getFullYear() === year) set.add(d.getDate())
        }
      })
    }
    return set
  }, [campaigns, month, year])

  const publishedDates = useMemo(() => {
    const set = new Set()
    if (posts) {
      posts.forEach(p => {
        const d = new Date(p.publishedAt || p.createdAt)
        if (d.getMonth() === month && d.getFullYear() === year) set.add(d.getDate())
      })
    }
    return set
  }, [posts, month, year])

  const scheduledCount = campaigns?.filter(c => c.status === 'ACTIVE' && (c.campaignType === 'RECURRING' || c.campaignType === 'SCHEDULED'))?.length || 0
  const publishedCount = posts?.length || 0
  const today = new Date()
  const isToday = (day) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div className="ov2-calendar">
      <div className="ov2-calendar-header">
        <h3>יומן פוסטים</h3>
        <Link to="/scheduled" className="ov2-card-link">צפה ביומן המלא</Link>
      </div>
      <div className="ov2-calendar-nav">
        <button onClick={prevMonth}><ChevronRight size={16} /></button>
        <span className="ov2-calendar-month">{monthName}</span>
        <button onClick={nextMonth}><ChevronLeft size={16} /></button>
      </div>
      <div className="ov2-calendar-grid">
        {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map(d => (
          <span key={d} className="ov2-calendar-weekday">{d}</span>
        ))}
        {days.map((day, i) => (
          <span key={i} className={`ov2-calendar-day ${day ? '' : 'empty'} ${day && isToday(day) ? 'today' : ''}`}>
            {day || ''}
            {day && (scheduledDates.has(day) || publishedDates.has(day)) && (
              <span className="ov2-calendar-dots">
                {scheduledDates.has(day) && <span className="dot scheduled" />}
                {publishedDates.has(day) && <span className="dot published" />}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="ov2-calendar-legend">
        <span className="ov2-legend-item"><span className="dot scheduled" /> {scheduledCount} מתוזמנים</span>
        <span className="ov2-legend-item"><span className="dot published" /> {publishedCount} פורסמו</span>
      </div>
    </div>
  )
}

function getCachedKpis(from, to) {
  try {
    const raw = localStorage.getItem('postit_kpi_cache')
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (cached.from === from && cached.to === to && Date.now() - cached.ts < 5 * 60 * 1000) {
      return cached
    }
  } catch { /* ignore */ }
  return null
}

function setCachedKpis(from, to, kpis, exposure) {
  try {
    localStorage.setItem('postit_kpi_cache', JSON.stringify({ from, to, kpis, exposure, ts: Date.now() }))
  } catch { /* ignore */ }
}

function getSavedDateRange() {
  try {
    const raw = localStorage.getItem('postit_date_range')
    if (raw) {
      const saved = JSON.parse(raw)
      if (saved.from && saved.to) return saved
    }
  } catch { /* ignore */ }
  return getDefaultDateRange()
}

function saveeDateRange(from, to) {
  try {
    localStorage.setItem('postit_date_range', JSON.stringify({ from, to }))
  } catch { /* ignore */ }
}

export default function DashboardOverview({ campaigns, groups, posts, jobs, stats, user, onUpdate, onViewCampaign }) {
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState(getSavedDateRange)
  const [kpiData, setKpiData] = useState(() => {
    const dr = getSavedDateRange()
    const cached = getCachedKpis(dr.from, dr.to)
    return cached?.kpis || null
  })
  const [exposure, setExposure] = useState(() => {
    const dr = getSavedDateRange()
    const cached = getCachedKpis(dr.from, dr.to)
    return cached?.exposure || null
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const lastDateRef = useRef(null)
  const lastDataVersionRef = useRef(null)

  // Persist date range selection
  useEffect(() => {
    saveeDateRange(dateRange.from, dateRange.to)
  }, [dateRange])

  const loadKpis = useCallback(() => {
    groupsService.getDashboardKpis({ from: dateRange.from, to: dateRange.to }).then(res => {
      if (res.data?.kpis) {
        setKpiData(res.data.kpis)
        const cached = getCachedKpis(dateRange.from, dateRange.to)
        setCachedKpis(dateRange.from, dateRange.to, res.data.kpis, cached?.exposure || null)
      }
    }).catch(() => {})
  }, [dateRange])

  const loadExposure = useCallback(() => {
    groupsService.getExposure({ from: dateRange.from, to: dateRange.to }).then(res => {
      if (res.data?.exposure) {
        setExposure(res.data.exposure)
        const cached = getCachedKpis(dateRange.from, dateRange.to)
        setCachedKpis(dateRange.from, dateRange.to, cached?.kpis || null, res.data.exposure)
      }
    }).catch(() => {})
  }, [dateRange])

  // Load on date change only
  useEffect(() => {
    const key = `${dateRange.from}-${dateRange.to}`
    if (lastDateRef.current === key) return
    lastDateRef.current = key
    // Load from cache immediately, then refresh from server
    const cached = getCachedKpis(dateRange.from, dateRange.to)
    if (cached?.kpis) setKpiData(cached.kpis)
    if (cached?.exposure) setExposure(cached.exposure)
    loadKpis()
    loadExposure()
  }, [dateRange, loadKpis, loadExposure])

  // Reload KPIs only when actual data count changes (after publish/delete)
  const dataVersion = `${campaigns?.length}-${posts?.length}-${groups?.length}-${jobs?.length}`
  useEffect(() => {
    if (lastDataVersionRef.current === null) {
      lastDataVersionRef.current = dataVersion
      return
    }
    if (lastDataVersionRef.current !== dataVersion) {
      lastDataVersionRef.current = dataVersion
      loadKpis()
    }
  }, [dataVersion, loadKpis])

  const scheduledCount = campaigns?.filter(c => c.status === 'ACTIVE' && (c.campaignType === 'RECURRING' || c.campaignType === 'SCHEDULED'))?.length || 0
  const groupsCount = groups?.length || 0
  const postsCount = campaigns?.length || 0

  // Filter posts by date range
  const filteredPosts = useMemo(() => {
    if (!posts) return []
    const from = new Date(dateRange.from)
    const to = new Date(dateRange.to + 'T23:59:59')
    return posts.filter(p => {
      const d = new Date(p.publishedAt || p.createdAt)
      return d >= from && d <= to
    })
  }, [posts, dateRange])

  const publishedCount = filteredPosts.length

  // Filter campaigns by date range for the table
  const filteredCampaigns = useMemo(() => {
    if (!campaigns) return []
    const from = new Date(dateRange.from)
    const to = new Date(dateRange.to + 'T23:59:59')
    return campaigns.filter(c => {
      const d = new Date(c.nextRunAt || c.createdAt)
      return d >= from && d <= to
    })
  }, [campaigns, dateRange])

  // Top performing posts - filtered by date range
  const topPosts = useMemo(() => {
    if (!filteredPosts.length) return []
    return [...filteredPosts]
      .sort((a, b) => (b.reactions || 0) + (b.comments || 0) - (a.reactions || 0) - (a.comments || 0))
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        title: p.title || p.content?.substring(0, 40) || 'ללא כותרת',
        image: p.imageUrl || p.campaign?.imageUrl || null,
        date: p.publishedAt || p.createdAt,
        engagement: (p.reactions || 0) + (p.comments || 0),
      }))
  }, [filteredPosts])

  // Period label for display
  const periodLabel = useMemo(() => {
    const from = new Date(dateRange.from)
    const to = new Date(dateRange.to)
    const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24))
    if (diffDays <= 1) return 'היום'
    if (diffDays <= 7) return `${diffDays} ימים אחרונים`
    if (diffDays <= 30) return `${diffDays} ימים אחרונים`
    return `${diffDays} ימים`
  }, [dateRange])

  const kpis = [
    { id: 'groups', label: 'קבוצות', value: kpiData?.groups?.value ?? groupsCount, Icon: Users, color: 'kpi-orange', change: kpiData?.groups?.change, nav: { path: '/dashboard', state: { tab: 'groups' } } },
    { id: 'posts', label: 'פוסטים', value: kpiData?.posts?.value ?? postsCount, Icon: Send, color: 'kpi-blue', change: kpiData?.posts?.change, nav: { path: '/dashboard', state: { tab: 'campaigns' } } },
    { id: 'scheduled', label: 'מתוזמנים', value: kpiData?.scheduled?.value ?? scheduledCount, Icon: Clock3, color: 'kpi-green', change: kpiData?.scheduled?.change, nav: { path: '/scheduled' } },
    { id: 'published', label: 'פורסמו', value: kpiData?.published?.value ?? publishedCount, Icon: CheckCircle2, color: 'kpi-red', change: kpiData?.published?.change, nav: { path: '/dashboard', state: { tab: 'posts' } } },
    { id: 'exposure', label: 'חשיפה', value: formatNumber(kpiData?.exposure?.value ?? 0), Icon: Heart, color: 'kpi-pink', change: kpiData?.exposure?.change, nav: { path: '/dashboard', state: { tab: 'stats' } } },
  ]

  return (
    <div className="ov2-wrapper">
      {/* Header */}
      <div className="overview-header">
        <div>
          <h1 className="overview-title">דשבורד</h1>
          <p className="overview-subtitle">ברוך הבא, {user?.name || 'משתמש'}! הנה מה שקורה עם הפוסטים שלך.</p>
        </div>
        <div className="overview-header-actions">
          <div className="overview-date-wrap">
            <div className="overview-date-range" onClick={() => setShowDatePicker(!showDatePicker)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>{formatDateRange(dateRange.from, dateRange.to)}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {showDatePicker && (
              <DateRangePicker
                initialFrom={dateRange.from}
                initialTo={dateRange.to}
                onApply={(from, to) => { setDateRange({ from, to }); setShowDatePicker(false) }}
                onCancel={() => setShowDatePicker(false)}
              />
            )}
          </div>
          <Link to="/create-post" className="overview-create-btn">
            <span>+</span> צור פוסט
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="overview-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.Icon
          return (
            <div key={kpi.id} className={`overview-kpi-card ${kpi.color}`} onClick={() => navigate(kpi.nav.path, kpi.nav.state ? { state: kpi.nav.state } : undefined)}>
              <div className="overview-kpi-icon">
                <Icon size={24} strokeWidth={1.8} />
              </div>
              <div className="overview-kpi-data">
                <span className="overview-kpi-value">{kpi.value}</span>
                <span className="overview-kpi-label">{kpi.label}</span>
                {kpi.change != null && kpi.change !== 0 && (
                  <span className={`overview-kpi-change ${kpi.change >= 0 ? 'up' : 'down'}`}>
                    {kpi.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {Math.abs(kpi.change)}%
                    <span className="kpi-change-label">מהתקופה הקודמת</span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Main content: 3-panel layout */}
      <div className="ov2-layout">
        {/* Left: Recent Posts Table */}
        <div className="ov2-upcoming-card" style={{ padding: 0 }}>
          <div className="ov2-upcoming-header" style={{ padding: '20px 24px 0' }}>
            <div className="ov2-upcoming-title-row">
              <h2>פוסטים אחרונים</h2>
              <span className="ov2-count-badge">{postsCount}</span>
            </div>
            <Link to="/dashboard" state={{ tab: 'campaigns' }} className="ov2-card-link">צפה בכל הפוסטים</Link>
          </div>
          <PostsDataTable campaigns={(filteredCampaigns || []).slice(0, 7)} onUpdate={onUpdate} onViewCampaign={onViewCampaign} />
        </div>

        {/* Right column */}
        <div className="ov2-right-col">
          <MiniCalendar campaigns={campaigns} posts={posts} />

          {/* Top Performing Posts */}
          <div className="ov2-top-posts-card">
            <div className="ov2-top-posts-header">
              <h3>פוסטים מובילים</h3>
              <Link to="/dashboard" state={{ tab: 'stats' }} className="ov2-card-link">צפה בנתונים</Link>
            </div>
            <div className="ov2-top-posts-list">
              {topPosts.map((post) => (
                <div key={post.id} className="ov2-top-post-row" onClick={() => navigate('/dashboard', { state: { tab: 'stats' } })}>
                  <div className="ov2-top-post-thumb">
                    {post.image ? <img src={post.image} alt="" /> : <span>📝</span>}
                  </div>
                  <div className="ov2-top-post-info">
                    <span className="ov2-top-post-title">{post.title}</span>
                    <span className="ov2-top-post-date">{new Date(post.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="ov2-top-post-engagement">
                    <span className="ov2-engagement-value">{formatNumber(post.engagement)}</span>
                    <span className="ov2-engagement-label">מעורבות</span>
                  </div>
                </div>
              ))}
              {topPosts.length === 0 && <div className="ov2-empty">אין נתונים</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Overview */}
      <div className="ov2-engagement-card" onClick={() => navigate('/dashboard', { state: { tab: 'stats' } })}>
        <div className="ov2-engagement-header">
          <h3>סקירת מעורבות</h3>
          <div className="ov2-engagement-period">{periodLabel}</div>
        </div>
        <div className="ov2-engagement-content">
          <div className="ov2-engagement-stats">
            <div className="ov2-engagement-stat">
              <Eye size={16} className="ov2-stat-icon" />
              <span className="ov2-stat-label">צפיות</span>
              <span className="ov2-stat-value">{formatNumber(exposure?.currentTotal || 0)}</span>
              {exposure?.changePercent != null && exposure.changePercent !== 0 && (
                <span className={`ov2-stat-change ${exposure.changePercent >= 0 ? 'up' : 'down'}`}>
                  <TrendingUp size={12} /> {Math.abs(exposure.changePercent)}%
                </span>
              )}
            </div>
            <div className="ov2-engagement-stat">
              <ThumbsUp size={16} className="ov2-stat-icon" />
              <span className="ov2-stat-label">לייקים</span>
              <span className="ov2-stat-value">{formatNumber(kpiData?.likes?.value || 0)}</span>
              {kpiData?.likes?.change != null && kpiData.likes.change !== 0 && (
                <span className={`ov2-stat-change ${kpiData.likes.change >= 0 ? 'up' : 'down'}`}>
                  <TrendingUp size={12} /> {Math.abs(kpiData.likes.change)}%
                </span>
              )}
            </div>
            <div className="ov2-engagement-stat">
              <MessageCircle size={16} className="ov2-stat-icon" />
              <span className="ov2-stat-label">תגובות</span>
              <span className="ov2-stat-value">{formatNumber(kpiData?.comments?.value || 0)}</span>
              {kpiData?.comments?.change != null && kpiData.comments.change !== 0 && (
                <span className={`ov2-stat-change ${kpiData.comments.change >= 0 ? 'up' : 'down'}`}>
                  <TrendingUp size={12} /> {Math.abs(kpiData.comments.change)}%
                </span>
              )}
            </div>
          </div>
          <div className="ov2-engagement-chart">
            {exposure?.data?.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={exposure.data.map(d => ({ date: new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }), value: d.exposure }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNumber} />
                  <Tooltip contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }} formatter={(val) => [formatNumber(val), 'חשיפה']} />
                  <Area type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2} fill="url(#engGrad)" dot={{ r: 4, fill: '#6366F1', stroke: '#1e2028', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EngagementPlaceholderBars dateRange={dateRange} />
            )}
          </div>
        </div>
        <Link to="/dashboard" state={{ tab: 'stats' }} className="ov2-engagement-cta">
          הצג את כל הנתונים
        </Link>
      </div>
    </div>
  )
}
