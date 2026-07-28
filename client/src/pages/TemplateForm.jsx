import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useNavigationGuard } from '../context/NavigationGuard'
import { templatesService } from '../services/templatesService'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'
import LocationAutocomplete from '../components/LocationAutocomplete'
import OptimalTimesHint from '../components/OptimalTimesHint'
import EmojiPicker from '../components/EmojiPicker'
import BrandLogo from '../components/BrandLogo'
import { X, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import '../styles/templates.css'
import '../styles/create-post.css'

const TEMPLATE_SCHEDULING_ENABLED = false

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
  const routeLocation = useLocation()
  const generatedContent = routeLocation.state?.generatedContent || ''
  const returnedDraft = routeLocation.state?.templateDraft || null
  const {
    user,
    setUser,
    authChecked,
    groups: cachedGroups,
    waGroups,
    waBroadcastLists,
    loadWaGroups,
  } = useAppData()
  const { setDirty, isDirty, guardNavigate } = useNavigationGuard()

  // Form state
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [location, setLocation] = useState('')
  const [showLocation, setShowLocation] = useState(false)
  const [whatsappText, setWhatsappText] = useState(returnedDraft?.whatsappText || user?.whatsappMessage || '')
  const [showWhatsapp, setShowWhatsapp] = useState(false)
  const [waLinking, setWaLinking] = useState(false)
  const [waTempNumber, setWaTempNumber] = useState('')
  const [waTempMessage, setWaTempMessage] = useState('')
  const [waSaving, setWaSaving] = useState(false)
  const [waEditingMsg, setWaEditingMsg] = useState(false)
  const [selectedWaTargets, setSelectedWaTargets] = useState([])
  const [waTargetTab, setWaTargetTab] = useState('groups')
  const [waTargetSearch, setWaTargetSearch] = useState('')
  const [showWaTargetsPicker, setShowWaTargetsPicker] = useState(false)
  const [distributionTab, setDistributionTab] = useState('facebook')

  // Groups scheduling
  const [scheduleMode, setScheduleMode] = useState('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [recurringDays, setRecurringDays] = useState([])
  const [recurringStartDate, setRecurringStartDate] = useState('')
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [dayTimes, setDayTimes] = useState({})

  // Profile scheduling
  const [publishToProfile, setPublishToProfile] = useState(false)
  const [profileScheduleMode, setProfileScheduleMode] = useState('now')
  const [profileScheduleDate, setProfileScheduleDate] = useState('')
  const [profileScheduleTime, setProfileScheduleTime] = useState('')
  const [profileRecurringDays, setProfileRecurringDays] = useState([])
  const [profileDayTimes, setProfileDayTimes] = useState({})
  const [profileRecurringStartDate, setProfileRecurringStartDate] = useState('')
  const [profileRecurringEndDate, setProfileRecurringEndDate] = useState('')

  // Instagram scheduling
  const [instagramEnabled, setInstagramEnabled] = useState(false)
  const [instagramPublishTypes, setInstagramPublishTypes] = useState(['FEED']) // array of 'FEED' | 'STORY' | 'REEL'
  const [storyMediaMode, setStoryMediaMode] = useState('first') // 'first' | 'all' | 'pick'
  const [storyPickedIndex, setStoryPickedIndex] = useState(0)
  const igCheckedRef = useRef(false)

  // Live-check Instagram connection when tab is first opened
  const checkInstagramStatus = useCallback(async () => {
    if (igCheckedRef.current || user?.instagramConnected) return
    igCheckedRef.current = true
    try {
      const res = await authAPI.getInstagramStatus()
      if (res?.data?.connected) {
        const updates = { instagramConnected: true, instagramUsername: res.data.account?.username }
        if (res.data.avatarUrl) updates.avatarUrl = res.data.avatarUrl
        setUser(prev => ({ ...prev, ...updates }))
        setInstagramEnabled(true)
      }
    } catch { /* ignore */ }
  }, [user?.instagramConnected, setUser])
  const [igScheduleMode, setIgScheduleMode] = useState('now')
  const [igScheduleDate, setIgScheduleDate] = useState('')
  const [igScheduleTime, setIgScheduleTime] = useState('')
  const [igRecurringDays, setIgRecurringDays] = useState([])
  const [igDayTimes, setIgDayTimes] = useState({})
  const [igRecurringStartDate, setIgRecurringStartDate] = useState('')
  const [igRecurringEndDate, setIgRecurringEndDate] = useState('')

  // Schedule sub-tab
  const [scheduleSubTab, setScheduleSubTab] = useState('groups')

  // Check Instagram status on mount
  useEffect(() => { checkInstagramStatus() }, [checkInstagramStatus])

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
  const allImagePreviews = [...existingImages, ...newImagePreviews]
  const fileInputRef = useRef(null)
  const contentTextareaRef = useRef(null)

  // UI
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!returnedDraft) return
    setName(returnedDraft.name || '')
    setCampaignTitle(returnedDraft.campaignTitle || '')
    setContent(generatedContent || returnedDraft.content || '')
    setIsAnonymous(!!returnedDraft.isAnonymous)
    setLocation(returnedDraft.location || '')
    setShowLocation(!!returnedDraft.showLocation)
    setWhatsappText(returnedDraft.whatsappText || user?.whatsappMessage || '')
    setShowWhatsapp(!!returnedDraft.showWhatsapp)
    setSelectedGroupIds(returnedDraft.selectedGroupIds || [])
    setPublishToProfile(!!returnedDraft.publishToProfile)
    setInstagramEnabled(!!returnedDraft.instagramEnabled)
    setInstagramPublishTypes(returnedDraft.instagramPublishTypes || ['FEED'])
    setStoryMediaMode(returnedDraft.storyMediaMode || 'first')
    setStoryPickedIndex(returnedDraft.storyPickedIndex || 0)
    setSelectedWaTargets(returnedDraft.selectedWaTargets || [])
    setExistingImages(returnedDraft.existingImages || [])
    setNewImages(returnedDraft.newImages || [])
    setNewImagePreviews(returnedDraft.newImagePreviews || [])
  }, []) // restore the form once after returning from the AI generator
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
        setContent(generatedContent || t.content)
        setCampaignTitle(t.campaignTitle || '')
        setIsAnonymous(t.isAnonymous)
        setLocation(t.location || '')
        setShowLocation(!!t.location)
        setWhatsappText(t.whatsappText || user?.whatsappMessage || '')
        setShowWhatsapp(!!t.whatsappText)
        setSelectedWaTargets(Array.isArray(t.whatsappTargets) ? t.whatsappTargets : [])
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
        // Profile
        setPublishToProfile(!!t.publishToProfile)
        setProfileScheduleMode(t.profileScheduleMode || 'now')
        setProfileScheduleDate(t.profileScheduleDate || '')
        setProfileScheduleTime(t.profileScheduleTime || '')
        setProfileRecurringDays(t.profileRecurringDays || [])
        setProfileDayTimes(t.profileDayTimes || {})
        setProfileRecurringStartDate(t.profileRecurringStartDate || '')
        setProfileRecurringEndDate(t.profileRecurringEndDate || '')
        // Instagram
        setInstagramEnabled(!!t.instagramEnabled)
        const igTypes = t.instagramPublishTypes || (t.instagramPublishType ? [t.instagramPublishType] : ['FEED'])
        setInstagramPublishTypes(igTypes)
        setStoryMediaMode(t.storyMediaMode || 'first')
        setStoryPickedIndex(t.storyPickedIndex || 0)
        setIgScheduleMode(t.igScheduleMode || 'now')
        setIgScheduleDate(t.igScheduleDate || '')
        setIgScheduleTime(t.igScheduleTime || '')
        setIgRecurringDays(t.igRecurringDays || [])
        setIgDayTimes(t.igDayTimes || {})
        setIgRecurringStartDate(t.igRecurringStartDate || '')
        setIgRecurringEndDate(t.igRecurringEndDate || '')
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
        scheduleMode: null,
        scheduledDate: null,
        recurringDays: [],
        recurringStartDate: null,
        recurringEndDate: null,
        recurringTimes: [],
        dayTimes: null,
        groupIds: selectedGroupIds,
        whatsappEnabled: selectedWaTargets.length > 0,
        whatsappTargets: selectedWaTargets.length > 0 ? selectedWaTargets : null,
        existingImages,
        // Profile scheduling
        publishToProfile,
        profileScheduleMode: null,
        profileScheduleDate: null,
        profileScheduleTime: null,
        profileRecurringDays: [],
        profileDayTimes: null,
        profileRecurringStartDate: null,
        profileRecurringEndDate: null,
        // Instagram scheduling
        instagramEnabled,
        instagramPublishTypes: instagramEnabled ? instagramPublishTypes : null,
        storyMediaMode: instagramEnabled && instagramPublishTypes.includes('STORY') ? storyMediaMode : null,
        storyPickedIndex: instagramEnabled && instagramPublishTypes.includes('STORY') && storyMediaMode === 'pick' ? storyPickedIndex : null,
        igScheduleMode: null,
        igScheduleDate: null,
        igScheduleTime: null,
        igRecurringDays: [],
        igDayTimes: null,
        igRecurringStartDate: null,
        igRecurringEndDate: null,
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
  const waSearchLower = waTargetSearch.trim().toLowerCase()
  const waItems = [
    ...(waGroups || []).map(g => ({ id: g.id, type: 'group', name: g.name, size: g.participants || null })),
    ...(waBroadcastLists || []).map(list => ({ id: list.id, type: 'broadcast', name: list.name, size: list.members?.length || 0 })),
  ]
  const visibleWaItems = waItems.filter(item =>
    (!waSearchLower ? item.type === (waTargetTab === 'groups' ? 'group' : 'broadcast') : true) &&
    (!waSearchLower || item.name?.toLowerCase().includes(waSearchLower))
  )
  const toggleWaTarget = (item) => {
    setSelectedWaTargets(prev => {
      const selected = prev.some(target => target.id === item.id && target.type === item.type)
      return selected
        ? prev.filter(target => !(target.id === item.id && target.type === item.type))
        : [...prev, { id: item.id, type: item.type, name: item.name }]
    })
  }

  if (!authChecked || !user) return null
  if (loading) return (
    <div className="templates-page">
      <div className="tpl-loading"><BrandLogo decorative className="loader-logo-pulse" /><span>טוען...</span></div>
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

          {/* ═══ Section: Template Info ═══ */}
          <div className="tpl-section-card">
            <div className="tpl-section-header">📋 פרטי טמפלייט</div>

            {/* Template Name */}
            <div className="tpl-field">
              <label className="tpl-label">שם הטמפלייט *</label>
              <input
                type="text"
                className="tpl-input"
                placeholder="לדוגמה: פרסום יומי לקבוצות נדל״ן"
                aria-label="שם הטמפלייט"
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
                aria-label="כותרת קמפיין"
                value={campaignTitle}
                onChange={e => setCampaignTitle(e.target.value)}
              />
            </div>
          </div>

          {/* ═══ Section: Content ═══ */}
          <div className="tpl-section-card">
            <div className="tpl-section-header">✍️ תוכן</div>

            {/* Content */}
            <div className="tpl-field">
              <label className="tpl-label">תוכן הפוסט *</label>
              <div className="cp-textarea-wrap">
              <textarea
                ref={contentTextareaRef}
                className="tpl-textarea"
                placeholder="מה ברצונך לשתף?"
                aria-label="תוכן הפוסט"
                rows={6}
                value={content}
                onChange={e => setContent(e.target.value)}
              />
              <div className="tpl-content-editor-toolbar">
                <EmojiPicker
                  textareaRef={contentTextareaRef}
                  onSelect={(newText) => setContent(newText)}
                />
                <button
                  type="button"
                  className="cp-ai-generate-btn tpl-ai-generate-btn"
                  onClick={() => navigate('/generate-post', {
                    state: {
                      fromTemplateForm: true,
                      templateId: id || null,
                      templateDraft: {
                        name,
                        campaignTitle,
                        content,
                        isAnonymous,
                        location,
                        showLocation,
                        whatsappText,
                        showWhatsapp,
                        selectedGroupIds,
                        publishToProfile,
                        instagramEnabled,
                        instagramPublishTypes,
                        storyMediaMode,
                        storyPickedIndex,
                        selectedWaTargets,
                        existingImages,
                        newImages,
                        newImagePreviews,
                      },
                    },
                  })}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3Z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8L19 14Z"/></svg>
                  יצירת תוכן עם AI
                </button>
              </div>
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
              className={`tpl-toggle-btn tpl-toggle-whatsapp ${showWhatsapp ? 'active' : ''}`}
              onClick={() => {
                const next = !showWhatsapp
                setShowWhatsapp(next)
                if (next && !whatsappText) {
                  setWhatsappText(user?.whatsappMessage || '')
                }
                if (next && !user?.whatsappNumber) {
                  setWaTempNumber('')
                  setWaTempMessage(whatsappText || user?.whatsappMessage || '')
                  setWaLinking(true)
                } else if (!next) {
                  setWaLinking(false)
                  setWaEditingMsg(false)
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
            <div className="cp-whatsapp-wrap cp-whatsapp-active tpl-whatsapp-content-card">
              <div className="tpl-whatsapp-content-heading">
                <span className="tpl-whatsapp-content-check">✓</span>
                <div>
                  <strong>קישור WhatsApp פעיל</strong>
                  <span>הקישור יצורף לתוכן הפוסט</span>
                </div>
              </div>
              <div className="cp-whatsapp-row tpl-whatsapp-link-preview" dir="ltr">wa.me/{user.whatsappNumber.replace(/[^0-9]/g, '')}{whatsappText ? '?text=...' : ''}</div>
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
                  <button className="tpl-img-remove" onClick={() => removeExistingImage(i)} aria-label={`הסר תמונה ${i + 1}`}>✕</button>
                </div>
              ))}
              {newImagePreviews.map((url, i) => (
                <div key={`new-${i}`} className="tpl-img-preview">
                  <img src={url} alt="" />
                  <button className="tpl-img-remove" onClick={() => removeNewImage(i)} aria-label={`הסר תמונה ${i + 1}`}>✕</button>
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
                aria-label="בחר תמונות או סרטונים"
                style={{ display: 'none' }}
              />
            </div>
          </div>
          </div>

          {/* ═══ Section: Distribution ═══ */}
          <div className="tpl-section-card">
            <div className="tpl-section-header">📢 תפוצה</div>
            <div className="tpl-distribution-tabs" role="tablist" aria-label="בחירת ערוץ תפוצה">
              <button
                type="button"
                role="tab"
                aria-selected={distributionTab === 'facebook'}
                className={distributionTab === 'facebook' ? 'active facebook' : ''}
                onClick={() => setDistributionTab('facebook')}
              >
                <svg className="tpl-distribution-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.026 4.388 11.02 10.125 11.927v-8.432H7.078v-3.495h3.047V9.41c0-3.025 1.792-4.696 4.533-4.696 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.885v2.267h3.328l-.532 3.495h-2.796V24C19.612 23.093 24 18.099 24 12.073z"/>
                </svg>
                <span>Facebook</span>
                {(selectedGroupIds.length > 0 || publishToProfile) && (
                  <small>{selectedGroupIds.length + (publishToProfile ? 1 : 0)}</small>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={distributionTab === 'instagram'}
                className={distributionTab === 'instagram' ? 'active instagram' : ''}
                onClick={() => setDistributionTab('instagram')}
              >
                <svg className="tpl-distribution-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <defs>
                    <linearGradient id="tpl-instagram-tab-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ffdc80"/>
                      <stop offset="48%" stopColor="#e1306c"/>
                      <stop offset="100%" stopColor="#833ab4"/>
                    </linearGradient>
                  </defs>
                  <path fill="url(#tpl-instagram-tab-gradient)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12s.014 3.668.072 4.948c.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24s3.668-.014 4.948-.072c4.354-.2 6.782-2.618 6.979-6.98C23.986 15.668 24 15.259 24 12s-.014-3.667-.072-4.947c-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838A6.162 6.162 0 1 0 12 18.162 6.162 6.162 0 0 0 12 5.838zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
                </svg>
                <span>Instagram</span>
                {instagramEnabled && <small>{instagramPublishTypes.length}</small>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={distributionTab === 'whatsapp'}
                className={distributionTab === 'whatsapp' ? 'active whatsapp' : ''}
                onClick={() => setDistributionTab('whatsapp')}
              >
                <svg className="tpl-distribution-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.463 3.488A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                </svg>
                <span>WhatsApp</span>
                {selectedWaTargets.length > 0 && <small>{selectedWaTargets.length}</small>}
              </button>
            </div>

            {/* ─── Facebook section ─── */}
            {distributionTab === 'facebook' && (
            <div className="tpl-dist-platform">
              <div className="tpl-dist-platform-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span className="tpl-dist-platform-title">Facebook</span>
                {(selectedGroupIds.length > 0 || publishToProfile) && <span className="tpl-dist-platform-badge">{selectedGroupIds.length > 0 ? `${selectedGroupIds.length} קבוצות` : ''}{selectedGroupIds.length > 0 && publishToProfile ? ' + ' : ''}{publishToProfile ? 'פרופיל' : ''}</span>}
              </div>

              {/* Groups */}
              <div className="tpl-platform-section">
                <div className="tpl-platform-section-title">👥 קבוצות</div>

                {selectedGroups.length > 0 && (
                  <div className="tpl-selected-groups">
                    <div className="tpl-selected-chips">
                      {visibleSelectedGroups.map(g => (
                        <div key={g.id} className="tpl-selected-chip">
                          {g.pictureUrl ? <img src={g.pictureUrl} alt="" className="tpl-chip-avatar" /> : <span className="tpl-chip-avatar tpl-chip-avatar-fallback">{g.name?.[0]}</span>}
                          <span className="tpl-chip-name">{g.name}</span>
                          <button type="button" className="tpl-chip-remove" onClick={() => toggleGroup(g.id)} aria-label={`הסר את ${g.name || 'הקבוצה'} מהבחירה`}><X size={12} /></button>
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
                          <input type="text" className="tpl-group-search" placeholder="חפש קבוצה..." value={groupSearch} onChange={e => setGroupSearch(e.target.value)} aria-label="חיפוש קבוצה" />
                          <button type="button" className="tpl-groups-toggle" onClick={selectAllGroups}>בחר הכל</button>
                          <button type="button" className="tpl-groups-toggle" onClick={deselectAll}>נקה</button>
                        </div>
                        <div className="tpl-groups-list">
                          {filteredGroups.map(g => (
                            <label key={g.id} className={`tpl-group-item ${selectedGroupIds.includes(g.id) ? 'selected' : ''}`}>
                              <input type="checkbox" checked={selectedGroupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} aria-label={`בחר את ${g.name || 'הקבוצה'}`} />
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

              {/* Profile */}
              <div className="tpl-platform-section" style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.06))', paddingTop: 14, marginTop: 14 }}>
                <label className="tpl-toggle-row">
                  <input type="checkbox" checked={publishToProfile} onChange={(e) => setPublishToProfile(e.target.checked)} aria-label="פרסם גם בפרופיל" />
                  <span>👤 פרסום לפרופיל אישי</span>
                </label>
              </div>
            </div>
            )}

            {/* ─── Instagram section ─── */}
            {distributionTab === 'instagram' && (
            <div className="tpl-dist-platform tpl-dist-platform-ig">
              <div className="tpl-dist-platform-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="url(#ig-dist-tpl)">
                  <defs>
                    <linearGradient id="ig-dist-tpl" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#FFDC80" />
                      <stop offset="50%" stopColor="#E1306C" />
                      <stop offset="100%" stopColor="#833AB4" />
                    </linearGradient>
                  </defs>
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
                <span className="tpl-dist-platform-title">Instagram</span>
                {instagramEnabled && <span className="tpl-dist-platform-badge">{instagramPublishTypes.map(t => t === 'FEED' ? 'פוסט' : t === 'STORY' ? 'סטורי' : 'ריל').join(', ')}</span>}
              </div>

              {!user?.instagramConnected ? (
                <div className="cp-ig-connect-notice" style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
                  <h3 style={{ margin: '0 0 8px' }}>חבר את חשבון האינסטגרם שלך</h3>
                  <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px' }}>כדי לפרסם באינסטגרם, יש לחבר חשבון Instagram מסוג <strong>Business</strong> או <strong>Creator</strong>.</p>
                  <button
                    type="button"
                    className="cp-ig-connect-btn"
                    onClick={() => navigate('/dashboard?tab=settings')}
                    style={{ margin: '0 auto' }}
                  >
                    חבר חשבון Instagram
                  </button>
                </div>
              ) : (
              <>
              <div className="tpl-platform-section-title" style={{ marginBottom: 10 }}>
                סוג פרסום
              </div>
              <div className="cp-ig-type-grid">
                {[
                  { val: 'FEED', label: 'פוסט', icon: '🖼️', desc: 'פוסט בפיד האינסטגרם' },
                  { val: 'STORY', label: 'סטורי', icon: '⏱️', desc: 'סטורי שנעלם אחרי 24 שעות' },
                  { val: 'REEL', label: 'ריל', icon: '🎬', desc: 'סרטון קצר בפורמט Reels' },
                ].map(t => (
                  <button
                    key={t.val}
                    type="button"
                    className={`cp-ig-type-card ${instagramPublishTypes.includes(t.val) ? 'active' : ''}`}
                    onClick={() => {
                      setInstagramPublishTypes(prev => {
                        const next = prev.includes(t.val)
                          ? prev.filter(v => v !== t.val)
                          : [...prev, t.val]
                        setInstagramEnabled(next.length > 0)
                        return next
                      })
                    }}
                  >
                    <span className="cp-ig-type-icon">{t.icon}</span>
                    <span className="cp-ig-type-name">{t.label}</span>
                    <span className="cp-ig-type-desc">{t.desc}</span>
                  </button>
                ))}
              </div>
              {instagramPublishTypes.length > 1 && (
                <div className="cp-ig-hint" style={{ marginTop: 10 }}>
                  <span>✨</span>
                  <span>התוכן יפורסם ב-{instagramPublishTypes.length} סוגים במקביל</span>
                </div>
              )}

              {/* Story options */}
              {instagramPublishTypes.includes('STORY') && (
                <div className="cp-ig-media-options" style={{ marginTop: 12 }}>
                  <div className="cp-ig-hint">
                    <span>💡</span>
                    <span>סטורי נעלם אחרי 24 שעות מרגע הפרסום</span>
                  </div>
                  {allImagePreviews.length > 1 && (
                    <>
                      <div className="cp-ig-media-notice" style={{ marginTop: 8 }}>
                        <span className="cp-ig-media-notice-icon">ℹ️</span>
                        <span>סטורי תומך בתמונה/סרטון <strong>אחד בלבד</strong>. יש {allImagePreviews.length} קבצים — בחרי מה לעשות:</span>
                      </div>
                      <div className="cp-ig-media-choices">
                        <label className={`cp-ig-media-choice ${storyMediaMode === 'first' ? 'active' : ''}`}>
                          <input type="radio" name="tplStoryMedia" checked={storyMediaMode === 'first'} onChange={() => setStoryMediaMode('first')} aria-label="בחר תמונה ראשונה לסטורי" />
                          <div className="cp-ig-media-choice-content">
                            <span className="cp-ig-media-choice-title">📸 פרסם רק את הראשונה</span>
                            <span className="cp-ig-media-choice-desc">סטורי אחד עם התמונה הראשונה</span>
                          </div>
                        </label>
                        <label className={`cp-ig-media-choice ${storyMediaMode === 'all' ? 'active' : ''}`}>
                          <input type="radio" name="tplStoryMedia" checked={storyMediaMode === 'all'} onChange={() => setStoryMediaMode('all')} aria-label="בחר את כל התמונות לסטורי" />
                          <div className="cp-ig-media-choice-content">
                            <span className="cp-ig-media-choice-title">📚 פרסם סטורי לכל תמונה</span>
                            <span className="cp-ig-media-choice-desc">{allImagePreviews.length} סטוריז נפרדים</span>
                          </div>
                        </label>
                        <label className={`cp-ig-media-choice ${storyMediaMode === 'pick' ? 'active' : ''}`}>
                          <input type="radio" name="tplStoryMedia" checked={storyMediaMode === 'pick'} onChange={() => setStoryMediaMode('pick')} aria-label="בחר תמונה ידנית לסטורי" />
                          <div className="cp-ig-media-choice-content">
                            <span className="cp-ig-media-choice-title">🎯 בחר תמונה ספציפית</span>
                            <span className="cp-ig-media-choice-desc">בחרי איזו תמונה תופיע בסטורי</span>
                          </div>
                        </label>
                      </div>
                      {storyMediaMode === 'pick' && (
                        <div className="cp-ig-image-picker">
                          {allImagePreviews.map((img, i) => (
                            <button key={i} type="button" className={`cp-ig-image-pick-item ${storyPickedIndex === i ? 'active' : ''}`} onClick={() => setStoryPickedIndex(i)}>
                              <img src={img} alt={`תמונה ${i + 1}`} />
                              {storyPickedIndex === i && <span className="cp-ig-image-pick-check">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Reel options */}
              {instagramPublishTypes.includes('REEL') && (
                <div className="cp-ig-media-options" style={{ marginTop: 12 }}>
                  {(() => {
                    const hasVideo = newImages.some(f => f?.type?.startsWith('video/'))
                    const hasOnlyImages = allImagePreviews.length > 0 && !hasVideo
                    if (hasVideo) {
                      return <div className="cp-ig-hint cp-ig-hint-success"><span>✅</span><span>סרטון זוהה — הוא ישמש כריל שלך.</span></div>
                    }
                    if (hasOnlyImages) {
                      return (
                        <div className="cp-ig-media-notice cp-ig-media-notice-warn">
                          <span className="cp-ig-media-notice-icon">⚠️</span>
                          <span>ריל דורש <strong>סרטון</strong>. הועלו רק תמונות — החליפי לסרטון או בחרי סוג פרסום אחר.</span>
                        </div>
                      )
                    }
                    return <div className="cp-ig-hint"><span>💡</span><span>ריל דורש סרטון. הוסיפי סרטון בקטע המדיה.</span></div>
                  })()}
                </div>
              )}

              {/* Feed hint */}
              {instagramPublishTypes.includes('FEED') && allImagePreviews.length === 0 && (
                <div className="cp-ig-hint" style={{ marginTop: 12 }}>
                  <span>💡</span>
                  <span>פוסט בפיד דורש לפחות תמונה אחת. הוסיפי תמונה בקטע המדיה.</span>
                </div>
              )}
              </>
              )}
            </div>
            )}

            {/* WhatsApp distribution */}
            {distributionTab === 'whatsapp' && (
            <div className="tpl-dist-platform tpl-dist-platform-wa">
              <div className="tpl-dist-platform-header">
                <span className="tpl-wa-platform-icon" aria-hidden="true">💬</span>
                <span className="tpl-dist-platform-title">WhatsApp</span>
                {selectedWaTargets.length > 0 && (
                  <span className="tpl-dist-platform-badge">{selectedWaTargets.length} יעדים</span>
                )}
              </div>

              {!user?.whatsappSessionConnected ? (
                <div className="tpl-wa-connect-notice">
                  <strong>חיבור WhatsApp נדרש</strong>
                  <span>חברו את WhatsApp כדי לבחור קבוצות ורשימות תפוצה לטמפלייט.</span>
                  <button type="button" onClick={() => navigate('/dashboard?tab=settings')}>
                    מעבר להגדרות
                  </button>
                </div>
              ) : (
                <div className="tpl-platform-section">
                  {selectedWaTargets.length > 0 && (
                    <div className="tpl-selected-chips tpl-wa-selected-chips">
                      {selectedWaTargets.map(target => (
                        <div key={`${target.type}-${target.id}`} className="tpl-selected-chip">
                          <span className="tpl-chip-avatar tpl-chip-avatar-fallback">
                            {target.type === 'group' ? '👥' : '📢'}
                          </span>
                          <span className="tpl-chip-name">{target.name}</span>
                          <button
                            type="button"
                            className="tpl-chip-remove"
                            onClick={() => toggleWaTarget(target)}
                            aria-label={`הסר את ${target.name}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="tpl-groups-picker-toggle tpl-wa-picker-toggle"
                    onClick={() => {
                      const next = !showWaTargetsPicker
                      setShowWaTargetsPicker(next)
                      if (next) loadWaGroups()
                    }}
                  >
                    {showWaTargetsPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showWaTargetsPicker ? 'סגור בחירת יעדים' : 'בחר יעדי WhatsApp'}
                  </button>

                  {showWaTargetsPicker && (
                    <div className="tpl-wa-picker">
                      <input
                        type="search"
                        className="tpl-group-search tpl-wa-search"
                        placeholder="חפש קבוצה או רשימת תפוצה..."
                        value={waTargetSearch}
                        onChange={event => setWaTargetSearch(event.target.value)}
                        aria-label="חיפוש יעד WhatsApp"
                      />

                      {!waSearchLower && (
                        <div className="tpl-wa-tabs" role="tablist" aria-label="סוג יעד WhatsApp">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={waTargetTab === 'groups'}
                            className={waTargetTab === 'groups' ? 'active' : ''}
                            onClick={() => setWaTargetTab('groups')}
                          >
                            קבוצות WhatsApp
                            <span>{waGroups?.length || 0}</span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={waTargetTab === 'broadcasts'}
                            className={waTargetTab === 'broadcasts' ? 'active' : ''}
                            onClick={() => setWaTargetTab('broadcasts')}
                          >
                            רשימות תפוצה
                            <span>{waBroadcastLists?.length || 0}</span>
                          </button>
                        </div>
                      )}

                      <div className="tpl-wa-target-list">
                        {visibleWaItems.length > 0 ? visibleWaItems.map(item => {
                          const selected = selectedWaTargets.some(target => target.id === item.id && target.type === item.type)
                          return (
                            <label key={`${item.type}-${item.id}`} className={`tpl-group-item ${selected ? 'selected' : ''}`}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleWaTarget(item)}
                                aria-label={`בחר את ${item.name}`}
                              />
                              <span className="tpl-wa-target-type">{item.type === 'group' ? '👥' : '📢'}</span>
                              <span className="tpl-group-name">{item.name}</span>
                              {item.size != null && <span className="tpl-group-members">{item.size} משתתפים</span>}
                            </label>
                          )
                        }) : (
                          <div className="tpl-no-groups">
                            {waSearchLower ? 'לא נמצאו תוצאות בקבוצות או ברשימות תפוצה' : 'אין יעדים להצגה בטאב זה'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
          </div>

          {/* ═══ Section: Scheduling ═══ */}
          {/* Schedule Mode */}
          {TEMPLATE_SCHEDULING_ENABLED && (() => {
            const targets = []
            if (selectedGroupIds.length > 0) targets.push('groups')
            if (publishToProfile) targets.push('profile')
            if (instagramEnabled) targets.push('instagram')
            const activeTab = targets.includes(scheduleSubTab) ? scheduleSubTab : targets[0]
            const showSubTabs = targets.length > 1

            if (targets.length === 0) return null

            return (
            <div className="tpl-section-card">
              <div className="tpl-section-header">⏰ תזמון</div>
            <div className="tpl-field">

              <div className="cp-schedule-hint-bubble">
                בחרו את התזמון לכל פלטפורמה בנפרד: מיידי, חד-פעמי או חוזר.
              </div>

              {/* Sub-tabs */}
              {showSubTabs && (
                <div className="cp-schedule-sub-tabs" style={{ padding: 0, marginBottom: 14 }}>
                  {selectedGroupIds.length > 0 && (
                    <button type="button" className={`cp-schedule-sub-tab ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setScheduleSubTab('groups')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      <span>קבוצות ({selectedGroupIds.length})</span>
                      {scheduleMode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                    </button>
                  )}
                  {publishToProfile && (
                    <button type="button" className={`cp-schedule-sub-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setScheduleSubTab('profile')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      <span>פרופיל</span>
                      {profileScheduleMode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                    </button>
                  )}
                  {instagramEnabled && (
                    <button type="button" className={`cp-schedule-sub-tab cp-schedule-sub-tab-ig ${activeTab === 'instagram' ? 'active' : ''}`} onClick={() => setScheduleSubTab('instagram')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="url(#ig-subtab-tpl)">
                        <defs>
                          <linearGradient id="ig-subtab-tpl" x1="0%" y1="100%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#FFDC80" />
                            <stop offset="50%" stopColor="#E1306C" />
                            <stop offset="100%" stopColor="#833AB4" />
                          </linearGradient>
                        </defs>
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                      </svg>
                      <span>{instagramPublishTypes.map(t => t === 'FEED' ? 'פוסט' : t === 'STORY' ? 'סטורי' : 'ריל').join(', ')}</span>
                      {igScheduleMode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                    </button>
                  )}
                </div>
              )}

              {/* ═══ Groups Scheduler ═══ */}
              {activeTab === 'groups' && (
                <div className="cp-schedule">
                  <div className="schedule-tabs">
                    <button type="button" className={`schedule-tab ${scheduleMode === 'now' ? 'active' : ''}`} onClick={() => setScheduleMode('now')}>
                      <span className="schedule-tab-icon">⚡</span><span>עכשיו</span>
                    </button>
                    <button type="button" className={`schedule-tab ${scheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => { setScheduleMode('scheduled'); setRecurringDays([]); setDayTimes({}); setRecurringStartDate(''); setRecurringEndDate('') }}>
                      <span className="schedule-tab-icon">📅</span><span>חד-פעמי</span>
                    </button>
                    <button type="button" className={`schedule-tab ${scheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => { setScheduleMode('recurring'); setScheduleDate(''); setScheduleTime('') }}>
                      <span className="schedule-tab-icon">🔄</span><span>חוזר</span>
                    </button>
                  </div>

                  {scheduleMode === 'now' && (
                    <div className="schedule-info"><p className="schedule-info-text">יפורסם מיד בלחיצה על פרסום</p></div>
                  )}

                  {scheduleMode !== 'now' && (
                    <OptimalTimesHint
                      onSelectTime={(time) => { if (scheduleMode === 'scheduled') setScheduleTime(time) }}
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
                      <div className="schedule-row-centered">
                        <div className="schedule-field">
                          <label>תאריך</label>
                          <SingleDatePicker value={scheduleDate} onChange={setScheduleDate} minDate={toDateStr(new Date())} />
                        </div>
                        <div className="schedule-field schedule-field-time-wrap">
                          <label>שעה</label>
                          <div className="time-input-wrapper" onClick={(e) => { if (!scheduleDate) { e.preventDefault(); e.currentTarget.classList.add('show-tooltip'); setTimeout(() => e.currentTarget.classList.remove('show-tooltip'), 2000) } }}>
                            <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} disabled={!scheduleDate} className={!scheduleDate ? 'disabled-input' : ''} aria-label="שעת תזמון" />
                            <span className="time-tooltip">נא לבחור תאריך קודם</span>
                          </div>
                        </div>
                      </div>
                      {scheduleDate && scheduleTime && (
                        <div className="schedule-summary">📅 {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה {scheduleTime}</div>
                      )}
                    </div>
                  )}

                  {scheduleMode === 'recurring' && (
                    <div className="schedule-fields">
                      <div className="schedule-section">
                        <label className="schedule-section-label">תקופה</label>
                        <RecurringDateRange startDate={recurringStartDate} endDate={recurringEndDate} onStartChange={setRecurringStartDate} onEndChange={setRecurringEndDate} minDate={toDateStr(new Date())} initialMonth={recurringStartDate ? new Date(recurringStartDate) : new Date()} />
                      </div>
                      <div className="schedule-section">
                        <label className="schedule-section-label">באילו ימים?</label>
                        <div className="days-grid">
                          {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((day,i) => (
                            <button key={i} type="button" className={`day-btn ${recurringDays.includes(i)?'active':''}`}
                              onClick={() => { setRecurringDays(prev => { if(prev.includes(i)){setDayTimes(dt=>{const c={...dt};delete c[i];return c});return prev.filter(d=>d!==i)} else{setDayTimes(dt=>({...dt,[i]:['']}));return[...prev,i]} }) }}>{day}</button>
                          ))}
                          <button type="button" className={`day-btn day-btn-all ${recurringDays.length===7?'active':''}`}
                            onClick={() => { if(recurringDays.length===7){setRecurringDays([]);setDayTimes({})} else{setRecurringDays([0,1,2,3,4,5,6]);setDayTimes(dt=>{const c={...dt};for(let i=0;i<7;i++){if(!c[i])c[i]=['']}return c})} }}>כל יום</button>
                        </div>
                      </div>
                      {recurringDays.length > 0 && (
                        <div className="schedule-section day-times-section">
                          <label className="schedule-section-label">שעות לכל יום</label>
                          <div className="day-times-list">
                            {recurringDays.sort((a,b)=>a-b).map(dayIdx => {
                              const times = dayTimes[dayIdx] || ['']
                              return (
                                <div key={dayIdx} className="day-times-card">
                                  <div className="day-times-header">
                                    <span className="day-times-day-name">יום {DAY_NAMES[dayIdx]}</span>
                                    <span className="day-times-count">{times.filter(t=>t).length} שעות</span>
                                  </div>
                                  <div className="day-times-slots">
                                    {times.map((time,ti) => (
                                      <div key={ti} className="time-slot">
                                        <input type="time" value={time} onChange={(e) => { setDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||[''])]; c[dayIdx][ti]=e.target.value; return c }) }} aria-label={`שעה ${ti + 1} ליום ${DAY_NAMES[dayIdx]}`} />
                                        {times.length>1 && <button type="button" className="time-remove-btn" onClick={() => { setDayTimes(dt => { const c={...dt}; c[dayIdx]=c[dayIdx].filter((_,idx)=>idx!==ti); return c }) }} aria-label={`הסר שעה ${ti + 1} מיום ${DAY_NAMES[dayIdx]}`}>✕</button>}
                                      </div>
                                    ))}
                                    {times.length<5 && <button type="button" className="time-add-btn" onClick={() => { setDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||['']),''] ; return c }) }}>+ שעה</button>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {recurringDays.length > 0 && Object.values(dayTimes).some(ts => ts.some(t => t)) && recurringStartDate && (
                        <div className="schedule-summary">
                          🔄 {recurringDays.sort((a,b)=>a-b).map(d => { const ts=(dayTimes[d]||[]).filter(t=>t); return ts.length?`${DAY_NAMES[d]}: ${ts.join(', ')}`:null }).filter(Boolean).join(' | ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ Profile Scheduler ═══ */}
              {activeTab === 'profile' && (
                <div className="cp-schedule">
                  <div className="schedule-tabs">
                    <button type="button" className={`schedule-tab ${profileScheduleMode === 'now' ? 'active' : ''}`} onClick={() => setProfileScheduleMode('now')}>
                      <span className="schedule-tab-icon">⚡</span><span>עכשיו</span>
                    </button>
                    <button type="button" className={`schedule-tab ${profileScheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => { setProfileScheduleMode('scheduled'); setProfileRecurringDays([]); setProfileDayTimes({}) }}>
                      <span className="schedule-tab-icon">📅</span><span>חד-פעמי</span>
                    </button>
                    <button type="button" className={`schedule-tab ${profileScheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => { setProfileScheduleMode('recurring'); setProfileScheduleDate(''); setProfileScheduleTime('') }}>
                      <span className="schedule-tab-icon">🔄</span><span>חוזר</span>
                    </button>
                  </div>

                  {profileScheduleMode === 'now' && (
                    <div className="schedule-info"><p className="schedule-info-text">יפורסם בפרופיל מיד עם יצירת הקמפיין</p></div>
                  )}

                  {profileScheduleMode === 'scheduled' && (
                    <div className="schedule-fields">
                      <div className="schedule-row-centered">
                        <div className="schedule-field">
                          <label>תאריך</label>
                          <SingleDatePicker value={profileScheduleDate} onChange={setProfileScheduleDate} minDate={toDateStr(new Date())} />
                        </div>
                        <div className="schedule-field schedule-field-time-wrap">
                          <label>שעה</label>
                          <input type="time" value={profileScheduleTime} onChange={(e) => setProfileScheduleTime(e.target.value)} disabled={!profileScheduleDate} className={!profileScheduleDate ? 'disabled-input' : ''} aria-label="שעת תזמון לפרופיל" />
                        </div>
                      </div>
                      {profileScheduleDate && profileScheduleTime && (
                        <div className="schedule-summary">📅 {new Date(`${profileScheduleDate}T${profileScheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה {profileScheduleTime}</div>
                      )}
                    </div>
                  )}

                  {profileScheduleMode === 'recurring' && (
                    <div className="schedule-fields">
                      <div className="schedule-section">
                        <label className="schedule-section-label">תקופה</label>
                        <RecurringDateRange startDate={profileRecurringStartDate} endDate={profileRecurringEndDate} onStartChange={setProfileRecurringStartDate} onEndChange={setProfileRecurringEndDate} minDate={toDateStr(new Date())} initialMonth={profileRecurringStartDate ? new Date(profileRecurringStartDate) : new Date()} />
                      </div>
                      <div className="schedule-section">
                        <label className="schedule-section-label">באילו ימים?</label>
                        <div className="days-grid">
                          {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((day,i) => (
                            <button key={i} type="button" className={`day-btn ${profileRecurringDays.includes(i)?'active':''}`}
                              onClick={() => { setProfileRecurringDays(prev => { if(prev.includes(i)){setProfileDayTimes(dt=>{const c={...dt};delete c[i];return c});return prev.filter(d=>d!==i)} else{setProfileDayTimes(dt=>({...dt,[i]:['']}));return[...prev,i]} }) }}>{day}</button>
                          ))}
                          <button type="button" className={`day-btn day-btn-all ${profileRecurringDays.length===7?'active':''}`}
                            onClick={() => { if(profileRecurringDays.length===7){setProfileRecurringDays([]);setProfileDayTimes({})} else{setProfileRecurringDays([0,1,2,3,4,5,6]);setProfileDayTimes(dt=>{const c={...dt};for(let i=0;i<7;i++){if(!c[i])c[i]=['']}return c})} }}>כל יום</button>
                        </div>
                      </div>
                      {profileRecurringDays.length > 0 && (
                        <div className="schedule-section day-times-section">
                          <label className="schedule-section-label">שעות לכל יום</label>
                          <div className="day-times-list">
                            {profileRecurringDays.sort((a,b)=>a-b).map(dayIdx => {
                              const times = profileDayTimes[dayIdx] || ['']
                              return (
                                <div key={dayIdx} className="day-times-card">
                                  <div className="day-times-header">
                                    <span className="day-times-day-name">יום {DAY_NAMES[dayIdx]}</span>
                                    <span className="day-times-count">{times.filter(t=>t).length} שעות</span>
                                  </div>
                                  <div className="day-times-slots">
                                    {times.map((time,ti) => (
                                      <div key={ti} className="time-slot">
                                        <input type="time" value={time} onChange={(e) => { setProfileDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||[''])]; c[dayIdx][ti]=e.target.value; return c }) }} aria-label={`שעה ${ti + 1} לפרופיל ביום ${DAY_NAMES[dayIdx]}`} />
                                        {times.length>1 && <button type="button" className="time-remove-btn" onClick={() => { setProfileDayTimes(dt => { const c={...dt}; c[dayIdx]=c[dayIdx].filter((_,idx)=>idx!==ti); return c }) }} aria-label={`הסר שעה ${ti + 1} מפרופיל ביום ${DAY_NAMES[dayIdx]}`}>✕</button>}
                                      </div>
                                    ))}
                                    {times.length<5 && <button type="button" className="time-add-btn" onClick={() => { setProfileDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||['']),''] ; return c }) }}>+ שעה</button>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ Instagram Scheduler ═══ */}
              {activeTab === 'instagram' && (
                <div className="cp-schedule">
                  {instagramPublishTypes.includes('STORY') && (
                    <div className="cp-ig-hint" style={{ marginBottom: 12 }}>
                      <span>💡</span>
                      <span>סטורי נעלם אחרי 24 שעות מרגע הפרסום</span>
                    </div>
                  )}

                  <div className="schedule-tabs">
                    <button type="button" className={`schedule-tab ${igScheduleMode === 'now' ? 'active' : ''}`} onClick={() => setIgScheduleMode('now')}>
                      <span className="schedule-tab-icon">⚡</span><span>עכשיו</span>
                    </button>
                    <button type="button" className={`schedule-tab ${igScheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => { setIgScheduleMode('scheduled'); setIgRecurringDays([]); setIgDayTimes({}) }}>
                      <span className="schedule-tab-icon">📅</span><span>חד-פעמי</span>
                    </button>
                    <button type="button" className={`schedule-tab ${igScheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => { setIgScheduleMode('recurring'); setIgScheduleDate(''); setIgScheduleTime('') }}>
                      <span className="schedule-tab-icon">🔄</span><span>חוזר</span>
                    </button>
                  </div>

                  {igScheduleMode === 'now' && (
                    <div className="schedule-info"><p className="schedule-info-text">יפורסם באינסטגרם מיד עם יצירת הקמפיין</p></div>
                  )}

                  {igScheduleMode === 'scheduled' && (
                    <div className="schedule-fields">
                      <div className="schedule-row-centered">
                        <div className="schedule-field">
                          <label>תאריך</label>
                          <SingleDatePicker value={igScheduleDate} onChange={setIgScheduleDate} minDate={toDateStr(new Date())} />
                        </div>
                        <div className="schedule-field schedule-field-time-wrap">
                          <label>שעה</label>
                          <input type="time" value={igScheduleTime} onChange={(e) => setIgScheduleTime(e.target.value)} disabled={!igScheduleDate} className={!igScheduleDate ? 'disabled-input' : ''} aria-label="שעת תזמון לאינסטגרם" />
                        </div>
                      </div>
                      {igScheduleDate && igScheduleTime && (
                        <div className="schedule-summary">📅 {new Date(`${igScheduleDate}T${igScheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה {igScheduleTime}</div>
                      )}
                    </div>
                  )}

                  {igScheduleMode === 'recurring' && (
                    <div className="schedule-fields">
                      <div className="schedule-section">
                        <label className="schedule-section-label">תקופה</label>
                        <RecurringDateRange startDate={igRecurringStartDate} endDate={igRecurringEndDate} onStartChange={setIgRecurringStartDate} onEndChange={setIgRecurringEndDate} minDate={toDateStr(new Date())} initialMonth={igRecurringStartDate ? new Date(igRecurringStartDate) : new Date()} />
                      </div>
                      <div className="schedule-section">
                        <label className="schedule-section-label">באילו ימים?</label>
                        <div className="days-grid">
                          {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((day,i) => (
                            <button key={i} type="button" className={`day-btn ${igRecurringDays.includes(i)?'active':''}`}
                              onClick={() => { setIgRecurringDays(prev => { if(prev.includes(i)){setIgDayTimes(dt=>{const c={...dt};delete c[i];return c});return prev.filter(d=>d!==i)} else{setIgDayTimes(dt=>({...dt,[i]:['']}));return[...prev,i]} }) }}>{day}</button>
                          ))}
                          <button type="button" className={`day-btn day-btn-all ${igRecurringDays.length===7?'active':''}`}
                            onClick={() => { if(igRecurringDays.length===7){setIgRecurringDays([]);setIgDayTimes({})} else{setIgRecurringDays([0,1,2,3,4,5,6]);setIgDayTimes(dt=>{const c={...dt};for(let i=0;i<7;i++){if(!c[i])c[i]=['']}return c})} }}>כל יום</button>
                        </div>
                      </div>
                      {igRecurringDays.length > 0 && (
                        <div className="schedule-section day-times-section">
                          <label className="schedule-section-label">שעות לכל יום</label>
                          <div className="day-times-list">
                            {igRecurringDays.sort((a,b)=>a-b).map(dayIdx => {
                              const times = igDayTimes[dayIdx] || ['']
                              return (
                                <div key={dayIdx} className="day-times-card">
                                  <div className="day-times-header">
                                    <span className="day-times-day-name">יום {DAY_NAMES[dayIdx]}</span>
                                    <span className="day-times-count">{times.filter(t=>t).length} שעות</span>
                                  </div>
                                  <div className="day-times-slots">
                                    {times.map((time,ti) => (
                                      <div key={ti} className="time-slot">
                                        <input type="time" value={time} onChange={(e) => { setIgDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||[''])]; c[dayIdx][ti]=e.target.value; return c }) }} aria-label={`שעה ${ti + 1} לאינסטגרם ביום ${DAY_NAMES[dayIdx]}`} />
                                        {times.length>1 && <button type="button" className="time-remove-btn" onClick={() => { setIgDayTimes(dt => { const c={...dt}; c[dayIdx]=c[dayIdx].filter((_,idx)=>idx!==ti); return c }) }} aria-label={`הסר שעה ${ti + 1} מאינסטגרם ביום ${DAY_NAMES[dayIdx]}`}>✕</button>}
                                      </div>
                                    ))}
                                    {times.length<5 && <button type="button" className="time-add-btn" onClick={() => { setIgDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||['']),''] ; return c }) }}>+ שעה</button>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
            )
          })()}

          {/* Error banner */}
          {error && (
            <div className="tpl-save-error">
              <span>⚠️ {error}</span>
              <button type="button" className="tpl-save-error-close" onClick={() => setError(null)} aria-label="סגור הודעת שגיאה">✕</button>
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
