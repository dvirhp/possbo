import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import '../styles/scheduled-calendar.css'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

const RANGE_OPTIONS = [
  { label: '3 ימים', days: 3 },
  { label: 'שבוע', days: 7 },
  { label: '14 ימים', days: 14 },
  { label: 'חודש', days: 30 },
]

export default function ScheduledCalendar() {
  const navigate = useNavigate()
  const { user, authChecked, jobs, campaigns: allCampaigns, posts, ensureFresh } = useAppData()

  // Calendar state
  const [viewMonth, setViewMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [hoveredDay, setHoveredDay] = useState(null)
  const [listRange, setListRange] = useState(7)
  const [viewMode, setViewMode] = useState('calendar') // 'calendar' | 'list'
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
      return
    }
    ensureFresh()
  }, [authChecked, user, navigate, ensureFresh])

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
        group: job.postGroup?.group?.name || '',
        status: job.status === 'FAILED' ? 'failed' : 'pending',
        content: job.postGroup?.post?.content || '',
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
          group: p.group?.name || '',
          status: p.status === 'FAILED' ? 'failed' : 'published',
          content: p.post?.content || p.content || '',
        })
      })
    }

    // Recurring campaigns (blue dots on future matching days)
    const recurringCampaigns = (allCampaigns || []).filter(c => c.campaignType === 'RECURRING' && !c.isPaused)
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
            addEvent(key, {
              id: `rec-${c.id}-${key}`,
              type: 'recurring',
              title: c.title || c.content?.slice(0, 40) || 'קמפיין חוזר',
              time: c.recurringTime || '09:00',
              group: c.groupNames?.join(', ') || '',
              status: 'pending',
              content: c.content || '',
            })
          }
        })
      }
    }

    return map
  }, [jobs, posts, allCampaigns])

  // Calendar grid generation
  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDayOfWeek = firstDay.getDay()
    const daysInMonth = lastDay.getDate()
    const days = []
    for (let i = 0; i < startDayOfWeek; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
    return days
  }, [viewMonth])

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
    const colors = new Set()
    events.forEach(e => {
      if (e.status === 'failed') colors.add('failed')
      else if (e.status === 'published') colors.add('published')
      else colors.add('pending')
    })
    return [...colors]
  }

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))

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
    setSelectedDate(date)
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
        <button className="sc-back" onClick={() => navigate('/dashboard')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
      </header>

      {!authChecked ? (
        <div className="sc-loading">
          <div className="sc-loading-mark">📅</div>
          <span>טוען יומן...</span>
        </div>
      ) : selectedDate ? (
        /* ═══════ DAY VIEW ═══════ */
        <div className="sc-day-view">
          <div className="sc-day-header">
            <button className="sc-day-arrow" onClick={prevDay}>
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
            <button className="sc-day-arrow" onClick={nextDay}>
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
                      <div key={ev.id} className={`sc-event-card sc-event-${ev.status}`}>
                        <div className="sc-event-dot-wrap"><span className={`sc-ev-dot dot-${ev.status}`} /></div>
                        <div className="sc-event-info">
                          <span className="sc-event-group">{ev.group || 'קבוצה'}</span>
                          <span className="sc-event-text">{ev.content?.slice(0, 80) || ev.title}</span>
                        </div>
                        <span className={`sc-event-badge sc-badge-${ev.status}`}>{statusLabel(ev.status)}</span>
                      </div>
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
            <button className={viewMode === 'calendar' ? 'active' : ''} onClick={() => setViewMode('calendar')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              לוח חודשי
            </button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              רשימה
            </button>
          </div>

          {viewMode === 'calendar' ? (
            <div className="sc-month-view">
              <div className="sc-month-header">
                <button className="sc-month-arrow" onClick={nextMonth}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                <h2 className="sc-month-title">
                  {HEBREW_MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                </h2>
                <button className="sc-month-arrow" onClick={prevMonth}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
              </div>

              <div className="sc-weekdays">
                {HEBREW_DAYS.map(day => (
                  <div key={day} className="sc-weekday">{day}</div>
                ))}
              </div>

              <div className="sc-grid">
                {calendarDays.map((date, i) => {
                  const dots = date ? getDotColors(date) : []
                  const events = date ? getDayEvents(date) : null
                  return (
                    <div
                      key={i}
                      className={`sc-cell ${date ? 'sc-cell-active' : ''} ${date && isToday(date) ? 'sc-today' : ''} ${dots.length > 0 ? 'sc-has-events' : ''}`}
                      onClick={() => handleDayClick(date)}
                      onMouseEnter={() => date && events && setHoveredDay(date.toISOString().split('T')[0])}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      {date && (
                        <>
                          <span className="sc-cell-num">{date.getDate()}</span>
                          {dots.length > 0 && (
                            <span className="sc-cell-dots">
                              {dots.map(c => <span key={c} className={`sc-dot dot-${c}`} />)}
                            </span>
                          )}
                          {hoveredDay === date.toISOString().split('T')[0] && events && (
                            <div className="sc-tooltip">
                              <div className="sc-tooltip-date">{date.getDate()} {HEBREW_MONTHS[date.getMonth()]}</div>
                              {events.slice(0, 5).map((ev, idx) => (
                                <div key={idx} className="sc-tooltip-item">
                                  <span className={`sc-dot dot-${ev.status}`} />
                                  <div className="sc-tooltip-info">
                                    <span className="sc-tooltip-title">{ev.title}</span>
                                    <span className="sc-tooltip-meta">{ev.time}{ev.group ? ` • ${ev.group}` : ''}</span>
                                  </div>
                                </div>
                              ))}
                              {events.length > 5 && <div className="sc-tooltip-more">+{events.length - 5} נוספים</div>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
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
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                  </div>
                  <div className="sc-custom-range-field">
                    <label>עד</label>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
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
                            <span className={`sc-list-badge sc-badge-${ev.status}`}>{statusLabel(ev.status)}</span>
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
        </>
      )}
    </div>
  )
}
