import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { groupsService } from '../services/groupsService'
import { getAccessToken } from '../services/http'
import { Users, Send, Clock3, CheckCircle2, Heart, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Eye, ThumbsUp, MessageCircle } from 'lucide-react'
import PostsDataTable from './PostsDataTable'
import '../styles/posts-data-table.css'

function useContainerSize() {
  const [el, setEl] = useState(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      setSize(prev => (prev.width === Math.round(width) && prev.height === Math.round(height)) ? prev : { width: Math.round(width), height: Math.round(height) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, size]
}

/** Fill missing dates with zero values so chart shows the full date range */
function fillDateRange(data, from, to) {
  if (!from || !to) return data || []
  const map = new Map()
  for (const d of (data || [])) {
    const key = new Date(d.date).toISOString().split('T')[0]
    map.set(key, d)
  }
  const result = []
  const start = new Date(from)
  const end = new Date(to)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0]
    if (map.has(key)) {
      result.push(map.get(key))
    } else {
      result.push({ date: key, exposure: 0, posts: 0 })
    }
  }
  return result
}

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
          <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} aria-label="החודש הקודם"><ChevronRight size={14} /></button>
          <span>{monthName}</span>
          <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} aria-label="החודש הבא"><ChevronLeft size={14} /></button>
        </div>
        <div className="drp-cal-grid">
          {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map(d => (
            <span key={d} className="drp-weekday">{d}</span>
          ))}
          {days.map((day, i) => (
            <button
              type="button"
              key={i}
              className={`drp-day ${!day ? 'empty' : ''} ${day && isInRange(day) ? 'in-range' : ''} ${day && isStart(day) ? 'range-start' : ''} ${day && isEnd(day) ? 'range-end' : ''} ${day && dayToStr(day) === toDateStr(today) ? 'today' : ''}`}
              disabled={!day}
              onClick={() => day && handleDayClick(day)}
              onMouseEnter={() => handleDayHover(day)}
              aria-label={day ? `בחר ${dayToStr(day)}` : undefined}
            >
              {day || ''}
            </button>
          ))}
        </div>
      </div>

      {/* Manual inputs */}
      <div className="drp-inputs">
        <div className="drp-input-group">
          <label>מ-</label>
          <input type="date" value={manualFrom} onChange={e => { setManualFrom(e.target.value); setRangeStart(e.target.value) }} onKeyDown={handleKeyDown} aria-label="תאריך התחלה" />
        </div>
        <div className="drp-input-group">
          <label>עד</label>
          <input type="date" value={manualTo} onChange={e => { setManualTo(e.target.value); setRangeEnd(e.target.value) }} onKeyDown={handleKeyDown} aria-label="תאריך סיום" />
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

