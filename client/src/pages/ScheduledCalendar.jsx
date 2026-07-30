import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import BrandLogo from '../components/BrandLogo'
import '../styles/scheduled-calendar.css'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const API_HOST = import.meta.env.VITE_API_ORIGIN || ''

const resolveMediaUrl = value => {
  const url = Array.isArray(value) ? value[0] : value
  if (typeof url !== 'string' || !url.trim()) return ''
  if (url.startsWith('/uploads')) return `${API_HOST}${url}`
  if (url.startsWith('uploads/')) return `${API_HOST}/${url}`
  return url
}

const RANGE_OPTIONS = [
  { label: '3 ימים', days: 3 },
  { label: 'שבוע', days: 7 },
  { label: '14 ימים', days: 14 },
  { label: 'חודש', days: 30 },
]

function PlatformLogos({ event }) {
  const platforms = event.platforms || [event.platform]
  const has = platform => platforms.includes(platform) || (event.platform === 'BOTH' && platform !== 'WHATSAPP')

  return (
    <span className="sc-mini-platforms" aria-label={`יעדי פרסום: ${[
      has('FACEBOOK') && 'Facebook',
      has('INSTAGRAM') && 'Instagram',
      has('WHATSAPP') && 'WhatsApp',
    ].filter(Boolean).join(', ')}`}>
      {has('FACEBOOK') && <span className="sc-mini-platform sc-mini-fb" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4.2c-.5-.1-2.2-.2-4.1-.2C9 4 6.3 6.4 6.3 10.8V14H3v4.3h3.3V24h4.1v-5.7h3.5l.6-4.3h-4.1v-2.8C10.4 10 10.8 8 14 8Z"/></svg></span>}
      {has('INSTAGRAM') && <span className="sc-mini-platform sc-mini-ig" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></span>}
      {has('WHATSAPP') && <span className="sc-mini-platform sc-mini-wa" title="WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.7a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.4-4.9A8.4 8.4 0 1 1 20.5 11.7Z"/><path d="M8.1 7.6c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.8 2c.1.3 0 .5-.1.7l-.6.7c-.2.2-.2.4 0 .7.7 1.3 1.8 2.3 3.2 2.9.3.2.6.1.7-.1l.9-1.1c.2-.2.4-.3.7-.2l2 .9c.3.1.5.3.5.5 0 .3-.2 1.5-1 2.1-.7.6-1.6.9-2.7.6-1.1-.3-3.6-1.2-5.9-3.3-1.8-1.7-3-3.8-3.3-4.9-.3-1.1 0-2 .5-2.6.4-.5.9-.8 1.3-.8Z"/></svg></span>}
    </span>
  )
}

function EventDetailsCard({ event, onClose, preview = false, position }) {
  if (!event) return null
  const isVideo = event.mediaUrl && /\.(mp4|webm|mov)(\?|$)/i.test(event.mediaUrl)
  const dateLabel = event.date
    ? event.date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <article
      className={`sc-details-card ${preview ? 'sc-details-preview' : ''}`}
      dir="rtl"
      style={preview && position ? { left: position.x, top: position.y } : undefined}
    >
      <header className="sc-details-header">
        <h3>פרטי פרסום</h3>
        {!preview && <button type="button" onClick={onClose} aria-label="סגור">×</button>}
      </header>
      <div className="sc-details-main">
        <div className="sc-details-top">
          <strong className="sc-details-time">{event.time}</strong>
          <PlatformLogos event={event} />
        </div>
        {dateLabel && <span className="sc-details-date">{dateLabel}</span>}
        {event.mediaUrl && (
          isVideo
            ? <video className="sc-details-media" src={event.mediaUrl} controls={false} muted playsInline />
            : <img className="sc-details-media" src={event.mediaUrl} alt="" />
        )}
        <p className="sc-details-content">{event.content || event.title}</p>
      </div>
      <dl className="sc-details-meta">
        <div><dt>יעד</dt><dd>{event.group || 'ללא יעד מוגדר'}</dd></div>
        <div><dt>תאריך</dt><dd>{dateLabel || 'לא צוין'}</dd></div>
        <div><dt>סטטוס</dt><dd><span className={`sc-dot dot-${event.status}`} /> {event.status === 'published' ? 'פורסם' : event.status === 'failed' ? 'נכשל' : 'מתוזמן'}</dd></div>
      </dl>
    </article>
  )
}

