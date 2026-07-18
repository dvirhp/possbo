import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useNavigationGuard } from '../context/NavigationGuard'
import { templatesService } from '../services/templatesService'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'
import LocationAutocomplete from '../components/LocationAutocomplete'
import OptimalTimesHint from '../components/OptimalTimesHint'
import EmojiPicker from '../components/EmojiPicker'
import { X, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import '../styles/templates.css'
import '../styles/create-post.css'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function SingleDatePicker({ value, onChange, minDate }) {
  const [open, setOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const d = value ? new Date(value) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const triggerRef = useRef(null)
  const [pickerStyle, setPickerStyle] = useState({})

  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const monthName = calMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = useMemo(() => {
    const arr = []
    for (let i = 0; i < firstDay; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    return arr
  }, [firstDay, daysInMonth])

  const dayToStr = (day) => toDateStr(new Date(year, month, day))
  const isDisabled = (day) => day && minDate && dayToStr(day) < minDate
  const isSelected = (day) => day && dayToStr(day) === value

  const handleDayClick = (day) => {
    if (isDisabled(day)) return
    onChange(dayToStr(day))
    setOpen(false)
  }

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const pickerHeight = 320
      if (spaceBelow >= pickerHeight + 8) {
        setPickerStyle({ top: rect.bottom + 8, left: '50%', transform: 'translateX(-50%)' })
      } else {
        setPickerStyle({ bottom: window.innerHeight - rect.top + 8, left: '50%', transform: 'translateX(-50%)' })
      }
    }
    setOpen(!open)
  }

  const formatDateDisplay = (d) => new Date(d + 'T00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="cp-range-wrap">
      <button type="button" className="cp-range-trigger" ref={triggerRef} onClick={handleOpen}>
        <span className="cp-range-trigger-text">
          {value ? `📅 ${formatDateDisplay(value)}` : '📅 בחר תאריך'}
        </span>
      </button>
      {open && (
        <>
        <div className="cp-range-backdrop" onClick={() => setOpen(false)} />
        <div className="cp-range-picker" style={pickerStyle}>
          <div className="cp-range-nav">
            <button type="button" onClick={() => setCalMonth(new Date(year, month + 1, 1))}>›</button>
            <span>{monthName}</span>
            <button type="button" onClick={() => setCalMonth(new Date(year, month - 1, 1))}>‹</button>
          </div>
          <div className="cp-range-grid">
            {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map(d => (
              <span key={d} className="cp-range-weekday">{d}</span>
            ))}
            {days.map((day, i) => (
              <span
                key={i}
                className={`cp-range-day${!day ? ' empty' : ''}${day && isSelected(day) ? ' range-start range-end' : ''}${day && isDisabled(day) ? ' disabled' : ''}${day && dayToStr(day) === toDateStr(new Date()) ? ' today' : ''}`}
                onClick={() => day && handleDayClick(day)}
              >
                {day || ''}
              </span>
            ))}
          </div>
        </div>
        </>
      )}
    </div>
  )
}

function RecurringDateRange({ startDate, endDate, onStartChange, onEndChange, minDate, initialMonth }) {
  const [open, setOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => {
    const d = initialMonth || new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [hoverDate, setHoverDate] = useState(null)
  const triggerRef = useRef(null)
  const [pickerStyle, setPickerStyle] = useState({})

  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const monthName = calMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = useMemo(() => {
    const arr = []
    for (let i = 0; i < firstDay; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    return arr
  }, [firstDay, daysInMonth])

  const dayToStr = (day) => toDateStr(new Date(year, month, day))

  const isInRange = (day) => {
    if (!day) return false
    const ds = dayToStr(day)
    const start = startDate
    const end = endDate || hoverDate || ''
    if (!start) return false
    if (!end) return ds === start
    const min = start < end ? start : end
    const max = start < end ? end : start
    return ds >= min && ds <= max
  }

  const isStart = (day) => day && dayToStr(day) === startDate
  const isEnd = (day) => day && dayToStr(day) === (endDate || hoverDate)
  const isDisabled = (day) => day && minDate && dayToStr(day) < minDate

  const handleDayClick = (day) => {
    if (isDisabled(day)) return
    const ds = dayToStr(day)
    if (!startDate || endDate) {
      onStartChange(ds)
      onEndChange('')
    } else {
      let from = startDate, to = ds
      if (from > to) [from, to] = [to, from]
      onStartChange(from)
      onEndChange(to)
      setOpen(false)
    }
  }

  const handleDayHover = (day) => {
    if (startDate && !endDate && day && !isDisabled(day)) {
      setHoverDate(dayToStr(day))
    }
  }

  const handleClear = () => {
    onStartChange('')
    onEndChange('')
    setOpen(false)
  }

  const formatDateDisplay = (d) => new Date(d + 'T00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const pickerHeight = 360
      if (spaceBelow >= pickerHeight + 8) {
        setPickerStyle({ top: rect.bottom + 8, left: '50%', transform: 'translateX(-50%)' })
      } else {
        setPickerStyle({ bottom: window.innerHeight - rect.top + 8, left: '50%', transform: 'translateX(-50%)' })
      }
    }
    setOpen(true)
  }

  return (
    <div className="cp-range-wrap">
      <button type="button" className="cp-range-trigger" ref={triggerRef} onClick={handleOpen}>
        {startDate ? (
          <span className="cp-range-trigger-text">
            📅 {formatDateDisplay(startDate)}{endDate ? ` — ${formatDateDisplay(endDate)}` : ''}
          </span>
        ) : (
          <span className="cp-range-trigger-text">📅 בחר תאריך</span>
        )}
      </button>
      {open && (
        <>
        <div className="cp-range-backdrop" onClick={() => setOpen(false)} />
        <div className="cp-range-picker" style={pickerStyle}>
          <div className="cp-range-nav">
            <button type="button" onClick={() => setCalMonth(new Date(year, month + 1, 1))}>›</button>
            <span>{monthName}</span>
            <button type="button" onClick={() => setCalMonth(new Date(year, month - 1, 1))}>‹</button>
          </div>
          <div className="cp-range-grid">
            {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map(d => (
              <span key={d} className="cp-range-weekday">{d}</span>
            ))}
            {days.map((day, i) => (
              <span
                key={i}
                className={`cp-range-day${!day ? ' empty' : ''}${day && isInRange(day) ? ' in-range' : ''}${day && isStart(day) ? ' range-start' : ''}${day && isEnd(day) ? ' range-end' : ''}${day && isDisabled(day) ? ' disabled' : ''}${day && dayToStr(day) === toDateStr(new Date()) ? ' today' : ''}`}
                onClick={() => day && handleDayClick(day)}
                onMouseEnter={() => handleDayHover(day)}
              >
                {day || ''}
              </span>
            ))}
          </div>
          <div className="cp-range-footer">
            {startDate && !endDate && <span className="cp-range-hint">בחר תאריך סיום</span>}
            {startDate && endDate && (
              <span className="cp-range-selected">
                {formatDateDisplay(startDate)} — {formatDateDisplay(endDate)}
              </span>
            )}
            <div className="cp-range-actions">
              {startDate && <button type="button" className="cp-range-clear" onClick={handleClear}>נקה</button>}
              <button type="button" className="cp-range-close" onClick={() => setOpen(false)}>סגור</button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  )
}

function formatNumber(n) {
  if (!n) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export default function TemplateForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { user, setUser, authChecked, groups: cachedGroups } = useAppData()
  const { setDirty, isDirty, guardNavigate } = useNavigationGuard()

  // Form state
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [location, setLocation] = useState('')
  const [showLocation, setShowLocation] = useState(false)
  const [whatsappText, setWhatsappText] = useState('')
  const [showWhatsapp, setShowWhatsapp] = useState(false)
  const [waLinking, setWaLinking] = useState(false)
  const [waTempNumber, setWaTempNumber] = useState('')
  const [waTempMessage, setWaTempMessage] = useState('')
  const [waSaving, setWaSaving] = useState(false)
  const [waEditingMsg, setWaEditingMsg] = useState(false)
  const [scheduleMode, setScheduleMode] = useState('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [recurringDays, setRecurringDays] = useState([])
  const [recurringStartDate, setRecurringStartDate] = useState('')
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [dayTimes, setDayTimes] = useState({})

  // Track unsaved changes
  useEffect(() => {
    const hasDirty = !!(name.trim() || content.trim())
    setDirty(hasDirty, 'יש שינויים שלא נשמרו. לצאת בלי לשמור?')
    return () => setDirty(false)
  }, [name, content, setDirty])

  // Browser tab/refresh guard
  useEffect(() => {
    const handler = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Groups
  const [groups, setGroups] = useState(cachedGroups || [])
  const [selectedGroupIds, setSelectedGroupIds] = useState([])
  const [groupSearch, setGroupSearch] = useState('')
  const [loadingGroups, setLoadingGroups] = useState(!cachedGroups?.length)

  // Images
  const [existingImages, setExistingImages] = useState([])
  const [newImages, setNewImages] = useState([])
  const [newImagePreviews, setNewImagePreviews] = useState([])
  const fileInputRef = useRef(null)
  const contentTextareaRef = useRef(null)

  // UI
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState(null)
  const [showGroupsPicker, setShowGroupsPicker] = useState(false)
  const [showAllSelectedGroups, setShowAllSelectedGroups] = useState(false)

  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
      return
    }
    if (cachedGroups?.length) {
      setGroups(cachedGroups)
      setLoadingGroups(false)
    } else {
      loadGroups()
    }
    if (isEdit) loadTemplate()
  }, [authChecked, user, id])

  const loadGroups = async () => {
    setLoadingGroups(true)
    try {
      const res = await groupsService.getSavedGroups()
      if (res.data.success && res.data.groups) setGroups(res.data.groups)
    } catch { /* silent */ }
    finally { setLoadingGroups(false) }
  }

  const loadTemplate = async () => {
    setLoading(true)
    try {
      const res = await templatesService.get(id)
      if (res.data.success) {
        const t = res.data.template
        setName(t.name)
        setContent(t.content)
        setCampaignTitle(t.campaignTitle || '')
        setIsAnonymous(t.isAnonymous)
        setLocation(t.location || '')
        setShowLocation(!!t.location)
        setWhatsappText(t.whatsappText || '')
        setShowWhatsapp(!!t.whatsappText)
        setScheduleMode(t.scheduleMode || 'now')
        if (t.scheduledDate) {
          const dt = new Date(t.scheduledDate)
          setScheduleDate(toDateStr(dt))
          setScheduleTime(dt.toTimeString().slice(0, 5))
        }
        setRecurringDays(t.recurringDays || [])
        setRecurringStartDate(t.recurringStartDate || '')
        setRecurringEndDate(t.recurringEndDate || '')
        setDayTimes(t.dayTimes || {})
        setSelectedGroupIds(t.groupIds || [])
        setExistingImages(t.imageUrls || [])
      }
    } catch {
      setError('שגיאה בטעינת הטמפלייט')
    } finally {
      setLoading(false)
    }
  }

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    const total = existingImages.length + newImages.length + files.length
    const allowed = files.slice(0, Math.max(0, 10 - existingImages.length - newImages.length))
    if (allowed.length === 0) return
    const updated = [...newImages, ...allowed]
    setNewImages(updated)
    setNewImagePreviews(updated.map(f => URL.createObjectURL(f)))
  }

  const removeExistingImage = (idx) => {
    setExistingImages(prev => prev.filter((_, i) => i !== idx))
  }

  const removeNewImage = (idx) => {
    const updated = newImages.filter((_, i) => i !== idx)
    setNewImages(updated)
    setNewImagePreviews(updated.map(f => URL.createObjectURL(f)))
  }

  const toggleGroup = (groupId) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    )
  }

  const selectAllGroups = () => {
    const filtered = groups
      .filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
      .map(g => g.id)
    setSelectedGroupIds(filtered)
  }

  const deselectAll = () => setSelectedGroupIds([])

  const handleSave = async () => {
    if (!name.trim()) { setError('יש לתת שם לטמפלייט'); return }
    if (!content.trim()) { setError('יש לכתוב תוכן לטמפלייט'); return }

    setSaving(true)
    setError(null)

    try {
      const data = {
        name,
        content,
        campaignTitle: campaignTitle || null,
        isAnonymous,
        location: location || null,
        whatsappText: whatsappText || null,
        scheduleMode,
        scheduledDate: scheduleMode === 'scheduled' && scheduleDate && scheduleTime ? `${scheduleDate}T${scheduleTime}` : null,
        recurringDays,
        recurringStartDate: scheduleMode === 'recurring' ? recurringStartDate || null : null,
        recurringEndDate: scheduleMode === 'recurring' ? recurringEndDate || null : null,
        recurringTimes: Object.values(dayTimes).flat().filter(t => t.trim()),
        dayTimes,
        groupIds: selectedGroupIds,
        existingImages,
      }

      if (isEdit) {
        await templatesService.update(id, data, newImages)
      } else {
        await templatesService.create(data, newImages)
      }
      setDirty(false)
      navigate('/templates')
    } catch (err) {
      setError(err.userMessage || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  )

  const selectedGroups = groups.filter(g => selectedGroupIds.includes(g.id))
  const totalReach = selectedGroups.reduce((sum, g) => sum + (g.memberCount || 0), 0)
  const visibleSelectedGroups = showAllSelectedGroups ? selectedGroups : selectedGroups.slice(0, 5)

  if (!authChecked || !user) return null
  if (loading) return (
    <div className="templates-page">
      <div className="tpl-loading"><img src="/logo.svg" alt="" className="loader-logo-pulse" /><span>טוען...</span></div>
    </div>
  )

  return (
    <div className="templates-page">
      {/* Top Bar */}
      <div className="tpl-topbar">
        <div style={{ width: 40 }} />
        <h1 className="tpl-title">{isEdit ? 'עריכת טמפלייט' : 'טמפלייט חדש'}</h1>
        <button className="tpl-back" onClick={() => guardNavigate(() => navigate('/templates'))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
      </div>

      <div className="tpl-form-layout">
        <div className="tpl-form">

          {/* Template Name */}
          <div className="tpl-field">
            <label className="tpl-label">שם הטמפלייט *</label>
            <input
              type="text"
              className="tpl-input"
              placeholder="לדוגמה: פרסום יומי לקבוצות נדל״ן"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Campaign Title */}
          <div className="tpl-field">
            <label className="tpl-label">כותרת קמפיין</label>
            <input
              type="text"
              className="tpl-input"
              placeholder="כותרת פנימית (לא מתפרסמת)"
              value={campaignTitle}
              onChange={e => setCampaignTitle(e.target.value)}
            />
          </div>

          {/* Content */}
          <div className="tpl-field">
            <label className="tpl-label">תוכן הפוסט *</label>
            <div className="cp-textarea-wrap">
            <textarea
              ref={contentTextareaRef}
              className="tpl-textarea"
              placeholder="מה ברצונך לשתף?"
              rows={6}
              value={content}
              onChange={e => setContent(e.target.value)}
            />
            <EmojiPicker
              textareaRef={contentTextareaRef}
              onSelect={(newText) => setContent(newText)}
            />
            </div>
          </div>

          {/* Anonymous + Location */}
          <div className="tpl-toggles">
            <button
              type="button"
              className={`tpl-toggle-btn ${isAnonymous ? 'active' : ''}`}
              onClick={() => setIsAnonymous(!isAnonymous)}
            >
              🕶️ אנונימי
            </button>
            <button
              type="button"
              className={`tpl-toggle-btn ${showLocation ? 'active' : ''}`}
              onClick={() => setShowLocation(!showLocation)}
            >
              📍 מיקום
            </button>
            <button
              type="button"
              className={`tpl-toggle-btn ${showWhatsapp ? 'active' : ''}`}
              onClick={() => {
                const next = !showWhatsapp
                setShowWhatsapp(next)
                if (next && !whatsappText) {
                  setWhatsappText(`היי! ראיתי את הפוסט שלי "${name || 'טמפלייט'}".\nאשמח לפרטים נוספים 🙏`)
                }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft: 4}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> WhatsApp
            </button>
          </div>

          {showLocation && (
            <div className="tpl-field">
              <LocationAutocomplete
                value={location}
                onChange={setLocation}
                placeholder="הוסף מיקום"
              />
            </div>
          )}

          {waLinking && (
            <div className="cp-whatsapp-wrap">
              <p className="cp-whatsapp-hint">קשר מספר וואטסאפ פעם אחת, יישמר לכל הפוסטים הבאים</p>
              <div className="cp-whatsapp-input">
                <span className="cp-whatsapp-prefix">wa.me/</span>
                <input type="tel" placeholder="972501234567" value={waTempNumber}
                  onChange={(e) => setWaTempNumber(e.target.value)} dir="ltr" />
              </div>
              <div className="cp-whatsapp-input" style={{ marginTop: 8 }}>
                <input type="text" placeholder="הודעה מותאמת (אופציונלי)" value={waTempMessage}
                  onChange={(e) => setWaTempMessage(e.target.value)} dir="rtl" />
              </div>
              <div className="cp-whatsapp-actions">
                <button type="button" className="cp-wa-save-btn" disabled={!waTempNumber.trim() || waSaving} onClick={async () => {
                  setWaSaving(true)
                  try {
                    const res = await authAPI.updateWhatsapp({
                      whatsappNumber: waTempNumber.trim(),
                      whatsappMessage: waTempMessage.trim() || null
                    })
                    if (res.data.success) {
                      setUser(prev => ({ ...prev, whatsappNumber: res.data.whatsappNumber, whatsappMessage: res.data.whatsappMessage || null }))
                      setWhatsappText(waTempMessage.trim() || '')
                      setShowWhatsapp(true)
                      setWaLinking(false)
                    }
                  } catch (e) { /* ignore */ }
                  setWaSaving(false)
                }}>{waSaving ? '⏳' : '💾 שמור וקשר'}</button>
                <button type="button" className="cp-wa-cancel-btn" onClick={() => setWaLinking(false)}>ביטול</button>
              </div>
            </div>
          )}

          {showWhatsapp && user?.whatsappNumber && (
            <div className="cp-whatsapp-wrap cp-whatsapp-active">
              <div className="cp-whatsapp-row">✓ קישור וואטסאפ יצורף לתוכן הפוסט</div>
              <div className="cp-whatsapp-row" dir="ltr">wa.me/{user.whatsappNumber.replace(/[^0-9]/g, '')}{whatsappText ? '?text=...' : ''}</div>
              {whatsappText && !waEditingMsg && <div className="cp-wa-msg-preview">💬 {whatsappText}</div>}
              {!waEditingMsg ? (
                <button type="button" className="cp-wa-edit-btn" onClick={() => setWaEditingMsg(true)}>✏️ ערוך הודעה</button>
              ) : (
                <div className="cp-wa-edit-wrap">
                  <span className="cp-wa-edit-label">הודעה שתוצג בוואטסאפ</span>
                  <textarea
                    placeholder="הודעה מותאמת (אופציונלי)"
                    value={whatsappText}
                    onChange={e => setWhatsappText(e.target.value)}
                    rows={3}
                    dir="rtl"
                  />
                  <button type="button" className="cp-wa-edit-btn" onClick={() => setWaEditingMsg(false)}>✓ סיום עריכה</button>
                </div>
              )}
            </div>
          )}

          {/* Images */}
          <div className="tpl-field">
            <label className="tpl-label">תמונות</label>
            <div className="tpl-images-area">
              {existingImages.map((url, i) => (
                <div key={`ex-${i}`} className="tpl-img-preview">
                  <img src={url} alt="" />
                  <button className="tpl-img-remove" onClick={() => removeExistingImage(i)}>✕</button>
                </div>
              ))}
              {newImagePreviews.map((url, i) => (
                <div key={`new-${i}`} className="tpl-img-preview">
                  <img src={url} alt="" />
                  <button className="tpl-img-remove" onClick={() => removeNewImage(i)}>✕</button>
                </div>
              ))}
              {existingImages.length + newImages.length < 10 && (
                <button
                  type="button"
                  className="tpl-img-add"
                  onClick={() => fileInputRef.current?.click()}
                >
                  + הוסף תמונה
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/quicktime,video/webm"
                multiple
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Groups */}
          <div className="tpl-field">
            <label className="tpl-label">קבוצות</label>

            {/* Selected groups chips */}
            {selectedGroups.length > 0 && (
              <div className="tpl-selected-groups">
                <div className="tpl-selected-chips">
                  {visibleSelectedGroups.map(g => (
                    <div key={g.id} className="tpl-selected-chip">
                      {g.pictureUrl ? <img src={g.pictureUrl} alt="" className="tpl-chip-avatar" /> : <span className="tpl-chip-avatar tpl-chip-avatar-fallback">{g.name?.[0]}</span>}
                      <span className="tpl-chip-name">{g.name}</span>
                      <button type="button" className="tpl-chip-remove" onClick={() => toggleGroup(g.id)}><X size={12} /></button>
                    </div>
                  ))}
                  {selectedGroups.length > 5 && !showAllSelectedGroups && (
                    <button type="button" className="tpl-selected-more" onClick={() => setShowAllSelectedGroups(true)}>
                      +{selectedGroups.length - 5} נוספות
                    </button>
                  )}
                  {showAllSelectedGroups && selectedGroups.length > 5 && (
                    <button type="button" className="tpl-selected-more" onClick={() => setShowAllSelectedGroups(false)}>
                      הצג פחות
                    </button>
                  )}
                </div>
                <div className="tpl-selected-summary">
                  <span className="tpl-groups-count-inline">{selectedGroups.length} קבוצות נבחרו</span>
                  {totalReach > 0 && (
                    <span className="tpl-reach-badge">
                      <Eye size={13} />
                      {formatNumber(totalReach)} חשיפה
                    </span>
                  )}
                </div>
              </div>
            )}

            {loadingGroups ? (
              <div className="tpl-loading-inline">טוען קבוצות...</div>
            ) : groups.length === 0 ? (
              <div className="tpl-no-groups">אין קבוצות שמורות</div>
            ) : (
              <>
                <button type="button" className="tpl-groups-picker-toggle" onClick={() => setShowGroupsPicker(!showGroupsPicker)}>
                  {showGroupsPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showGroupsPicker ? 'סגור בחירת קבוצות' : 'בחר קבוצות'}
                </button>
                {showGroupsPicker && (
                  <>
                    <div className="tpl-groups-toolbar">
                      <input
                        type="text"
                        className="tpl-group-search"
                        placeholder="חפש קבוצה..."
                        value={groupSearch}
                        onChange={e => setGroupSearch(e.target.value)}
                      />
                      <button type="button" className="tpl-groups-toggle" onClick={selectAllGroups}>בחר הכל</button>
                      <button type="button" className="tpl-groups-toggle" onClick={deselectAll}>נקה</button>
                    </div>
                    <div className="tpl-groups-list">
                      {filteredGroups.map(g => (
                        <label key={g.id} className={`tpl-group-item ${selectedGroupIds.includes(g.id) ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            onChange={() => toggleGroup(g.id)}
                          />
                          <span className="tpl-group-name">{g.name}</span>
                          {g.memberCount > 0 && <span className="tpl-group-members">{formatNumber(g.memberCount)} חברים</span>}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Schedule Mode */}
          <div className="tpl-field">
            <label className="tpl-label">מצב תזמון</label>
            <div className="tpl-schedule-modes">
              {[
                { val: 'now', label: 'מיידי', icon: '⚡' },
                { val: 'scheduled', label: 'מתוזמן', icon: '📅' },
                { val: 'recurring', label: 'חוזר', icon: '🔄' },
              ].map(m => (
                <button
                  key={m.val}
                  type="button"
                  className={`tpl-mode-btn ${scheduleMode === m.val ? 'active' : ''}`}
                  onClick={() => setScheduleMode(m.val)}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {scheduleMode !== 'now' && (
              <OptimalTimesHint
                onSelectTime={(time) => {
                  if (scheduleMode === 'scheduled') setScheduleTime(time)
                }}
                onSelectDay={(dayNum) => {
                  if (scheduleMode === 'recurring' && !recurringDays.includes(dayNum)) {
                    setRecurringDays(prev => [...prev, dayNum])
                    setDayTimes(dt => ({ ...dt, [dayNum]: dt[dayNum] || [''] }))
                  }
                }}
              />
            )}

            {scheduleMode === 'scheduled' && (
              <div className="schedule-fields">
                <p className="schedule-desc">בחר תאריך ושעה לפרסום חד-פעמי בעתיד</p>
                <div className="schedule-row-centered">
                  <div className="schedule-field">
                    <label>תאריך</label>
                    <SingleDatePicker
                      value={scheduleDate}
                      onChange={setScheduleDate}
                      minDate={toDateStr(new Date())}
                    />
                  </div>
                  <div className="schedule-field schedule-field-time-wrap">
                    <label>שעה</label>
                    <div
                      className="time-input-wrapper"
                      onClick={(e) => {
                        if (!scheduleDate) {
                          e.preventDefault()
                          e.currentTarget.classList.add('show-tooltip')
                          setTimeout(() => e.currentTarget.classList.remove('show-tooltip'), 2000)
                        }
                      }}
                    >
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        disabled={!scheduleDate}
                        className={!scheduleDate ? 'disabled-input' : ''}
                      />
                      <span className="time-tooltip">נא לבחור תאריך קודם</span>
                    </div>
                  </div>
                </div>
                {scheduleDate && scheduleTime && (
                  <div className="schedule-summary">
                    📅 יפורסם ב-{new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} בשעה {scheduleTime}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recurring config */}
          {scheduleMode === 'recurring' && (
            <div className="schedule-fields">
              <p className="schedule-desc">בחר ימים והגדר שעות לכל יום, הפוסט יפורסם באופן קבוע</p>

              <div className="schedule-section">
                <label className="schedule-section-label">תקופה</label>
                <RecurringDateRange
                  startDate={recurringStartDate}
                  endDate={recurringEndDate}
                  onStartChange={setRecurringStartDate}
                  onEndChange={setRecurringEndDate}
                  minDate={toDateStr(new Date())}
                  initialMonth={recurringStartDate ? new Date(recurringStartDate) : new Date()}
                />
              </div>

              <div className="schedule-section">
                <label className="schedule-section-label">באילו ימים?</label>
                <div className="days-grid">
                  {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`day-btn ${recurringDays.includes(i) ? 'active' : ''}`}
                      onClick={() => {
                        setRecurringDays(prev => {
                          if (prev.includes(i)) {
                            setDayTimes(dt => {
                              const copy = { ...dt }
                              delete copy[i]
                              return copy
                            })
                            return prev.filter(d => d !== i)
                          } else {
                            setDayTimes(dt => ({ ...dt, [i]: [''] }))
                            return [...prev, i]
                          }
                        })
                      }}
                    >
                      {day}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`day-btn day-btn-all ${recurringDays.length === 7 ? 'active' : ''}`}
                    onClick={() => {
                      if (recurringDays.length === 7) {
                        setRecurringDays([])
                        setDayTimes({})
                      } else {
                        setRecurringDays([0, 1, 2, 3, 4, 5, 6])
                        setDayTimes(dt => {
                          const copy = { ...dt }
                          for (let i = 0; i < 7; i++) {
                            if (!copy[i]) copy[i] = ['']
                          }
                          return copy
                        })
                      }
                    }}
                  >
                    כל יום
                  </button>
                </div>
              </div>

              {recurringDays.length > 0 && (
                <div className="schedule-section day-times-section">
                  <label className="schedule-section-label">שעות לכל יום</label>
                  <div className="day-times-list">
                    {recurringDays.sort((a, b) => a - b).map(dayIdx => {
                      const times = dayTimes[dayIdx] || ['']
                      return (
                        <div key={dayIdx} className="day-times-card">
                          <div className="day-times-header">
                            <span className="day-times-day-name">יום {DAY_NAMES[dayIdx]}</span>
                            <span className="day-times-count">{times.filter(t => t).length} שעות</span>
                          </div>
                          <div className="day-times-slots">
                            {times.map((time, ti) => (
                              <div key={ti} className="time-slot">
                                <input
                                  type="time"
                                  value={time}
                                  onChange={(e) => {
                                    setDayTimes(dt => {
                                      const copy = { ...dt }
                                      copy[dayIdx] = [...(copy[dayIdx] || [''])]
                                      copy[dayIdx][ti] = e.target.value
                                      return copy
                                    })
                                  }}
                                />
                                {times.length > 1 && (
                                  <button type="button" className="time-remove-btn" onClick={() => {
                                    setDayTimes(dt => {
                                      const copy = { ...dt }
                                      copy[dayIdx] = copy[dayIdx].filter((_, idx) => idx !== ti)
                                      return copy
                                    })
                                  }}>✕</button>
                                )}
                              </div>
                            ))}
                            {times.length < 5 && (
                              <button type="button" className="time-add-btn" onClick={() => {
                                setDayTimes(dt => {
                                  const copy = { ...dt }
                                  copy[dayIdx] = [...(copy[dayIdx] || ['']), '']
                                  return copy
                                })
                              }}>
                                + שעה נוספת
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {recurringDays.length > 0 && Object.values(dayTimes).some(ts => ts.some(t => t)) && recurringStartDate && (
                <div className="schedule-summary">
                  🔄 לוח פרסום:
                  {recurringDays.sort((a, b) => a - b).map(d => {
                    const ts = (dayTimes[d] || []).filter(t => t)
                    return ts.length ? `\n• ${DAY_NAMES[d]}: ${ts.join(', ')}` : null
                  }).filter(Boolean).join('')}
                  {`\nהחל מ-${new Date(recurringStartDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                  {recurringEndDate && ` עד ${new Date(recurringEndDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                </div>
              )}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="tpl-save-error">
              <span>⚠️ {error}</span>
              <button type="button" className="tpl-save-error-close" onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* Save buttons */}
          <div className="tpl-form-actions">
            <button
              className="tpl-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '⏳ שומר...' : isEdit ? '💾 שמור שינויים' : '✨ צור טמפלייט'}
            </button>
            <button
              className="tpl-cancel-btn"
              onClick={() => guardNavigate(() => navigate('/templates'))}
              disabled={saving}
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