function MiniCalendar({ campaigns, posts, jobs }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [hoveredDay, setHoveredDay] = useState(null)
  const [tooltipPos, setTooltipPos] = useState(null)
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthName = currentDate.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build a map: day number → { scheduled: [...], published: [...] }
  const dayItemsMap = useMemo(() => {
    const map = {}
    // Use jobs (pending publication jobs) for scheduled dots — same source as full calendar
    if (jobs) {
      jobs.forEach(j => {
        if (!j.scheduledAt || (j.status !== 'PENDING' && j.status !== 'RUNNING')) return
        const d = new Date(j.scheduledAt)
        if (d.getMonth() === month && d.getFullYear() === year) {
          const day = d.getDate()
          if (!map[day]) map[day] = { scheduled: [], published: [] }
          map[day].scheduled.push({
            title: j.postGroup?.post?.title || j.postTitle || 'קמפיין מתוזמן',
            time: d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
            groups: 1,
          })
        }
      })
    }
    // Recurring campaigns — show dots on their recurring weekdays (recurringDays are numbers 0-6)
    if (campaigns) {
      campaigns.forEach(c => {
        if (!c.recurringDays?.length || c.isPaused) return
        if (c.campaignType !== 'RECURRING' && c.status !== 'recurring') return
        for (let d = 1; d <= daysInMonth; d++) {
          const dateObj = new Date(year, month, d)
          if (c.recurringDays.includes(dateObj.getDay())) {
            if (!map[d]) map[d] = { scheduled: [], published: [] }
            const title = c.title || c.content?.substring(0, 30) || 'קמפיין חוזר'
            if (!map[d].scheduled.some(s => s.title === title)) {
              map[d].scheduled.push({
                title,
                time: c.recurringTime || '',
                groups: c.groupCount || 0,
              })
            }
          }
        }
      })
    }
    if (posts) {
      posts.forEach(p => {
        const d = new Date(p.publishedAt || p.createdAt)
        if (d.getMonth() === month && d.getFullYear() === year) {
          const day = d.getDate()
          if (!map[day]) map[day] = { scheduled: [], published: [] }
          map[day].published.push({
            title: p.post?.title || p.title || p.content?.substring(0, 30) || 'פוסט',
            time: d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
            group: p.group?.name || '',
          })
        }
      })
    }
    return map
  }, [campaigns, posts, jobs, month, year, daysInMonth])

  const scheduledCount = campaigns?.filter(c => c.status === 'scheduled' || c.status === 'recurring')?.length || 0
  const publishedCount = posts?.length || 0
  const today = new Date()
  const isToday = (day) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const handleDayEnter = useCallback((day, e) => {
    if (!day || !dayItemsMap[day]) return
    setHoveredDay(day)
    const rect = e.currentTarget.getBoundingClientRect()
    const tooltipW = 220
    const tooltipH = 120
    let top = rect.bottom + 6
    let left = rect.left + rect.width / 2 - tooltipW / 2
    // If tooltip would go below viewport, show above
    if (top + tooltipH > window.innerHeight) {
      top = rect.top - tooltipH - 6
    }
    // Keep within horizontal bounds
    if (left < 8) left = 8
    if (left + tooltipW > window.innerWidth - 8) left = window.innerWidth - tooltipW - 8
    setTooltipPos({ top, left })
  }, [dayItemsMap])

  const handleDayLeave = useCallback(() => {
    setHoveredDay(null)
    setTooltipPos(null)
  }, [])

  const handleDayClick = useCallback((day, e) => {
    if (!day || !dayItemsMap[day]) return
    e.stopPropagation()
    if (hoveredDay === day) {
      setHoveredDay(null)
      setTooltipPos(null)
    } else {
      handleDayEnter(day, e)
    }
  }, [dayItemsMap, hoveredDay, handleDayEnter])

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!hoveredDay) return
    const close = () => { setHoveredDay(null); setTooltipPos(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [hoveredDay])

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
        <button onClick={prevMonth} aria-label="החודש הקודם"><ChevronRight size={16} /></button>
        <span className="ov2-calendar-month">{monthName}</span>
        <button onClick={nextMonth} aria-label="החודש הבא"><ChevronLeft size={16} /></button>
      </div>
      <div className="ov2-calendar-grid">
        {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map(d => (
          <span key={d} className="ov2-calendar-weekday">{d}</span>
        ))}
        {days.map((day, i) => (
          <button
            type="button"
            key={i}
            className={`ov2-calendar-day ${day ? '' : 'empty'} ${day && isToday(day) ? 'today' : ''} ${day && dayItemsMap[day] ? 'has-items' : ''}`}
            disabled={!day}
            onMouseEnter={(e) => handleDayEnter(day, e)}
            onMouseLeave={handleDayLeave}
            onClick={(e) => handleDayClick(day, e)}
            aria-label={day ? `יום ${day}${dayItemsMap[day] ? `, ${dayItemsMap[day].scheduled.length + dayItemsMap[day].published.length} פריטים` : ''}` : undefined}
          >
            {day || ''}
            {day && dayItemsMap[day] && (
              <span className="ov2-calendar-dots">
                {dayItemsMap[day].scheduled.length > 0 && <span className="dot scheduled" />}
                {dayItemsMap[day].published.length > 0 && <span className="dot published" />}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="ov2-calendar-legend">
        <span className="ov2-legend-item"><span className="dot scheduled" /> {scheduledCount} מתוזמנים</span>
        <span className="ov2-legend-item"><span className="dot published" /> {publishedCount} פורסמו</span>
      </div>
      {hoveredDay && dayItemsMap[hoveredDay] && tooltipPos && createPortal(
        <div className="ov2-cal-tooltip" style={{ position: 'fixed', top: tooltipPos.top, left: tooltipPos.left }}>
          <div className="ov2-cal-tooltip-date">{hoveredDay} {currentDate.toLocaleDateString('he-IL', { month: 'long' })}</div>
          {dayItemsMap[hoveredDay].scheduled.map((item, idx) => (
            <div key={`s-${idx}`} className="ov2-cal-tooltip-item">
              <span className="dot scheduled" />
              <div className="ov2-cal-tooltip-info">
                <span className="ov2-cal-tooltip-title">{item.title}</span>
                <span className="ov2-cal-tooltip-meta">{item.time}{item.groups > 0 ? ` • ${item.groups} קבוצות` : ''}</span>
              </div>
            </div>
          ))}
          {dayItemsMap[hoveredDay].published.map((item, idx) => (
            <div key={`p-${idx}`} className="ov2-cal-tooltip-item">
              <span className="dot published" />
              <div className="ov2-cal-tooltip-info">
                <span className="ov2-cal-tooltip-title">{item.title}</span>
                <span className="ov2-cal-tooltip-meta">{item.time}{item.group ? ` • ${item.group}` : ''}</span>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function getCachedKpis(from, to) {
  void from
  void to
  return null
}

function isCacheStale(from, to) {
  void from
  void to
  return true
}

function setCachedKpis(from, to, kpis, exposure) {
  void from
  void to
  void kpis
  void exposure
}

function getSavedDateRange() {
  try {
    const raw = localStorage.getItem('possbo_date_range')
    if (raw) {
      const saved = JSON.parse(raw)
      if (saved.from && saved.to) return saved
    }
  } catch { /* ignore */ }
  return getDefaultDateRange()
}

function saveeDateRange(from, to) {
  try {
    localStorage.setItem('possbo_date_range', JSON.stringify({ from, to }))
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
  const [engChartType, setEngChartType] = useState('area')
  const lastDateRef = useRef(null)
  const [engChartRef, engChartSize] = useContainerSize()
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
    // Load from cache immediately (no TTL check - show stale data instantly)
    const cached = getCachedKpis(dateRange.from, dateRange.to)
    if (cached?.kpis) setKpiData(cached.kpis)
    if (cached?.exposure) setExposure(cached.exposure)
    // Refresh from server in background only if stale or missing
    if (getAccessToken() && isCacheStale(dateRange.from, dateRange.to)) {
      loadKpis()
      loadExposure()
    }
  }, [dateRange, loadKpis, loadExposure])

  // Reload KPIs + exposure when actual data count changes (after publish/delete/fetchAll)
  const dataVersion = `${campaigns?.length}-${posts?.length}-${groups?.length}-${jobs?.length}`
  useEffect(() => {
    if (lastDataVersionRef.current === null) {
      lastDataVersionRef.current = dataVersion
      return
    }
    if (lastDataVersionRef.current !== dataVersion) {
      lastDataVersionRef.current = dataVersion
      loadKpis()
      loadExposure()
    }
  }, [dataVersion, loadKpis, loadExposure])

  const scheduledCount = campaigns?.filter(c => c.status === 'scheduled' || c.status === 'recurring')?.length || 0
  const groupsCount = groups?.length || 0
  const postsCount = campaigns?.length || 0
  const totalPublished = campaigns?.reduce((sum, c) => sum + (c.publishedCount || 0), 0) || 0

  // Dynamic campaign count based on card height
  const campaignsCardRef = useRef(null)
  const [visibleCampaignCount, setVisibleCampaignCount] = useState(7)
  useEffect(() => {
    const el = campaignsCardRef.current
    if (!el) return

    const getResponsiveCampaignLimit = () => {
      const width = window.innerWidth
      if (width <= 480) return 3
      if (width <= 768) return 4
      if (width <= 1100) return 6
      return 8
    }

    const ROW_HEIGHT = 76 // min-height of pdt-row
    const HEADER_HEIGHT = 56 // pdt-header height
    const CARD_HEADER_HEIGHT = 60 // ov2-upcoming-header height
    const updateVisibleCount = (height) => {
      const available = height - CARD_HEADER_HEIGHT - HEADER_HEIGHT
      const heightBasedCount = Math.max(3, Math.floor(available / ROW_HEIGHT))
      setVisibleCampaignCount(Math.min(heightBasedCount, getResponsiveCampaignLimit()))
    }

    updateVisibleCount(el.getBoundingClientRect().height)

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        updateVisibleCount(entry.contentRect.height)
      }
    })
    const handleResize = () => updateVisibleCount(el.getBoundingClientRect().height)

    observer.observe(el)
    window.addEventListener('resize', handleResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [])

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

  const publishedCount = totalPublished

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

  // Top performing posts - sorted by likes or comments
  const [topPostsSort, setTopPostsSort] = useState('likes')
  const [topPostsPlatform, setTopPostsPlatform] = useState('all')
  const topPosts = useMemo(() => {
    const postsData = stats?.topPosts || []
    if (!postsData.length) return []
    return [...postsData]
      .filter(p => {
        if (topPostsPlatform === 'all') return true
        if (topPostsPlatform === 'facebook') return (p.platform || 'FACEBOOK') === 'FACEBOOK'
        if (topPostsPlatform === 'instagram') return p.platform === 'INSTAGRAM'
        if (topPostsPlatform === 'whatsapp') return p.platform === 'WHATSAPP'
        return true
      })
      .sort((a, b) => {
        if (topPostsSort === 'comments') return (b.comments || 0) - (a.comments || 0)
        return (b.likes || 0) - (a.likes || 0)
      })
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        postId: p.postId,
        title: p.title || p.content?.substring(0, 40) || 'ללא כותרת',
        groupName: p.groupName || '',
        date: p.publishedAt,
        likes: p.likes || 0,
        comments: p.comments || 0,
        platform: p.platform || 'FACEBOOK',
        targetType: p.targetType || 'GROUP',
        igType: p.igType || null,
        postUrl: p.postUrl || null,
      }))
  }, [stats?.topPosts, topPostsSort, topPostsPlatform])

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
    { id: 'groups', label: 'קבוצות', value: kpiData?.groups?.value ?? groupsCount, Icon: Users, color: 'kpi-orange', change: kpiData?.groups?.change, nav: { path: '/dashboard?tab=groups' } },
    { id: 'posts', label: 'קמפיינים', value: kpiData?.posts?.value ?? postsCount, Icon: Send, color: 'kpi-blue', change: kpiData?.posts?.change, nav: { path: '/dashboard?tab=campaigns' } },
    { id: 'scheduled', label: 'קמפיינים מתוזמנים', value: kpiData?.scheduled?.value ?? scheduledCount, Icon: Clock3, color: 'kpi-green', change: kpiData?.scheduled?.change, nav: { path: '/dashboard?tab=campaigns&subTab=scheduled' } },
    { id: 'published', label: 'פוסטים שפורסמו', value: kpiData?.published?.value ?? publishedCount, Icon: CheckCircle2, color: 'kpi-red', change: kpiData?.published?.change, nav: { path: '/dashboard?tab=campaigns&subTab=published' } },
    { id: 'exposure', label: 'חשיפה', value: formatNumber(kpiData?.exposure?.value ?? 0), Icon: Heart, color: 'kpi-pink', change: kpiData?.exposure?.change, nav: { path: '/dashboard?tab=stats' } },
  ]

  return (
    <div className="ov2-wrapper">
      {/* Header */}
      <div className="overview-header">
        <div>
          <h1 className="overview-title">דשבורד</h1>
          <p className="overview-subtitle">ברוך הבא, {user?.name || 'משתמש'}! הנה מה שקורה עם הקמפיינים שלך.</p>
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
            <span>+</span> צור קמפיין
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="overview-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.Icon
          return (
            <div key={kpi.id} className={`overview-kpi-card ${kpi.color}`} onClick={() => navigate(kpi.nav.path)}>
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
        <div className="ov2-upcoming-card" ref={campaignsCardRef} style={{ padding: 0 }}>
          <div className="ov2-upcoming-header" style={{ padding: '20px 24px 0' }}>
            <div className="ov2-upcoming-title-row">
              <h2>קמפיינים אחרונים</h2>
              <span className="ov2-count-badge">{postsCount}</span>
            </div>
            <Link to="/dashboard?tab=campaigns" className="ov2-card-link">צפה בכל הקמפיינים</Link>
          </div>
          <PostsDataTable campaigns={(filteredCampaigns || []).slice(0, visibleCampaignCount)} onUpdate={onUpdate} onViewCampaign={onViewCampaign} />
        </div>

        {/* Right column */}
        <div className="ov2-right-col">
          <MiniCalendar campaigns={campaigns} posts={posts} jobs={jobs} />

          {/* Top Performing Posts */}
          <div className="ov2-top-posts-card">
            <div className="ov2-top-posts-header">
              <h3>פוסטים מובילים</h3>
              <div className="ov2-top-posts-toggle">
                <button className={`ov2-toggle-btn ${topPostsSort === 'likes' ? 'active' : ''}`} onClick={() => setTopPostsSort('likes')}>👍 לייקים</button>
                <button className={`ov2-toggle-btn ${topPostsSort === 'comments' ? 'active' : ''}`} onClick={() => setTopPostsSort('comments')}>💬 תגובות</button>
              </div>
            </div>
            <div className="ov2-top-posts-platform-filter">
              <button className={`ov2-platform-btn ${topPostsPlatform === 'all' ? 'active' : ''}`} onClick={() => setTopPostsPlatform('all')}>הכל</button>
              <button className={`ov2-platform-btn ${topPostsPlatform === 'facebook' ? 'active' : ''}`} onClick={() => setTopPostsPlatform('facebook')}>Facebook</button>
              <button className={`ov2-platform-btn ${topPostsPlatform === 'instagram' ? 'active' : ''}`} onClick={() => setTopPostsPlatform('instagram')}>Instagram</button>
              <button className={`ov2-platform-btn ${topPostsPlatform === 'whatsapp' ? 'active' : ''}`} onClick={() => setTopPostsPlatform('whatsapp')}>WhatsApp</button>
            </div>
            <div className="ov2-top-posts-list">
              {topPosts.map((post) => (
                <div key={post.id} className="ov2-top-post-row" onClick={() => navigate(`/post/${post.postId || post.id}`)}>
                  <div className="ov2-top-post-thumb">
                    <span>{post.platform === 'INSTAGRAM' ? '📸' : post.platform === 'WHATSAPP' ? '💬' : '📝'}</span>
                  </div>
                  <div className="ov2-top-post-info">
                    <span className="ov2-top-post-title">{post.title}</span>
                    <span className="ov2-top-post-date">
                      <span className={`ov2-platform-badge ${post.platform === 'INSTAGRAM' ? 'ig' : post.platform === 'WHATSAPP' ? 'wa' : 'fb'}`}>
                        {post.platform === 'INSTAGRAM' ? (post.igType === 'REEL' ? 'ריל' : post.igType === 'STORY' ? 'סטורי' : 'פוסט IG') : post.platform === 'WHATSAPP' ? 'WhatsApp' : 'Facebook'}
                      </span>
                      {post.groupName ? ` • ${post.groupName}` : ''}
                      {post.date ? ` • ${new Date(post.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}` : ''}
                    </span>
                  </div>
                  <div className="ov2-top-post-engagement">
                    <span className="ov2-engagement-value">{formatNumber(topPostsSort === 'likes' ? post.likes : post.comments)}</span>
                    <span className="ov2-engagement-label">{topPostsSort === 'likes' ? '👍' : '💬'}</span>
                  </div>
                </div>
              ))}
              {topPosts.length === 0 && <div className="ov2-empty">אין נתונים עדיין</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Overview */}
      <div className="ov2-engagement-card">
        <div className="ov2-engagement-header">
          <h3>סקירת מעורבות</h3>
          <div className="ov2-engagement-header-actions">
            <div className="chart-type-toggle small" onClick={e => e.stopPropagation()}>
              <button className={`chart-toggle-btn ${engChartType === 'area' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setEngChartType('area') }} title="גרף קו">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </button>
              <button className={`chart-toggle-btn ${engChartType === 'bar' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setEngChartType('bar') }} title="גרף עמודות">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
              </button>
            </div>
            <div className="ov2-engagement-period">{periodLabel}</div>
          </div>
        </div>
        <div className="ov2-engagement-content" onClick={() => navigate('/dashboard?tab=stats')}>
          <div className="ov2-engagement-stats">
            <div className="ov2-engagement-stat">
              <Eye size={16} className="ov2-stat-icon" />
              <span className="ov2-stat-label">חשיפה</span>
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
          <div className="ov2-engagement-chart" ref={engChartRef}>
            {exposure?.data?.length > 0 ? (
                engChartType === 'area' ? (
                  <AreaChart width={engChartSize.width || 300} height={engChartSize.height || 160} data={fillDateRange(exposure.data, dateRange.from, dateRange.to).map(d => ({ date: new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }), value: d.exposure }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--indigo)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--indigo)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNumber} domain={[0, 'auto']} width={35} />
                    <Tooltip cursor={false} contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }} formatter={(val) => [formatNumber(val), 'חשיפה']} />
                    <Area type="monotone" dataKey="value" stroke="var(--indigo)" strokeWidth={2} fill="url(#engGrad)" dot={false} activeDot={{ r: 7, fill: 'var(--indigo)', stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                ) : (
                  <BarChart width={engChartSize.width || 300} height={engChartSize.height || 160} data={fillDateRange(exposure.data, dateRange.from, dateRange.to).map(d => ({ date: new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }), value: d.exposure }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNumber} width={35} />
                    <Tooltip cursor={false} contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }} formatter={(val) => [formatNumber(val), 'חשיפה']} />
                    <Bar dataKey="value" fill="var(--indigo)" radius={[4, 4, 0, 0]} background={false} />
                  </BarChart>
                )
            ) : (
              <EngagementPlaceholderBars dateRange={dateRange} />
            )}
          </div>
        </div>
        <Link to="/dashboard?tab=stats" className="ov2-engagement-cta">
          הצג את כל הנתונים
        </Link>
      </div>
    </div>
  )
}