export default function ScheduledCalendar() {
  const navigate = useNavigate()
  const { user, authChecked, jobs, campaigns: allCampaigns, posts, ensureFresh } = useAppData()
  const calendarPositionRef = useRef({ pageY: 0, weekX: 0 })
  const weekScrollRef = useRef(null)
  const restoreCalendarPositionRef = useRef(false)

  // Calendar state
  const [viewMonth, setViewMonth] = useState(new Date())
  const [weekDate, setWeekDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [hoveredEvent, setHoveredEvent] = useState(null)
  const [previewPosition, setPreviewPosition] = useState(null)
  const [hoveredDay, setHoveredDay] = useState(null)
  const [listRange, setListRange] = useState(7)
  const [viewMode, setViewMode] = useState('calendar') // 'calendar' | 'week' | 'list'
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
      return
    }
    ensureFresh()
  }, [authChecked, user, navigate, ensureFresh])

  useEffect(() => {
    if (selectedDate || !restoreCalendarPositionRef.current) return
    restoreCalendarPositionRef.current = false
    window.requestAnimationFrame(() => {
      if (weekScrollRef.current) {
        weekScrollRef.current.scrollLeft = calendarPositionRef.current.weekX
      }
      window.scrollTo({ top: calendarPositionRef.current.pageY, behavior: 'instant' })
    })
  }, [selectedDate])

  // Build a unified events map: date key → [{ type, title, time, group, status }]
  const eventsMap = useMemo(() => {
    const map = {}

    const addEvent = (dateKey, event) => {
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(event)
    }

    // Scheduled jobs (pending/running = blue)
    jobs.forEach(job => {
      if (!job.scheduledAt) return
      const d = new Date(job.scheduledAt)
      const key = d.toISOString().split('T')[0]
      addEvent(key, {
        id: job.id,
        type: 'scheduled',
        title: job.postGroup?.post?.title || job.postGroup?.post?.content?.slice(0, 40) || 'קמפיין מתוזמן',
        time: d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
        group: job.targetType === 'INSTAGRAM' ? 'אינסטגרם' : job.targetType === 'WHATSAPP' ? 'וואטסאפ' : (job.postGroup?.group?.name || ''),
        status: job.status === 'FAILED' ? 'failed' : 'pending',
        content: job.postGroup?.post?.content || '',
        platform: job.platform || (job.targetType === 'INSTAGRAM' ? 'INSTAGRAM' : job.targetType === 'WHATSAPP' ? 'WHATSAPP' : 'FACEBOOK'),
        platforms: [job.platform || (job.targetType === 'INSTAGRAM' ? 'INSTAGRAM' : job.targetType === 'WHATSAPP' ? 'WHATSAPP' : 'FACEBOOK')],
        mediaUrl: resolveMediaUrl(job.postGroup?.post?.images || job.postGroup?.post?.imageUrl || job.postGroup?.post?.mediaUrl),
        date: d,
      })
    })

    // Published posts (green for SUCCESS, red for FAILED)
    if (posts) {
      posts.forEach(p => {
        const d = new Date(p.publishedAt || p.createdAt)
        const key = d.toISOString().split('T')[0]
        addEvent(key, {
          id: p.id,
          type: 'published',
          title: p.post?.title || p.title || p.content?.slice(0, 40) || 'פוסט',
          time: d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
          group: p.targetType === 'INSTAGRAM' ? 'אינסטגרם' : p.targetType === 'PROFILE' ? 'פרופיל אישי' : (p.group?.name || p.groupName || ''),
          status: p.status === 'FAILED' ? 'failed' : 'published',
          content: p.post?.content || p.content || '',
          platform: p.platform || (p.targetType === 'INSTAGRAM' ? 'INSTAGRAM' : p.targetType === 'WHATSAPP' ? 'WHATSAPP' : 'FACEBOOK'),
          platforms: [p.platform || (p.targetType === 'INSTAGRAM' ? 'INSTAGRAM' : p.targetType === 'WHATSAPP' ? 'WHATSAPP' : 'FACEBOOK')],
          mediaUrl: resolveMediaUrl(p.post?.images || p.images || p.post?.imageUrl || p.imageUrl || p.post?.mediaUrl || p.mediaUrl),
          date: d,
        })
      })
    }

    // Recurring campaigns (blue dots on future matching days)
    const recurringCampaigns = (allCampaigns || []).filter(c => (c.campaignType === 'RECURRING' || c.campaignType === 'BOTH') && !c.isPaused)
    if (recurringCampaigns.length > 0) {
      const now = new Date()
      // Look ahead 60 days for recurring
      for (let i = 0; i < 60; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() + i)
        const dow = d.getDay()
        const key = d.toISOString().split('T')[0]
        recurringCampaigns.forEach(c => {
          if (c.recurringDays?.includes(dow)) {
            const hasFb = (c.groupCount > 0 || c.publishToProfile)
            const hasIg = c.instagramEnabled
            addEvent(key, {
              id: `rec-${c.id}-${key}`,
              type: 'recurring',
              title: c.title || c.content?.slice(0, 40) || 'קמפיין חוזר',
              time: c.recurringTime || '09:00',
              group: c.groupNames?.join(', ') || '',
              status: 'pending',
              content: c.content || '',
              platform: (hasFb && hasIg) ? 'BOTH' : hasIg ? 'INSTAGRAM' : 'FACEBOOK',
              platforms: [
                hasFb && 'FACEBOOK',
                hasIg && 'INSTAGRAM',
                c.whatsappEnabled && 'WHATSAPP',
              ].filter(Boolean),
              mediaUrl: resolveMediaUrl(c.images || c.imageUrl || c.mediaUrl),
              date: new Date(d),
            })
          }
        })
      }
    }

    return map
  }, [jobs, posts, allCampaigns])

  // Original monthly calendar grid.
  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const days = Array(firstDay.getDay()).fill(null)
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
      days.push(new Date(year, month, day))
    }
    return days
  }, [viewMonth])

  const weekDays = useMemo(() => {
    const start = new Date(weekDate)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [weekDate])

  // List view items
  const listItems = useMemo(() => {
    const items = []

    if (listRange === 'custom' && customFrom && customTo) {
      const from = new Date(customFrom)
      const to = new Date(customTo)
      from.setHours(0, 0, 0, 0)
      to.setHours(0, 0, 0, 0)
      if (from > to) return []
      const d = new Date(from)
      while (d <= to) {
        const key = d.toISOString().split('T')[0]
        const events = eventsMap[key] || []
        if (events.length > 0) {
          items.push({ date: new Date(d), dateKey: key, events })
        }
        d.setDate(d.getDate() + 1)
      }
    } else if (listRange !== 'custom') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      for (let i = -listRange; i <= listRange; i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        const key = d.toISOString().split('T')[0]
        const events = eventsMap[key] || []
        if (events.length > 0) {
          items.push({ date: new Date(d), dateKey: key, events })
        }
      }
    }

    return items
  }, [eventsMap, listRange, customFrom, customTo])

  const today = new Date()
  const todayKey = today.toISOString().split('T')[0]
  const isToday = (date) => date?.toISOString().split('T')[0] === todayKey

  const getDayEvents = (date) => {
    if (!date) return null
    const key = date.toISOString().split('T')[0]
    return eventsMap[key] || null
  }

  const getDotColors = (date) => {
    const events = getDayEvents(date)
    if (!events) return []
    return [...new Set(events.map(event => event.status === 'failed' ? 'failed' : event.status === 'published' ? 'published' : 'pending'))]
  }

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
  const moveWeek = amount => setWeekDate(current => {
    const date = new Date(current)
    date.setDate(date.getDate() + amount * 7)
    return date
  })

  const formatWeekRange = () => {
    const first = weekDays[0]
    const last = weekDays[weekDays.length - 1]
    const firstLabel = `${first.getDate()} ${HEBREW_MONTHS[first.getMonth()]}`
    const lastLabel = `${last.getDate()} ${HEBREW_MONTHS[last.getMonth()]}`
    return `${firstLabel} – ${lastLabel} ${last.getFullYear()}`
  }

  const prevDay = () => {
    if (!selectedDate) return
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - 1)
    setSelectedDate(d)
  }
  const nextDay = () => {
    if (!selectedDate) return
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
    setSelectedDate(d)
  }

  const handleDayClick = (date) => {
    if (!date) return
    calendarPositionRef.current = {
      pageY: window.scrollY,
      weekX: weekScrollRef.current?.scrollLeft || 0,
    }
    setSelectedDate(date)
  }

  const positionEventPreview = pointerEvent => {
    const cardWidth = 320
    const estimatedHeight = 500
    const gap = 14
    const viewportPadding = 12
    let x = pointerEvent.clientX + gap
    if (x + cardWidth > window.innerWidth - viewportPadding) {
      x = pointerEvent.clientX - cardWidth - gap
    }
    const y = Math.min(
      Math.max(pointerEvent.clientY - 90, viewportPadding),
      Math.max(viewportPadding, window.innerHeight - estimatedHeight - viewportPadding),
    )
    setPreviewPosition({ x: Math.max(viewportPadding, x), y })
  }

  const handleBack = () => {
    if (selectedEvent) {
      setSelectedEvent(null)
      return
    }
    if (!selectedDate) {
      navigate('/dashboard')
      return
    }

    restoreCalendarPositionRef.current = true
    setSelectedDate(null)
  }

  const formatDayHeader = (date) => {
    if (!date) return ''
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    return `יום ${dayNames[date.getDay()]}, ${date.getDate()} ב${HEBREW_MONTHS[date.getMonth()]} ${date.getFullYear()}`
  }

  const formatDateShort = (date) => {
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    return `יום ${dayNames[date.getDay()]}, ${date.getDate()} ${HEBREW_MONTHS[date.getMonth()]}`
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  const getJobsAtHour = (hour) => {
    if (!selectedDate) return []
    const key = selectedDate.toISOString().split('T')[0]
    const events = eventsMap[key] || []
    return events.filter(e => {
      const h = parseInt(e.time?.split(':')[0], 10)
      return h === hour
    })
  }

  const statusLabel = (status) => {
    if (status === 'published') return 'פורסם'
    if (status === 'failed') return 'נכשל'
    return 'ממתין'
  }

  return (
    <div className="sc-page">
      <header className="sc-topbar">
        <div className="sc-topbar-spacer" />
        <h1 className="sc-title">יומן קמפיינים</h1>
        <button className="sc-back" onClick={handleBack} aria-label={selectedDate ? "חזור ליומן" : "חזור לדשבורד"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
      </header>

      {!authChecked ? (
        <div className="sc-loading">
          <BrandLogo decorative className="loader-logo-pulse" />
          <span>טוען יומן...</span>
        </div>
      ) : selectedDate ? (
        /* ═══════ DAY VIEW ═══════ */
        <div className="sc-day-view">
          <div className="sc-day-header">
            <button className="sc-day-arrow" onClick={prevDay} aria-label="היום הקודם">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            <div className="sc-day-title">
              <span className="sc-day-date">{formatDayHeader(selectedDate)}</span>
              {getDayEvents(selectedDate)?.length > 0 && (
                <span className="sc-day-count">{getDayEvents(selectedDate).length} פריטים</span>
              )}
            </div>
            <button className="sc-day-arrow" onClick={nextDay} aria-label="היום הבא">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>

          <div className="sc-timeline">
            {hours.map(hour => {
              const hourEvents = getJobsAtHour(hour)
              return (
                <div key={hour} className={`sc-hour-row ${hourEvents.length > 0 ? 'has-event' : ''}`}>
                  <div className="sc-hour-label">{String(hour).padStart(2, '0')}:00</div>
                  <div className="sc-hour-content">
                    {hourEvents.map(ev => (
                      <button type="button" key={ev.id} className={`sc-event-card sc-event-${ev.status}`} onClick={() => setSelectedEvent(ev)}>
                        <div className="sc-event-dot-wrap"><span className={`sc-ev-dot dot-${ev.status}`} /></div>
                        <div className="sc-event-info">
                          <span className="sc-event-group">{ev.group || 'קבוצה'}</span>
                          <span className="sc-event-text">{ev.content?.slice(0, 80) || ev.title}</span>
                        </div>
                        <div className="sc-event-tags">
                          {(ev.platform === 'FACEBOOK' || ev.platform === 'BOTH') && <span className="sc-platform-tag sc-tag-fb">FB</span>}
                          {(ev.platform === 'INSTAGRAM' || ev.platform === 'BOTH') && <span className="sc-platform-tag sc-tag-ig">IG</span>}
                          <span className={`sc-event-badge sc-badge-${ev.status}`}>{statusLabel(ev.status)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ═══════ MONTH + LIST VIEW ═══════ */
        <>
          {/* View toggle */}
          <div className="sc-view-toggle">
            <button className={viewMode === 'calendar' ? 'active' : ''} onClick={() => setViewMode('calendar')} aria-pressed={viewMode === 'calendar'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              לוח חודשי
            </button>
            <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')} aria-pressed={viewMode === 'week'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="10" x2="10" y2="22"/><line x1="16" y1="10" x2="16" y2="22"/>
              </svg>
              לוח שבועי
            </button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              רשימה
            </button>
          </div>

          {viewMode === 'calendar' ? (
            <div className="sc-month-view">
              <div className="sc-month-header">
                <button className="sc-month-arrow" onClick={nextMonth} aria-label="החודש הבא">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                <h2 className="sc-month-title">
                  {HEBREW_MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                </h2>
                <button className="sc-month-arrow" onClick={prevMonth} aria-label="החודש הקודם">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
              </div>

              <div className="sc-weekdays">
                {HEBREW_DAYS.map(day => <div key={day} className="sc-weekday">{day}</div>)}
              </div>
              <div className="sc-grid">
                {calendarDays.map((date, i) => {
                  const dots = date ? getDotColors(date) : []
                  const events = date ? getDayEvents(date) : null
                  return (
                    <button
                      type="button"
                      key={i}
                      className={`sc-cell ${date ? 'sc-cell-active' : ''} ${date && isToday(date) ? 'sc-today' : ''} ${dots.length > 0 ? 'sc-has-events' : ''}`}
                      disabled={!date}
                      onClick={() => handleDayClick(date)}
                      onMouseEnter={() => date && events && setHoveredDay(date.toISOString().split('T')[0])}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      {date && <>
                        <span className="sc-cell-num">{date.getDate()}</span>
                        {dots.length > 0 && <span className="sc-cell-dots">{dots.map(color => <span key={color} className={`sc-dot dot-${color}`} />)}</span>}
                        {hoveredDay === date.toISOString().split('T')[0] && events && (
                          <div className="sc-tooltip">
                            <div className="sc-tooltip-date">{date.getDate()} {HEBREW_MONTHS[date.getMonth()]}</div>
                            {events.slice(0, 5).map((event, index) => (
                              <div key={index} className="sc-tooltip-item">
                                <span className={`sc-dot dot-${event.status}`} />
                                <div className="sc-tooltip-info">
                                  <span className="sc-tooltip-title">{event.title}</span>
                                  <span className="sc-tooltip-meta">{event.time}{event.group ? ` • ${event.group}` : ''}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>}
                    </button>
                  )
                })}
              </div>

              <div className="sc-legend">
                <span className="sc-legend-item"><span className="sc-dot dot-published" /> פורסם</span>
                <span className="sc-legend-item"><span className="sc-dot dot-pending" /> ממתין לפרסום</span>
                <span className="sc-legend-item"><span className="sc-dot dot-failed" /> נכשל</span>
              </div>
            </div>
          ) : viewMode === 'week' ? (
            <div className="sc-week-view">
              <div className="sc-month-header">
                <button className="sc-month-arrow" onClick={() => moveWeek(1)} aria-label="השבוע הבא">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <div>
                  <h2 className="sc-month-title">לוח שבועי</h2>
                  <div className="sc-week-range">{formatWeekRange()}</div>
                </div>
                <button className="sc-month-arrow" onClick={() => moveWeek(-1)} aria-label="השבוע הקודם">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              </div>
              <div className="sc-schedule-scroll" ref={weekScrollRef}>
                <div className="sc-week-grid" role="grid" aria-label={`לוח שבועי, ${formatWeekRange()}`}>
                  {weekDays.map(date => {
                    const events = getDayEvents(date) || []
                    return (
                      <button
                        type="button"
                        key={date.toISOString()}
                        className={`sc-week-cell ${isToday(date) ? 'sc-week-today' : ''}`}
                        onClick={() => handleDayClick(date)}
                        aria-label={`${HEBREW_DAYS[date.getDay()]}, ${date.getDate()} ${HEBREW_MONTHS[date.getMonth()]}, ${events.length} פריטים`}
                      >
                        <span className="sc-week-cell-heading">
                          <span className="sc-weekday">{HEBREW_DAYS[date.getDay()]}</span>
                          <span className="sc-cell-num">{date.getDate()}</span>
                        </span>
                        <span className="sc-cell-events">
                          {events.slice(0, 3).map(ev => (
                            <span
                              key={ev.id}
                              className={`sc-mini-event sc-mini-${ev.status}`}
                              role="button"
                              tabIndex="0"
                              onMouseEnter={event => {
                                setHoveredEvent(ev)
                                positionEventPreview(event)
                              }}
                              onMouseMove={positionEventPreview}
                              onMouseLeave={() => {
                                setHoveredEvent(null)
                                setPreviewPosition(null)
                              }}
                              onFocus={() => setHoveredEvent(ev)}
                              onBlur={() => setHoveredEvent(null)}
                              onClick={event => {
                                event.stopPropagation()
                                setHoveredEvent(null)
                                setSelectedEvent(ev)
                              }}
                              onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  setSelectedEvent(ev)
                                }
                              }}
                            >
                              <span className="sc-mini-time">{ev.time}</span>
                              <span className="sc-mini-title">{ev.title}</span>
                              <PlatformLogos event={ev} />
                            </span>
                          ))}
                          {events.length > 3 && <span className="sc-mini-more">+{events.length - 3} נוספים</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="sc-legend">
                <span className="sc-legend-item"><span className="sc-dot dot-published" /> פורסם</span>
                <span className="sc-legend-item"><span className="sc-dot dot-pending" /> ממתין לפרסום</span>
                <span className="sc-legend-item"><span className="sc-dot dot-failed" /> נכשל</span>
              </div>
            </div>
          ) : (
            /* ═══════ LIST VIEW ═══════ */
            <div className="sc-list-view">
              <div className="sc-list-range">
                {RANGE_OPTIONS.map(opt => (
                  <button
                    key={opt.days}
                    className={listRange === opt.days ? 'active' : ''}
                    onClick={() => setListRange(opt.days)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  className={listRange === 'custom' ? 'active' : ''}
                  onClick={() => setListRange('custom')}
                >
                  מותאם אישית
                </button>
              </div>

              {listRange === 'custom' && (
                <div className="sc-custom-range">
                  <div className="sc-custom-range-field">
                    <label>מ-</label>
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} aria-label="תאריך התחלה" />
                  </div>
                  <div className="sc-custom-range-field">
                    <label>עד</label>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} aria-label="תאריך סיום" />
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="sc-legend">
                <span className="sc-legend-item"><span className="sc-dot dot-published" /> פורסם</span>
                <span className="sc-legend-item"><span className="sc-dot dot-pending" /> ממתין לפרסום</span>
                <span className="sc-legend-item"><span className="sc-dot dot-failed" /> נכשל</span>
              </div>

              {listItems.length === 0 ? (
                <div className="sc-empty">
                  <span className="sc-empty-icon">📅</span>
                  <p>אין פריטים בתקופה הנבחרת</p>
                </div>
              ) : (
                <div className="sc-list-timeline">
                  {listItems.map(({ date, dateKey, events }) => (
                    <div key={dateKey} className={`sc-list-day ${isToday(date) ? 'sc-list-today' : ''}`}>
                      <div className="sc-list-day-header">
                        <span className="sc-list-day-name">{formatDateShort(date)}</span>
                        <span className="sc-list-day-count">{events.length} פריטים</span>
                      </div>
                      <div className="sc-list-events">
                        {events.map(ev => (
                          <div key={ev.id} className={`sc-list-event sc-list-event-${ev.status}`}>
                            <span className={`sc-dot dot-${ev.status}`} />
                            <span className="sc-list-event-time">{ev.time}</span>
                            <div className="sc-list-event-info">
                              <span className="sc-list-event-title">{ev.title}</span>
                              {ev.group && <span className="sc-list-event-group">{ev.group}</span>}
                            </div>
                            <div className="sc-list-event-tags">
                              {(ev.platform === 'FACEBOOK' || ev.platform === 'BOTH') && <span className="sc-platform-tag sc-tag-fb">FB</span>}
                              {(ev.platform === 'INSTAGRAM' || ev.platform === 'BOTH') && <span className="sc-platform-tag sc-tag-ig">IG</span>}
                              <span className={`sc-list-badge sc-badge-${ev.status}`}>{statusLabel(ev.status)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create button */}
          <div className="sc-create-wrap">
            <button onClick={() => navigate('/create-post')} className="sc-empty-btn">
              צור קמפיין חדש <span className="sc-btn-plus">+</span>
            </button>
          </div>
          {hoveredEvent && <EventDetailsCard event={hoveredEvent} preview position={previewPosition} />}
        </>
      )}
      {selectedEvent && (
        <div className="sc-details-overlay" role="presentation" onMouseDown={() => setSelectedEvent(null)}>
          <div role="dialog" aria-modal="true" aria-label="פרטי פרסום" onMouseDown={event => event.stopPropagation()}>
            <EventDetailsCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          </div>
        </div>
      )}
    </div>
  )
}
