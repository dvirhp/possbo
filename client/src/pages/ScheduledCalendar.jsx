import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import '../styles/scheduled-calendar.css'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

export default function ScheduledCalendar() {
  const navigate = useNavigate()
  const { user, authChecked, jobs, campaigns: allCampaigns, ensureFresh } = useAppData()

  const campaigns = useMemo(() =>
    (allCampaigns || []).filter(c => c.campaignType === 'RECURRING' && !c.isPaused),
    [allCampaigns]
  )

  // Calendar state
  const [viewMonth, setViewMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null) // null = month view, Date = day view

  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
      return
    }
    ensureFresh()
  }, [authChecked, user, navigate, ensureFresh])

  // Group jobs by date string (YYYY-MM-DD)
  const jobsByDate = useMemo(() => {
    const map = {}
    jobs.forEach(job => {
      if (!job.scheduledAt) return
      const d = new Date(job.scheduledAt)
      const key = d.toISOString().split('T')[0]
      if (!map[key]) map[key] = []
      map[key].push(job)
    })
    return map
  }, [jobs])

  // Get jobs for the selected day
  const dayJobs = useMemo(() => {
    if (!selectedDate) return []
    const key = selectedDate.toISOString().split('T')[0]
    const dayList = jobsByDate[key] || []
    const sorted = dayList.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))

    // Add recurring campaigns for this day of week
    const dow = selectedDate.getDay()
    const recurringItems = campaigns
      .filter(c => c.recurringDays?.includes(dow))
      .map(c => ({
        id: `recurring-${c.id}`,
        isRecurring: true,
        recurringTime: c.recurringTime,
        postGroup: {
          post: { content: c.content, title: c.title },
          group: { name: c.groupNames?.join(', ') || '' },
        },
      }))

    return [...sorted, ...recurringItems]
  }, [selectedDate, jobsByDate, campaigns])

  // Calendar grid generation
  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Sunday = 0 in JS, we want Sunday as first column
    const startDayOfWeek = firstDay.getDay()
    const daysInMonth = lastDay.getDate()

    const days = []

    // Empty cells before first day
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }

    // Days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d))
    }

    return days
  }, [viewMonth])

  const today = new Date()
  const todayKey = today.toISOString().split('T')[0]

  const isToday = (date) => {
    if (!date) return false
    return date.toISOString().split('T')[0] === todayKey
  }

  const hasEvents = (date) => {
    if (!date) return false
    const key = date.toISOString().split('T')[0]
    if (jobsByDate[key]) return true
    // Check recurring campaigns for this day of week
    const dow = date.getDay()
    return campaigns.some(c => c.recurringDays?.includes(dow))
  }

  const prevMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
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
    setSelectedDate(date)
  }

  const backToMonth = () => {
    setSelectedDate(null)
  }

  const formatDayHeader = (date) => {
    if (!date) return ''
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    return `יום ${dayNames[date.getDay()]}, ${date.getDate()} ב${HEBREW_MONTHS[date.getMonth()]} ${date.getFullYear()}`
  }

  // Generate hours array (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Place jobs in their hour slots
  const getJobsAtHour = (hour) => {
    return dayJobs.filter(job => {
      if (job.isRecurring) {
        if (!job.recurringTime) return hour === 9 // default to 9am
        const h = parseInt(job.recurringTime.split(':')[0], 10)
        return h === hour
      }
      const h = new Date(job.scheduledAt).getHours()
      return h === hour
    })
  }

  return (
    <div className="sc-page">
      {/* Top bar */}
      <header className="sc-topbar">
        <div className="sc-topbar-spacer" />
        <h1 className="sc-title">קמפיינים מתוזמנים</h1>
        <button className="sc-back" onClick={() => navigate('/dashboard')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>חזרה</span>
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
              {dayJobs.length > 0 && (
                <span className="sc-day-count">{dayJobs.length} פרסומים</span>
              )}
            </div>
            <button className="sc-day-arrow" onClick={nextDay}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>

          <button className="sc-back-to-month" onClick={backToMonth}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>חזרה ללוח החודשי</span>
          </button>

          <div className="sc-timeline">
            {hours.map(hour => {
              const hourJobs = getJobsAtHour(hour)
              return (
                <div key={hour} className={`sc-hour-row ${hourJobs.length > 0 ? 'has-event' : ''}`}>
                  <div className="sc-hour-label">
                    {String(hour).padStart(2, '0')}:00
                  </div>
                  <div className="sc-hour-content">
                    {hourJobs.map(job => (
                      <div key={job.id} className="sc-event-card">
                        <div className="sc-event-time">
                          {new Date(job.scheduledAt).toLocaleTimeString('he-IL', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                        <div className="sc-event-info">
                          <span className="sc-event-group">{job.postGroup?.group?.name || 'קבוצה'}</span>
                          <span className="sc-event-text">
                            {job.postGroup?.post?.content?.slice(0, 80) || 'פוסט מתוזמן'}
                          </span>
                        </div>
                        <div className="sc-event-status">
                          {job.status === 'PENDING' ? '⏳' : '🔄'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ═══════ MONTH VIEW ═══════ */
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

          {/* Weekday headers */}
          <div className="sc-weekdays">
            {HEBREW_DAYS.map(day => (
              <div key={day} className="sc-weekday">{day}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="sc-grid">
            {calendarDays.map((date, i) => (
              <div
                key={i}
                className={`sc-cell ${date ? 'sc-cell-active' : ''} ${date && isToday(date) ? 'sc-today' : ''} ${date && hasEvents(date) ? 'sc-has-events' : ''}`}
                onClick={() => handleDayClick(date)}
              >
                {date && (
                  <>
                    <span className="sc-cell-num">{date.getDate()}</span>
                    {hasEvents(date) && <span className="sc-cell-dot" />}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          {jobs.length === 0 ? (
            <div className="sc-empty">
              <span className="sc-empty-icon">📅</span>
              <p>אין קמפיינים מתוזמנים</p>
              <button onClick={() => navigate('/create-post')} className="sc-empty-btn">
                + צור קמפיין חדש
              </button>
            </div>
          ) : (
            <div className="sc-summary">
              <span className="sc-summary-count">{jobs.length}</span>
              <span className="sc-summary-label">קמפיינים ממתינים לפרסום</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
