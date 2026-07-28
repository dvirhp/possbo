import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useNavigationGuard } from '../context/NavigationGuard'
import { groupsService } from '../services/groupsService'
import { templatesService } from '../services/templatesService'
import { authAPI } from '../services/api'
import confetti from 'canvas-confetti'
import LocationAutocomplete from '../components/LocationAutocomplete'
import FacebookPreview from '../components/FacebookPreview'
import InstagramPreview from '../components/InstagramPreview'
import WhatsAppPreview from '../components/WhatsAppPreview'
import ConfirmDialog from '../components/ConfirmDialog'
import OptimalTimesHint from '../components/OptimalTimesHint'
import EmojiPicker from '../components/EmojiPicker'
import '../styles/create-post.css'
import '../styles/templates.css'

function toDateStr(d) {
  return d.toISOString().split('T')[0]
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

  const formatDate = (d) => new Date(d + 'T00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

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
      {/* Trigger button / summary */}
      <button type="button" className="cp-range-trigger" ref={triggerRef} onClick={handleOpen}>
        {startDate ? (
          <span className="cp-range-trigger-text">
            📅 {formatDate(startDate)}{endDate ? ` — ${formatDate(endDate)}` : ''}
          </span>
        ) : (
          <span className="cp-range-trigger-text">📅 בחר תאריך</span>
        )}
      </button>

      {/* Calendar */}
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
                {formatDate(startDate)} — {formatDate(endDate)}
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

  const formatDate = (d) => new Date(d + 'T00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="cp-range-wrap">
      <button type="button" className="cp-range-trigger" ref={triggerRef} onClick={handleOpen}>
        <span className="cp-range-trigger-text">
          {value ? `📅 ${formatDate(value)}` : '📅 בחר תאריך'}
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

export default function CreatePost() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, setUser, authChecked, groups: cachedGroups, forceRefresh, templates: cachedTemplates, recentCampaigns: cachedRecent, dataReady, waGroups, waBroadcastLists, loadWaGroups } = useAppData()
  const { setDirty, isDirty } = useNavigationGuard()

  const preSelectedGroup = location.state?.group || null
  const republishData = location.state?.republish || null
  const fromTemplate = location.state?.fromTemplate || null
  const profilePublishDefault = location.state?.publishToProfile || false
  const generatedContent = location.state?.generatedContent || null

  // Profile publishing
  const [publishToProfile, setPublishToProfile] = useState(profilePublishDefault)

  // Instagram
  const [instagramEnabled, setInstagramEnabled] = useState(fromTemplate?.instagramEnabled || false)
  const [instagramPublishTypes, setInstagramPublishTypes] = useState(fromTemplate?.instagramPublishTypes || (fromTemplate?.instagramPublishType ? [fromTemplate.instagramPublishType] : ['FEED'])) // array of 'FEED' | 'STORY' | 'REEL'
  const [igTypeMedia, setIgTypeMedia] = useState({ FEED: [], STORY: [], REEL: [] }) // per-type specific media
  const [igTypeMediaPreviews, setIgTypeMediaPreviews] = useState({ FEED: [], STORY: [], REEL: [] })
  const [igTypeCaptions, setIgTypeCaptions] = useState({ FEED: '', STORY: '', REEL: '' }) // per-type captions
  const [reelVideoScope, setReelVideoScope] = useState('campaign') // 'campaign' | 'reel'
  const [previewMode, setPreviewMode] = useState('facebook') // 'facebook' | 'ig-feed' | 'ig-story' | 'ig-reel' | 'whatsapp'
  const instagramConnected = user?.instagramConnected || false

  // WhatsApp distribution
  const [selectedWaTargets, setSelectedWaTargets] = useState(fromTemplate?.whatsappTargets || []) // array of { id, type: 'group'|'broadcast', name }
  const whatsappDistEnabled = selectedWaTargets.length > 0
  const whatsappConnected = user?.whatsappSessionConnected || false
  const [waSearch, setWaSearch] = useState('')
  const [waTargetTab, setWaTargetTab] = useState('groups')

  // Live-check Instagram connection when tab is first opened (in case cached user is stale)
  const checkInstagramStatus = useCallback(async () => {
    try {
      const res = await authAPI.getInstagramStatus()
      if (res?.data?.connected) {
        const updates = { instagramConnected: true, instagramUsername: res.data.account?.username }
        if (res.data.avatarUrl) updates.avatarUrl = res.data.avatarUrl
        setUser(prev => ({ ...prev, ...updates }))
      } else {
        setInstagramEnabled(false)
        setUser(prev => ({ ...prev, instagramConnected: false, instagramUsername: null }))
      }
    } catch { /* ignore */ }
  }, [setUser])

  // Distribution view tab
  const [distributionTab, setDistributionTab] = useState('facebook')

  // Story/Reels media options
  const [storyMediaMode, setStoryMediaMode] = useState('first') // 'first' | 'all' | 'pick'
  const [storyPickedIndex, setStoryPickedIndex] = useState(0) // which image to use when mode='pick'
  const [storyCaptions, setStoryCaptions] = useState([]) // per-image captions for stories

  // Template selector
  const [templates, setTemplates] = useState(cachedTemplates || [])
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [selectedTemplateName, setSelectedTemplateName] = useState(fromTemplate?.name || null)

  // Sync from cache
  useEffect(() => {
    setTemplates(cachedTemplates || [])
  }, [cachedTemplates])

  const [campaignTitle, setCampaignTitle] = useState(fromTemplate?.title || republishData?.title || '')
  const [postText, setPostText] = useState(fromTemplate?.content || republishData?.content || generatedContent || '')
  const [postImages, setPostImages] = useState([])
  const [postImagePreviews, setPostImagePreviews] = useState([])
  const [restoredImageUrls, setRestoredImageUrls] = useState(fromTemplate?.imageUrls || [])
  const [isAnonymous, setIsAnonymous] = useState(fromTemplate?.isAnonymous || republishData?.isAnonymous || false)

  // Track unsaved changes
  useEffect(() => {
    const hasDirty = !!(postText.trim() || campaignTitle.trim() || postImages.length)
    setDirty(hasDirty, 'יש תוכן שלא פורסם. לצאת בלי לשמור?')
    return () => setDirty(false)
  }, [postText, campaignTitle, postImages, setDirty])

  // Browser tab/refresh guard
  useEffect(() => {
    const handler = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const [postLocation, setPostLocation] = useState(fromTemplate?.location || republishData?.location || '')
  const [showLocationInput, setShowLocationInput] = useState(!!(fromTemplate?.location || republishData?.location))
  const [whatsappNumber, setWhatsappNumber] = useState(user?.whatsappNumber || '')
  const [whatsappMessage, setWhatsappMessage] = useState(fromTemplate?.whatsappText || user?.whatsappMessage || '')
  const [showWhatsapp, setShowWhatsapp] = useState(!!(fromTemplate?.whatsappText && user?.whatsappNumber))
  const [waLinking, setWaLinking] = useState(false) // inline linking mode
  const [waTempNumber, setWaTempNumber] = useState('')
  const [waTempMessage, setWaTempMessage] = useState('')
  const [waSaving, setWaSaving] = useState(false)
  const [waEditingMsg, setWaEditingMsg] = useState(false)

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState(fromTemplate?.scheduleMode || 'now') // 'now' | 'scheduled' | 'recurring'
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [recurringDays, setRecurringDays] = useState(fromTemplate?.recurringDays || [])
  const [recurringTime, setRecurringTime] = useState('')
  const [recurringStartDate, setRecurringStartDate] = useState('')
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [dayTimes, setDayTimes] = useState(fromTemplate?.dayTimes || {}) // { 0: ['10:00'], 2: ['16:00','17:00'] }

  // Per-platform scheduling overrides
  const [profileScheduleCustom, setProfileScheduleCustom] = useState(false) // false = now (default)
  const [profileScheduleMode, setProfileScheduleMode] = useState(fromTemplate?.profileScheduleMode || 'now') // 'now' | 'scheduled' | 'recurring'
  const [profileScheduleDate, setProfileScheduleDate] = useState(fromTemplate?.profileScheduleDate || '')
  const [profileScheduleTime, setProfileScheduleTime] = useState(fromTemplate?.profileScheduleTime || '')
  const [profileRecurringDays, setProfileRecurringDays] = useState(fromTemplate?.profileRecurringDays || [])
  const [profileDayTimes, setProfileDayTimes] = useState(fromTemplate?.profileDayTimes || {})
  const [profileRecurringStartDate, setProfileRecurringStartDate] = useState(fromTemplate?.profileRecurringStartDate || '')
  const [profileRecurringEndDate, setProfileRecurringEndDate] = useState(fromTemplate?.profileRecurringEndDate || '')

  const [igScheduleCustom, setIgScheduleCustom] = useState(false) // false = now (default)
  const [igScheduleSubTab, setIgScheduleSubTab] = useState('FEED') // active IG type tab
  const [igTypeSchedules, setIgTypeSchedules] = useState(() => {
    const def = { mode: 'now', date: '', time: '', recurringDays: [], dayTimes: {}, startDate: '', endDate: '' }
    if (fromTemplate?.igTypeSchedules) return fromTemplate.igTypeSchedules
    return { FEED: { ...def }, STORY: { ...def }, REEL: { ...def } }
  })
  const [igScheduleMode, setIgScheduleMode] = useState(fromTemplate?.igScheduleMode || 'now') // 'now' | 'scheduled' | 'recurring'
  const [igScheduleDate, setIgScheduleDate] = useState(fromTemplate?.igScheduleDate || '')
  const [igScheduleTime, setIgScheduleTime] = useState(fromTemplate?.igScheduleTime || '')
  const [igRecurringDays, setIgRecurringDays] = useState(fromTemplate?.igRecurringDays || [])
  const [igDayTimes, setIgDayTimes] = useState(fromTemplate?.igDayTimes || {})
  const [igRecurringStartDate, setIgRecurringStartDate] = useState(fromTemplate?.igRecurringStartDate || '')
  const [igRecurringEndDate, setIgRecurringEndDate] = useState(fromTemplate?.igRecurringEndDate || '')
  const [scheduleSubTab, setScheduleSubTab] = useState('groups') // 'groups' | 'profile' | 'instagram'
  const [schedulePlatformTab, setSchedulePlatformTab] = useState('facebook') // 'facebook' | 'instagram' | 'whatsapp'
  const [fbScheduleSubTab, setFbScheduleSubTab] = useState('groups') // 'groups' | 'profile'

  // WhatsApp scheduling
  const [waScheduleMode, setWaScheduleMode] = useState(fromTemplate?.waScheduleMode || 'now')
  const [waScheduleDate, setWaScheduleDate] = useState(fromTemplate?.waScheduleDate || '')
  const [waScheduleTime, setWaScheduleTime] = useState(fromTemplate?.waScheduleTime || '')
  const [waRecurringDays, setWaRecurringDays] = useState(fromTemplate?.waRecurringDays || [])
  const [waDayTimes, setWaDayTimes] = useState(fromTemplate?.waDayTimes || {})
  const [waRecurringStartDate, setWaRecurringStartDate] = useState(fromTemplate?.waRecurringStartDate || '')
  const [waRecurringEndDate, setWaRecurringEndDate] = useState(fromTemplate?.waRecurringEndDate || '')

  // Groups - use cached data
  const [groups, setGroups] = useState(cachedGroups || [])
  const [selectedGroups, setSelectedGroups] = useState(
    preSelectedGroup ? [preSelectedGroup] : []
  )

  // Pre-select groups from republish data (e.g. editing a draft)
  useEffect(() => {
    if (republishData?.groupIds?.length && cachedGroups?.length && selectedGroups.length === 0) {
      const matched = cachedGroups.filter(g => republishData.groupIds.includes(g.id))
      if (matched.length) setSelectedGroups(matched)
    }
  }, [republishData, cachedGroups])

  // Pre-select groups from template
  useEffect(() => {
    if (fromTemplate?.groupIds?.length && cachedGroups?.length && selectedGroups.length === 0) {
      const matched = cachedGroups.filter(g => fromTemplate.groupIds.includes(g.id))
      if (matched.length) setSelectedGroups(matched)
    }
  }, [fromTemplate, cachedGroups])

  // Templates already loaded from DataProvider cache

  const applyTemplate = (tpl) => {
    setCampaignTitle(tpl.campaignTitle || '')
    setPostText(tpl.content || '')
    setIsAnonymous(tpl.isAnonymous || false)
    setPostLocation(tpl.location || '')
    setShowLocationInput(!!tpl.location)
    setScheduleMode(tpl.scheduleMode || 'now')
    setRecurringDays(tpl.recurringDays || [])
    setDayTimes(tpl.dayTimes || {})
    setPublishToProfile(tpl.publishToProfile || false)
    setProfileScheduleMode(tpl.profileScheduleMode || 'now')
    setProfileScheduleDate(tpl.profileScheduleDate || '')
    setProfileScheduleTime(tpl.profileScheduleTime || '')
    setProfileRecurringDays(tpl.profileRecurringDays || [])
    setProfileDayTimes(tpl.profileDayTimes || {})
    setProfileRecurringStartDate(tpl.profileRecurringStartDate || '')
    setProfileRecurringEndDate(tpl.profileRecurringEndDate || '')
    setInstagramEnabled(tpl.instagramEnabled || false)
    setInstagramPublishTypes(tpl.instagramPublishTypes?.length ? tpl.instagramPublishTypes : ['FEED'])
    setStoryMediaMode(tpl.storyMediaMode || 'first')
    setStoryPickedIndex(tpl.storyPickedIndex || 0)
    setIgScheduleMode(tpl.igScheduleMode || 'now')
    setIgScheduleDate(tpl.igScheduleDate || '')
    setIgScheduleTime(tpl.igScheduleTime || '')
    setIgRecurringDays(tpl.igRecurringDays || [])
    setIgDayTimes(tpl.igDayTimes || {})
    setIgRecurringStartDate(tpl.igRecurringStartDate || '')
    setIgRecurringEndDate(tpl.igRecurringEndDate || '')
    setSelectedWaTargets(tpl.whatsappTargets || [])
    setWaScheduleMode(tpl.waScheduleMode || 'now')
    setWaScheduleDate(tpl.waScheduleDate || '')
    setWaScheduleTime(tpl.waScheduleTime || '')
    setWaRecurringDays(tpl.waRecurringDays || [])
    setWaDayTimes(tpl.waDayTimes || {})
    setWaRecurringStartDate(tpl.waRecurringStartDate || '')
    setWaRecurringEndDate(tpl.waRecurringEndDate || '')
    setWhatsappMessage(tpl.whatsappText || '')
    setShowWhatsapp(!!tpl.whatsappText)
    setRestoredImageUrls(tpl.imageUrls || [])
    setPostImagePreviews(tpl.imageUrls || [])
    if (tpl.groupIds?.length && cachedGroups?.length) {
      const matched = cachedGroups.filter(g => tpl.groupIds.includes(g.id))
      setSelectedGroups(matched)
    }
    setSelectedTemplateName(tpl.name)
    setShowTemplateSelector(false)
  }

  const clearTemplate = () => {
    setSelectedTemplateName(null)
  }
  const [loadingGroups, setLoadingGroups] = useState(!cachedGroups?.length)
  const [groupSearch, setGroupSearch] = useState('')
  const [showAllChips, setShowAllChips] = useState(false)

  // Publishing
  const [publishing, setPublishing] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [showMobilePreview, setShowMobilePreview] = useState(false)

  useEffect(() => {
    if (!showMobilePreview) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowMobilePreview(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showMobilePreview])

  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
      return
    }
    if (user?.whatsappNumber && !whatsappNumber) {
      setWhatsappNumber(user.whatsappNumber)
    }
    // Use cached groups if available, otherwise load
    if (cachedGroups?.length) {
      setGroups(cachedGroups)
      setLoadingGroups(false)
    } else {
      loadGroups()
    }
  }, [authChecked, user, navigate, cachedGroups])

  // Recent campaigns loaded from DataProvider cache

  const loadGroups = async () => {
    setLoadingGroups(true)
    try {
      const res = await groupsService.getSavedGroups()
      if (res.data.success && res.data.groups) {
        setGroups(res.data.groups)
      }
    } catch {
      // silent
    } finally {
      setLoadingGroups(false)
    }
  }

  const toggleGroup = (group) => {
    setSelectedGroups(prev => {
      const exists = prev.find(g => g.id === group.id)
      if (exists) return prev.filter(g => g.id !== group.id)
      return [...prev, group]
    })
  }

  const selectAllGroups = () => {
    const filtered = groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
    setSelectedGroups(filtered)
  }

  const deselectAll = () => setSelectedGroups([])

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    const newImages = [...postImages, ...files].slice(0, 10)
    setPostImages(newImages)
    setPostImagePreviews(newImages.map(f => URL.createObjectURL(f)))
  }

  const handleIgTypeMediaSelect = (igType) => (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    const updated = [...igTypeMedia[igType], ...files].slice(0, 5)
    setIgTypeMedia(prev => ({ ...prev, [igType]: updated }))
    setIgTypeMediaPreviews(prev => ({ ...prev, [igType]: updated.map(f => URL.createObjectURL(f)) }))
  }

  const handleReelVideoSelect = (e) => {
    const files = Array.from(e.target.files).filter(file => file.type?.startsWith('video/'))
    if (files.length === 0) return

    if (reelVideoScope === 'campaign') {
      const updated = [...postImages, ...files].slice(0, 10)
      setPostImages(updated)
      setPostImagePreviews(updated.map(file => URL.createObjectURL(file)))
    } else {
      const updated = [...igTypeMedia.REEL, ...files].slice(0, 5)
      setIgTypeMedia(prev => ({ ...prev, REEL: updated }))
      setIgTypeMediaPreviews(prev => ({ ...prev, REEL: updated.map(file => URL.createObjectURL(file)) }))
    }
    e.target.value = ''
  }

  const changeReelVideoScope = (scope) => {
    setReelVideoScope(scope)

    if (scope === 'reel') {
      // A video may have been uploaded while the default "whole campaign"
      // option was still selected. Move it out of the shared campaign media
      // immediately so Feed/Story continue using only their original images.
      const campaignVideos = postImages.filter(file => file?.type?.startsWith('video/'))
      if (campaignVideos.length > 0) {
        const campaignMedia = postImages.filter(file => !file?.type?.startsWith('video/'))
        const reelMedia = [...igTypeMedia.REEL, ...campaignVideos].slice(0, 5)
        setPostImages(campaignMedia)
        setPostImagePreviews(campaignMedia.map(file => URL.createObjectURL(file)))
        setIgTypeMedia(prev => ({ ...prev, REEL: reelMedia }))
        setIgTypeMediaPreviews(prev => ({
          ...prev,
          REEL: reelMedia.map(file => URL.createObjectURL(file)),
        }))
      }
      return
    }

    // When switching back to "whole campaign", return Reel-specific videos to
    // the shared media collection so every selected destination can use them.
    const reelVideos = igTypeMedia.REEL.filter(file => file?.type?.startsWith('video/'))
    if (reelVideos.length > 0) {
      const sharedMedia = [...postImages, ...reelVideos].slice(0, 10)
      const remainingReelMedia = igTypeMedia.REEL.filter(file => !file?.type?.startsWith('video/'))
      setPostImages(sharedMedia)
      setPostImagePreviews(sharedMedia.map(file => URL.createObjectURL(file)))
      setIgTypeMedia(prev => ({ ...prev, REEL: remainingReelMedia }))
      setIgTypeMediaPreviews(prev => ({
        ...prev,
        REEL: remainingReelMedia.map(file => URL.createObjectURL(file)),
      }))
    }
  }

  const toggleInstagramType = (type) => {
    setInstagramPublishTypes(prev => {
      const next = prev.includes(type) ? prev.filter(value => value !== type) : [...prev, type]
      setInstagramEnabled(next.length > 0)
      return next
    })
  }

  const removeIgTypeMedia = (igType, index) => {
    const updated = igTypeMedia[igType].filter((_, i) => i !== index)
    setIgTypeMedia(prev => ({ ...prev, [igType]: updated }))
    setIgTypeMediaPreviews(prev => ({ ...prev, [igType]: updated.map(f => URL.createObjectURL(f)) }))
  }

  const removeImage = (index) => {
    const newImages = postImages.filter((_, i) => i !== index)
    setPostImages(newImages)
    setPostImagePreviews(newImages.map(f => URL.createObjectURL(f)))
  }

  const handlePublish = async () => {
    // Final validation
    const errors = validateStep(3)
    if (Object.keys(errors).length > 0) {
      const firstError = errors[Object.keys(errors)[0]]
      setError(firstError)
      setStepErrors(errors)
      setCurrentStep(Number(Object.keys(errors)[0]))
      return
    }

    setPublishing(true)
    setError(null)
    setResults(null)

    const hasIgTypeMedia = Object.values(igTypeMedia).some(arr => arr.length > 0)

    const waLink = showWhatsapp && whatsappNumber.trim()
      ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}${whatsappMessage ? '?text=' + encodeURIComponent(whatsappMessage) : ''}`
      : ''

    // If scheduling (not immediate), use scheduler API
    if (scheduleMode === 'scheduled' || scheduleMode === 'recurring') {
      try {
        const campaignText = waLink
          ? `${postText}\n\n${waLink}`
          : postText
        // First create the post via publish service (without actually publishing to FB)
        const res = await groupsService.createCampaign({
          title: campaignTitle,
          text: campaignText,
          groupIds: selectedGroups.map(g => g.id),
          anonymous: isAnonymous,
          location: postLocation,
          publishToProfile,
          instagramEnabled: instagramEnabled && instagramConnected,
          instagramPublishTypes: instagramEnabled && instagramConnected ? instagramPublishTypes : null,
          storyMediaMode: instagramEnabled && instagramConnected && instagramPublishTypes.includes('STORY') ? storyMediaMode : null,
          storyPickedIndex: instagramEnabled && instagramConnected && instagramPublishTypes.includes('STORY') && storyMediaMode === 'pick' ? storyPickedIndex : null,
          storyCaptions: instagramEnabled && instagramConnected && instagramPublishTypes.includes('STORY') && storyMediaMode === 'all' ? storyCaptions : null,
          scheduleMode,
          scheduleDate,
          scheduleTime,
          recurringDays,
          recurringTime: Object.values(dayTimes).flat().filter(t => t.trim())[0] || '',
          recurringTimes: Object.values(dayTimes).flat().filter(t => t.trim()),
          dayTimes,
          recurringStartDate,
          recurringEndDate: recurringEndDate || null,
          campaignType: scheduleMode === 'recurring' ? 'RECURRING' : 'SCHEDULED',
          templateName: fromTemplate?.name || selectedTemplateName || null,
          existingImageUrls: restoredImageUrls,
          profileScheduleMode,
          profileScheduleDate: profileScheduleMode === 'scheduled' ? profileScheduleDate : null,
          profileScheduleTime: profileScheduleMode === 'scheduled' ? profileScheduleTime : null,
          profileRecurringDays: profileScheduleMode === 'recurring' ? profileRecurringDays : null,
          profileDayTimes: profileScheduleMode === 'recurring' ? profileDayTimes : null,
          profileRecurringStartDate: profileScheduleMode === 'recurring' ? profileRecurringStartDate : null,
          profileRecurringEndDate: profileScheduleMode === 'recurring' ? profileRecurringEndDate : null,
          igScheduleMode,
          igScheduleDate: igScheduleMode === 'scheduled' ? igScheduleDate : null,
          igScheduleTime: igScheduleMode === 'scheduled' ? igScheduleTime : null,
          igRecurringDays: igScheduleMode === 'recurring' ? igRecurringDays : null,
          igDayTimes: igScheduleMode === 'recurring' ? igDayTimes : null,
          igRecurringStartDate: igScheduleMode === 'recurring' ? igRecurringStartDate : null,
          igRecurringEndDate: igScheduleMode === 'recurring' ? igRecurringEndDate : null,
          igPerTypeSchedules: instagramEnabled && instagramConnected ? igTypeSchedules : null,
          igTypeCaptions: instagramEnabled && instagramConnected ? igTypeCaptions : null,
          whatsappEnabled: whatsappDistEnabled,
          whatsappTargets: whatsappDistEnabled ? selectedWaTargets : null,
          waScheduleMode,
          waScheduleDate: waScheduleMode === 'scheduled' ? waScheduleDate : null,
          waScheduleTime: waScheduleMode === 'scheduled' ? waScheduleTime : null,
          waRecurringDays: waScheduleMode === 'recurring' ? waRecurringDays : null,
          waDayTimes: waScheduleMode === 'recurring' ? waDayTimes : null,
          waRecurringStartDate: waScheduleMode === 'recurring' ? waRecurringStartDate : null,
          waRecurringEndDate: waScheduleMode === 'recurring' ? waRecurringEndDate : null,
        }, postImages, hasIgTypeMedia ? igTypeMedia : null)
        if (res.data.success) {
          setDirty(false)
          forceRefresh()
          // Mark template usage only on successful publish
          if (fromTemplate?.id) {
            templatesService.markUsed(fromTemplate.id).catch(() => {})
          }
          // Navigate immediately and show success banner
          navigate(-1)
          setTimeout(() => {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
            const msg = scheduleMode === 'recurring'
              ? '🔄 קמפיין חוזר תוזמן בהצלחה!'
              : '📅 פוסט תוזמן בהצלחה!'
            window.dispatchEvent(new CustomEvent('possbo-op-done', { detail: { id: 'schedule', success: true, msg } }))
          }, 100)
        } else {
          setError(res.data.error || 'שגיאה ביצירת הקמפיין')
        }
      } catch (err) {
        setError('לא הצלחנו ליצור את הקמפיין כרגע. נסו שוב מאוחר יותר.')
      } finally {
        setPublishing(false)
      }
      return
    }

    // Immediate publish — create campaign with scheduleMode "now"
    const finalText = waLink
      ? `${postText}\n\n${waLink}`
      : postText

    try {
      const groupCount = selectedGroups.length + (publishToProfile ? 1 : 0) + (instagramEnabled ? instagramPublishTypes.length : 0) + (whatsappDistEnabled ? 1 : 0)
      const res = await groupsService.createCampaign({
        title: campaignTitle,
        text: finalText,
        groupIds: selectedGroups.map(g => g.id),
        anonymous: isAnonymous,
        location: postLocation,
        publishToProfile,
        instagramEnabled,
        instagramPublishTypes: instagramEnabled ? instagramPublishTypes : null,
        storyMediaMode: instagramEnabled && instagramPublishTypes.includes('STORY') ? storyMediaMode : null,
        storyPickedIndex: instagramEnabled && instagramPublishTypes.includes('STORY') && storyMediaMode === 'pick' ? storyPickedIndex : null,
        storyCaptions: instagramEnabled && instagramPublishTypes.includes('STORY') && storyMediaMode === 'all' ? storyCaptions : null,
        scheduleMode: 'now',
        campaignType: 'ONE_TIME',
        templateName: fromTemplate?.name || selectedTemplateName || null,
        existingImageUrls: restoredImageUrls,
        profileScheduleMode,
        profileScheduleDate: profileScheduleMode === 'scheduled' ? profileScheduleDate : null,
        profileScheduleTime: profileScheduleMode === 'scheduled' ? profileScheduleTime : null,
        profileRecurringDays: profileScheduleMode === 'recurring' ? profileRecurringDays : null,
        profileDayTimes: profileScheduleMode === 'recurring' ? profileDayTimes : null,
        profileRecurringStartDate: profileScheduleMode === 'recurring' ? profileRecurringStartDate : null,
        profileRecurringEndDate: profileScheduleMode === 'recurring' ? profileRecurringEndDate : null,
        igScheduleMode,
        igScheduleDate: igScheduleMode === 'scheduled' ? igScheduleDate : null,
        igScheduleTime: igScheduleMode === 'scheduled' ? igScheduleTime : null,
        igRecurringDays: igScheduleMode === 'recurring' ? igRecurringDays : null,
        igDayTimes: igScheduleMode === 'recurring' ? igDayTimes : null,
        igRecurringStartDate: igScheduleMode === 'recurring' ? igRecurringStartDate : null,
        igRecurringEndDate: igScheduleMode === 'recurring' ? igRecurringEndDate : null,
        igPerTypeSchedules: instagramEnabled ? igTypeSchedules : null,
        igTypeCaptions: instagramEnabled ? igTypeCaptions : null,
        whatsappEnabled: whatsappDistEnabled,
        whatsappTargets: whatsappDistEnabled ? selectedWaTargets : null,
        waScheduleMode,
        waScheduleDate: waScheduleMode === 'scheduled' ? waScheduleDate : null,
        waScheduleTime: waScheduleMode === 'scheduled' ? waScheduleTime : null,
        waRecurringDays: waScheduleMode === 'recurring' ? waRecurringDays : null,
        waDayTimes: waScheduleMode === 'recurring' ? waDayTimes : null,
        waRecurringStartDate: waScheduleMode === 'recurring' ? waRecurringStartDate : null,
        waRecurringEndDate: waScheduleMode === 'recurring' ? waRecurringEndDate : null,
      }, postImages, hasIgTypeMedia ? igTypeMedia : null)

      if (res.data.success) {
        setDirty(false)
        if (fromTemplate?.id) {
          templatesService.markUsed(fromTemplate.id).catch(() => {})
        }
        window.dispatchEvent(new CustomEvent('possbo-publish-start', { detail: { count: groupCount, postId: res.data.postId, targets: { groups: selectedGroups.length, profile: publishToProfile, instagram: instagramEnabled ? instagramPublishTypes.length : 0, whatsapp: whatsappDistEnabled ? 1 : 0 } } }))
        navigate(-1)
      } else {
        setError(res.data.error || 'שגיאה ביצירת הפרסום')
      }
    } catch (err) {
      setError('לא הצלחנו ליצור את הפרסום כרגע. נסו שוב מאוחר יותר.')
    } finally {
      setPublishing(false)
    }
  }

  // ─── Save as Draft ──────────────────────────────────────
  const [savingDraft, setSavingDraft] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)

  const handleSaveAsDraft = () => {
    if (!postText.trim()) {
      setError('יש לכתוב טקסט לפחות כדי לשמור כטיוטה')
      return
    }
    setConfirmAction({
      title: 'שמירה כטיוטה',
      message: 'האם אתה בטוח שברצונך לשמור את הקמפיין כטיוטה?',
      action: async () => {
        setSavingDraft(true)
        setError(null)
        try {
          const waLink = showWhatsapp && whatsappNumber.trim()
            ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}${whatsappMessage ? '?text=' + encodeURIComponent(whatsappMessage) : ''}`
            : ''
          const campaignText = waLink ? `${postText}\n\n${waLink}` : postText
          await groupsService.createCampaign({
            title: campaignTitle || null,
            text: campaignText,
            groupIds: selectedGroups.map(g => g.id),
            anonymous: isAnonymous,
            location: postLocation,
            scheduleMode: 'draft',
            campaignType: 'ONE_TIME',
            recurringDays,
            dayTimes,
            recurringStartDate,
            recurringEndDate: recurringEndDate || null,
            existingImageUrls: restoredImageUrls,
            draftData: {
              currentStep,
              scheduleMode,
              scheduleDate,
              scheduleTime,
              recurringDays,
              dayTimes,
              recurringStartDate,
              recurringEndDate,
              publishToProfile,
              profileScheduleMode,
              profileScheduleDate,
              profileScheduleTime,
              profileRecurringDays,
              profileDayTimes,
              profileRecurringStartDate,
              profileRecurringEndDate,
              instagramEnabled,
              instagramPublishTypes,
              storyMediaMode,
              storyPickedIndex,
              storyCaptions,
              igTypeSchedules,
              igScheduleMode,
              igScheduleDate,
              igScheduleTime,
              igRecurringDays,
              igDayTimes,
              igRecurringStartDate,
              igRecurringEndDate,
              selectedWaTargets,
              waScheduleMode,
              waScheduleDate,
              waScheduleTime,
              waRecurringDays,
              waDayTimes,
              waRecurringStartDate,
              waRecurringEndDate,
              showWhatsapp,
              whatsappNumber,
              whatsappMessage,
              distributionTab,
            },
          }, postImages)
          setDirty(false)
          forceRefresh()
          navigate('/dashboard', { state: { toast: 'נשמר כטיוטה ✓' } })
        } catch (err) {
          setError(err.userMessage || 'שגיאה בשמירה')
        } finally {
          setSavingDraft(false)
        }
      }
    })
  }

  const handleExitWizard = () => {
    // If already published/scheduled successfully, just go back
    if (results && results.some(r => r.success)) {
      setDirty(false)
      navigate(-1)
      return
    }
    if (postText.trim() || selectedGroups.length > 0) {
      setConfirmAction({
        title: 'יציאה מיצירת קמפיין',
        message: 'האם אתה בטוח שברצונך לצאת? השינויים שלך לא יישמרו.',
        action: () => { setDirty(false); navigate(-1) },
      })
    } else {
      setDirty(false)
      navigate(-1)
    }
  }

  // ─── Restore / Continue from draft ─────────────────────
  const [showRestore, setShowRestore] = useState(false)
  const [recentDrafts, setRecentDrafts] = useState(cachedRecent?.drafts || [])
  const [recentHistory, setRecentHistory] = useState(cachedRecent?.history || [])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [showMoreHistory, setShowMoreHistory] = useState(false)

  // Sync from cache
  useEffect(() => {
    if (cachedRecent?.drafts) setRecentDrafts(cachedRecent.drafts)
    if (cachedRecent?.history) setRecentHistory(cachedRecent.history)
  }, [cachedRecent])

  const loadRecentCampaigns = () => {} // kept for compatibility, data comes from cache

  const handleRestore = (campaign) => {
    // Strip WhatsApp link from content if present
    const content = campaign.content?.replace(/\n\nhttps:\/\/wa\.me\/[^\s]*/g, '') || ''
    setPostText(content)
    setCampaignTitle(campaign.title || '')
    setIsAnonymous(campaign.isAnonymous || false)
    setPostLocation(campaign.location || '')
    setShowLocationInput(!!campaign.location)

    // Restore groups
    if (campaign.groups?.length) {
      setSelectedGroups(campaign.groups.map(g => ({
        id: g.externalId || g.id,
        name: g.name,
        url: g.url,
        pictureUrl: g.pictureUrl,
        externalId: g.externalId || g.id,
      })))
    }

    // Restore schedule
    if (campaign.scheduleMode === 'recurring') {
      setScheduleMode('recurring')
      setRecurringDays(campaign.recurringDays || [])
      if (campaign.dayTimes) setDayTimes(campaign.dayTimes)
      if (campaign.recurringStart) setRecurringStartDate(new Date(campaign.recurringStart).toISOString().split('T')[0])
      if (campaign.recurringEnd) setRecurringEndDate(new Date(campaign.recurringEnd).toISOString().split('T')[0])
    } else if (campaign.scheduleMode === 'scheduled') {
      setScheduleMode('scheduled')
    }

    setShowRestore(false)
    setCurrentStep(0)
  }

  const handleContinueDraft = (draft) => {
    // Restore all data
    const saved = draft.draftData || {}
    const content = draft.content?.replace(/\n\nhttps:\/\/wa\.me\/[^\s]*/g, '') || ''
    setPostText(content)
    setCampaignTitle(draft.title || '')
    setIsAnonymous(draft.isAnonymous || false)
    setPostLocation(draft.location || '')
    setShowLocationInput(!!draft.location)
    setRestoredImageUrls(draft.images || [])
    setPostImagePreviews(draft.images || [])

    setScheduleMode(saved.scheduleMode || draft.scheduleMode || 'now')
    setScheduleDate(saved.scheduleDate || '')
    setScheduleTime(saved.scheduleTime || '')
    setRecurringDays(saved.recurringDays || draft.recurringDays || [])
    setDayTimes(saved.dayTimes || draft.dayTimes || {})
    setRecurringStartDate(saved.recurringStartDate || (draft.recurringStart ? new Date(draft.recurringStart).toISOString().split('T')[0] : ''))
    setRecurringEndDate(saved.recurringEndDate || (draft.recurringEnd ? new Date(draft.recurringEnd).toISOString().split('T')[0] : ''))
    setPublishToProfile(saved.publishToProfile || false)
    setProfileScheduleMode(saved.profileScheduleMode || 'now')
    setProfileScheduleDate(saved.profileScheduleDate || '')
    setProfileScheduleTime(saved.profileScheduleTime || '')
    setProfileRecurringDays(saved.profileRecurringDays || [])
    setProfileDayTimes(saved.profileDayTimes || {})
    setProfileRecurringStartDate(saved.profileRecurringStartDate || '')
    setProfileRecurringEndDate(saved.profileRecurringEndDate || '')
    setInstagramEnabled(saved.instagramEnabled || false)
    setInstagramPublishTypes(saved.instagramPublishTypes?.length ? saved.instagramPublishTypes : ['FEED'])
    setStoryMediaMode(saved.storyMediaMode || 'first')
    setStoryPickedIndex(saved.storyPickedIndex || 0)
    setStoryCaptions(saved.storyCaptions || [])
    if (saved.igTypeSchedules) setIgTypeSchedules(saved.igTypeSchedules)
    setIgScheduleMode(saved.igScheduleMode || 'now')
    setIgScheduleDate(saved.igScheduleDate || '')
    setIgScheduleTime(saved.igScheduleTime || '')
    setIgRecurringDays(saved.igRecurringDays || [])
    setIgDayTimes(saved.igDayTimes || {})
    setIgRecurringStartDate(saved.igRecurringStartDate || '')
    setIgRecurringEndDate(saved.igRecurringEndDate || '')
    setSelectedWaTargets(saved.selectedWaTargets || [])
    setWaScheduleMode(saved.waScheduleMode || 'now')
    setWaScheduleDate(saved.waScheduleDate || '')
    setWaScheduleTime(saved.waScheduleTime || '')
    setWaRecurringDays(saved.waRecurringDays || [])
    setWaDayTimes(saved.waDayTimes || {})
    setWaRecurringStartDate(saved.waRecurringStartDate || '')
    setWaRecurringEndDate(saved.waRecurringEndDate || '')
    setShowWhatsapp(saved.showWhatsapp || false)
    if (saved.whatsappNumber) setWhatsappNumber(saved.whatsappNumber)
    setWhatsappMessage(saved.whatsappMessage || '')
    if (saved.distributionTab) setDistributionTab(saved.distributionTab)

    // Restore groups
    if (draft.groups?.length) {
      setSelectedGroups(draft.groups.map(g => ({
        id: g.externalId || g.id,
        name: g.name,
        url: g.url,
        pictureUrl: g.pictureUrl,
        externalId: g.externalId || g.id,
      })))
    }

    setShowRestore(false)

    // Jump to the last step the user was working on
    setTimeout(() => {
      const fallbackStep = draft.groupCount > 0 ? 2 : content.trim() ? 1 : 0
      setCurrentStep(Number.isInteger(saved.currentStep) ? Math.min(Math.max(saved.currentStep, 0), 3) : fallbackStep)
    }, 100)
  }

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  )

  const [groupsOpen, setGroupsOpen] = useState(false)
  const groupsPanelRef = useRef(null)
  const postTextareaRef = useRef(null)

  // Multi-step wizard
  const [currentStep, setCurrentStep] = useState(0)
  const [stepErrors, setStepErrors] = useState({}) // { 0: 'msg', 1: 'msg' }

  // Clear errors automatically when user fixes the issue
  useEffect(() => {
    if (Object.keys(stepErrors).length === 0) return
    const newErrors = { ...stepErrors }
    if (newErrors[0] && postText.trim()) { delete newErrors[0] }
    if (newErrors[1]) {
      const hasTarget = selectedGroups.length > 0 || publishToProfile || instagramEnabled
      const igNeedsMedia = instagramEnabled && postImages.length === 0
      if (hasTarget && !igNeedsMedia) { delete newErrors[1] }
    }
    if (newErrors[2]) {
      if (scheduleMode === 'now') { delete newErrors[2] }
      else if (scheduleMode === 'scheduled' && scheduleDate && scheduleTime) { delete newErrors[2] }
      else if (scheduleMode === 'recurring' && recurringDays.length > 0 && recurringDays.every(d => dayTimes[d]?.some(t => t.trim())) && recurringStartDate && recurringEndDate) { delete newErrors[2] }
    }
    if (JSON.stringify(newErrors) !== JSON.stringify(stepErrors)) {
      setStepErrors(newErrors)
      if (Object.keys(newErrors).length === 0) setError(null)
    }
  }, [postText, selectedGroups, publishToProfile, instagramEnabled, postImages, scheduleMode, scheduleDate, scheduleTime, recurringDays, dayTimes, recurringStartDate, recurringEndDate])

  const steps = [
    { id: 'content', label: 'תוכן', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
    { id: 'distribution', label: 'תפוצה', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { id: 'schedule', label: 'תזמון', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { id: 'review', label: 'סיכום', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
  ]

  const validateStep = (step) => {
    const errors = {}
    if (step >= 0) {
      if (!postText.trim()) errors[0] = 'יש לכתוב טקסט לפוסט'
    }
    if (step >= 1) {
      if (selectedGroups.length === 0 && !publishToProfile && !instagramEnabled && !whatsappDistEnabled) errors[1] = 'יש לבחור לפחות קבוצה אחת, פרסום בפרופיל, אינסטגרם או וואטסאפ'
      else if (instagramEnabled && instagramPublishTypes.length === 0) errors[1] = 'יש לבחור לפחות יעד אחד באינסטגרם: פוסט, סטורי או רילס'
      else if (instagramEnabled) {
        const sharedMedia = postImages
        const mediaFor = (type) => igTypeMedia[type].length ? igTypeMedia[type] : sharedMedia
        if (instagramPublishTypes.includes('FEED') && mediaFor('FEED').length === 0) {
          errors[1] = 'יש להוסיף תמונה או סרטון המיועדים לפוסט Instagram'
        } else if (instagramPublishTypes.includes('STORY') && mediaFor('STORY').length === 0) {
          errors[1] = 'יש להוסיף תמונה או סרטון המיועדים לסטורי Instagram'
        } else if (
          instagramPublishTypes.includes('REEL') &&
          !mediaFor('REEL').some(file => file?.type?.startsWith('video/'))
        ) {
          errors[1] = 'יש להוסיף סרטון המיועד לרילס Instagram'
        }
      }
    }
    if (step >= 2) {
      if (scheduleMode === 'scheduled') {
        if (!scheduleDate || !scheduleTime) errors[2] = 'יש לבחור תאריך ושעה'
        else if (new Date(`${scheduleDate}T${scheduleTime}`) <= new Date()) errors[2] = 'תאריך חייב להיות בעתיד'
      }
      if (scheduleMode === 'recurring') {
        if (recurringDays.length === 0) errors[2] = 'יש לבחור לפחות יום אחד'
        else if (!recurringDays.every(d => dayTimes[d]?.some(t => t.trim()))) errors[2] = 'יש לבחור שעה לכל יום שנבחר'
        else if (!recurringStartDate) errors[2] = 'יש לבחור תאריך התחלה'
        else if (!recurringEndDate) errors[2] = 'יש לבחור תאריך סיום'
      }
      if (instagramEnabled) {
        for (const type of instagramPublishTypes) {
          const typeSchedule = igTypeSchedules[type]
          const label = type === 'FEED' ? 'פוסט Instagram' : type === 'STORY' ? 'סטורי Instagram' : 'רילס Instagram'
          if (typeSchedule?.mode === 'scheduled' && (!typeSchedule.date || !typeSchedule.time)) {
            errors[2] = `יש לבחור תאריך ושעה עבור ${label}`
            break
          }
          if (typeSchedule?.mode === 'recurring') {
            const days = typeSchedule.recurringDays || []
            const hasAllTimes = days.length > 0 && days.every(day => typeSchedule.dayTimes?.[day]?.some(time => time.trim()))
            if (!hasAllTimes || !typeSchedule.startDate || !typeSchedule.endDate) {
              errors[2] = `יש להשלים ימים, שעות ותקופה עבור ${label}`
              break
            }
          }
        }
      }
    }
    return errors
  }

  const goNext = () => {
    const errors = validateStep(currentStep)
    if (errors[currentStep]) {
      setStepErrors(errors)
      setError(errors[currentStep])
      return
    }
    setStepErrors({})
    setError(null)
    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1))
  }

  const goBack = () => {
    setError(null)
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const goToStep = (idx) => {
    // Only allow going to previous steps or validated steps
    if (idx < currentStep) {
      setCurrentStep(idx)
      setError(null)
    } else if (idx === currentStep + 1) {
      goNext()
    }
  }

  // Close groups panel on outside click
  useEffect(() => {
    if (!groupsOpen) return
    const handler = (e) => {
      if (groupsPanelRef.current && !groupsPanelRef.current.contains(e.target)) {
        setGroupsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [groupsOpen])

  return (
    <div className="create-post-page">
      {/* Top Bar */}
      <header className="cp-topbar">
        {postText.trim() && !results ? (
          <button
            type="button"
            className="cp-topbar-draft"
            onClick={handleSaveAsDraft}
            disabled={savingDraft}
          >
            {savingDraft ? (
              <svg className="cp-draft-spinner" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/>
              </svg>
            )}
            <span>{savingDraft ? 'שומר...' : 'שמור כטיוטה'}</span>
          </button>
        ) : <div className="cp-topbar-spacer" />}
        <h1 className="cp-title">קמפיין חדש</h1>
        {currentStep > 0 ? (
          <button className="cp-back" onClick={goBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
        ) : (
          <button className="cp-back" onClick={handleExitWizard}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </header>

      {results ? (
        <div className="cp-results">
          <div className="cp-results-header">
            <div className="results-icon">
              {results.every(r => r.success) ? '🎉' : '⚠️'}
            </div>
            <h2>{results.every(r => r.success)
              ? (results[0]?.scheduled ? 'הקמפיין תוזמן בהצלחה!' : 'הפרסום הושלם!')
              : 'תוצאות הפרסום'}</h2>
          </div>
          <div className="results-list">
            {results.map((r, i) => (
              <div key={i} className={`result-item ${r.success ? 'success' : 'failed'}`}>
                <span className="result-group">{r.group}</span>
                <span className="result-status">
                  {r.success ? (r.scheduled ? '📅 תוזמן' : '✓ פורסם') : `✗ ${r.error}`}
                </span>
                {r.postUrl && (
                  <a href={r.postUrl} target="_blank" rel="noopener noreferrer" className="result-link">
                    צפה ←
                  </a>
                )}
              </div>
            ))}
          </div>

          {results.some(r => !r.success && /SESSION_REQUIRED|COMPOSER_NOT_FOUND|SESSION_EXPIRED/i.test(r.error || '')) && (
            <div className="session-error-box">
              <p>החיבור לפייסבוק פג תוקף. חבר מחדש ונסה שוב:</p>
              <button
                className="cp-btn-reconnect"
                disabled={reconnecting}
                onClick={async () => {
                  setReconnecting(true)
                  try {
                    await groupsService.bootstrapSession()
                    setResults(null)
                    setPublishing(true)
                    await handlePublish()
                  } catch {
                    setReconnecting(false)
                    window.alert('החיבור לא הושלם, נסה שוב')
                  }
                }}
              >
                {reconnecting ? '⏳ מתחבר...' : '🔗 חבר מחדש ופרסם'}
              </button>
            </div>
          )}

          <div className="results-actions">
            <button onClick={() => { setResults(null); setCampaignTitle(''); setPostText(''); setSelectedGroups([]); setPostImages([]); setPostImagePreviews([]); setCurrentStep(0) }} className="cp-btn-secondary">
              צור קמפיין נוסף
            </button>
            <Link to="/dashboard" className="cp-btn-primary">חזרה לדשבורד</Link>
          </div>
        </div>
      ) : (
        <>
        <div className="cp-wizard-layout">
          {/* Desktop Preview - Left side */}
          <div className="cp-preview-sidebar">
            <svg width="0" height="0" style={{position:'absolute'}}>
              <defs>
                <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFDC80" />
                  <stop offset="25%" stopColor="#F77737" />
                  <stop offset="50%" stopColor="#E1306C" />
                  <stop offset="75%" stopColor="#C13584" />
                  <stop offset="100%" stopColor="#833AB4" />
                </linearGradient>
              </defs>
            </svg>
            <span className="cp-preview-label">תצוגה מקדימה</span>
            <div className="cp-preview-toggle">
              <button
                type="button"
                className={`cp-preview-toggle-btn cp-toggle-fb ${previewMode === 'facebook' ? 'active' : ''}`}
                onClick={() => setPreviewMode('facebook')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </button>
              <button
                type="button"
                className={`cp-preview-toggle-btn cp-toggle-ig ${previewMode.startsWith('ig-') ? 'active' : ''}`}
                onClick={() => setPreviewMode(prev => prev.startsWith('ig-') ? prev : 'ig-feed')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                Instagram
              </button>
              <button
                type="button"
                className={`cp-preview-toggle-btn cp-toggle-wa ${previewMode === 'whatsapp' ? 'active' : ''}`}
                onClick={() => setPreviewMode('whatsapp')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </button>
            </div>
            {previewMode.startsWith('ig-') && (
              <div className="cp-preview-sub-toggle">
                <button type="button" className={`cp-preview-sub-btn ${previewMode === 'ig-feed' ? 'active' : ''}`} onClick={() => setPreviewMode('ig-feed')}>פוסט</button>
                <button type="button" className={`cp-preview-sub-btn ${previewMode === 'ig-story' ? 'active' : ''}`} onClick={() => setPreviewMode('ig-story')}>סטורי</button>
                <button type="button" className={`cp-preview-sub-btn ${previewMode === 'ig-reel' ? 'active' : ''}`} onClick={() => setPreviewMode('ig-reel')}>רילס</button>
              </div>
            )}
            {previewMode === 'facebook' ? (
              <FacebookPreview
                text={postText}
                images={postImagePreviews}
                groupName={selectedGroups[0]?.name}
                userName={user?.name}
                whatsappNumber={showWhatsapp ? whatsappNumber : ''}
                isAnonymous={isAnonymous}
              />
            ) : previewMode === 'whatsapp' ? (
              <WhatsAppPreview
                text={postText}
                images={postImagePreviews}
                userName={user?.name}
                targetName={selectedWaTargets[0]?.name}
              />
            ) : (
              <InstagramPreview
                text={postText}
                images={postImagePreviews}
                userName={user?.name}
                mode={previewMode === 'ig-story' ? 'STORY' : previewMode === 'ig-reel' ? 'REEL' : 'FEED'}
              />
            )}
          </div>

          <div className="cp-wizard">
          {/* Restore / Continue / Template buttons */}
          {!results && currentStep === 0 && (dataReady ? (recentDrafts.length > 0 || recentHistory.length > 0 || templates.length > 0) : true) && (
            <div className="cp-restore-bar">
              {!dataReady ? (
                <>
                  <div className="cp-restore-card cp-restore-skeleton" />
                  <div className="cp-restore-card cp-restore-skeleton" />
                  <div className="cp-restore-card cp-restore-skeleton" />
                </>
              ) : (
                <>
                  {recentHistory.length > 0 && (
                    <button type="button" className={`cp-restore-card ${showRestore === 'history' ? 'cp-restore-card-active' : ''}`} onClick={() => setShowRestore(showRestore === 'history' ? false : 'history')}>
                      <span className="cp-restore-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg></span>
                      <span className="cp-restore-card-copy"><strong>שחזור מהיסטוריה</strong><small>פתח קמפיין שפורסם בעבר</small></span>
                      <span className="cp-restore-card-count">{recentHistory.length}</span>
                    </button>
                  )}
                  {templates.length > 0 && (
                    <button type="button" className={`cp-restore-card ${showRestore === 'templates' ? 'cp-restore-card-active' : ''}`} onClick={() => setShowRestore(showRestore === 'templates' ? false : 'templates')}>
                      <span className="cp-restore-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span>
                      <span className="cp-restore-card-copy"><strong>טעינה מתבנית</strong><small>התחל מתוכן ששמרת</small></span>
                      <span className="cp-restore-card-count">{templates.length}</span>
                    </button>
                  )}
                  {recentDrafts.length > 0 && (
                    <button type="button" className={`cp-restore-card ${showRestore === 'drafts' ? 'cp-restore-card-active' : ''}`} onClick={() => setShowRestore(showRestore === 'drafts' ? false : 'drafts')}>
                      <span className="cp-restore-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/></svg></span>
                      <span className="cp-restore-card-copy"><strong>המשך טיוטה</strong><small>חזור למקום שבו עצרת</small></span>
                      <span className="cp-restore-card-count">{recentDrafts.length}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Restore / Templates panel */}
          {showRestore && (
            <div className="cp-restore-panel">
              {showRestore === 'templates' ? (
                <div className="cp-restore-list">
                  {templates.map(tpl => (
                    <div key={tpl.id} className="cp-restore-item" onClick={() => { applyTemplate(tpl); setShowRestore(false) }}>
                      <div className="cp-restore-item-content">
                        <strong>{tpl.name}</strong>
                        <p>{tpl.content?.slice(0, 60)}...</p>
                      </div>
                      <div className="cp-restore-item-meta">
                        <span>{tpl.groupIds?.length || 0} קבוצות</span>
                        <span>{tpl.usageCount} שימושים</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : loadingRecent ? (
                <div className="cp-restore-loading">טוען...</div>
              ) : (
                <div className="cp-restore-list">
                  {(showRestore === 'drafts' ? recentDrafts : (showMoreHistory ? recentHistory : recentHistory.slice(0, 3))).map(item => (
                    <div key={item.id} className="cp-restore-item" onClick={() => showRestore === 'drafts' ? handleContinueDraft(item) : handleRestore(item)}>
                      <div className="cp-restore-item-content">
                        <strong>{item.title || item.content?.slice(0, 40) || 'ללא כותרת'}</strong>
                        {item.title && <p>{item.content?.slice(0, 60)}...</p>}
                      </div>
                      <div className="cp-restore-item-meta">
                        <span>{item.groupCount > 0 ? `${item.groupCount} קבוצות` : ''}</span>
                        <span>{new Date(item.updatedAt || item.createdAt).toLocaleDateString('he-IL')}</span>
                      </div>
                    </div>
                  ))}
                  {showRestore === 'history' && recentHistory.length > 3 && !showMoreHistory && (
                    <button type="button" className="cp-restore-more" onClick={() => setShowMoreHistory(true)}>
                      הצג עוד ({recentHistory.length - 3})
                    </button>
                  )}
                  {(showRestore === 'drafts' ? recentDrafts : recentHistory).length === 0 && (
                    <div className="cp-restore-empty">
                      {showRestore === 'drafts' ? 'אין טיוטות שמורות' : 'אין היסטוריה'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Stepper */}
          <div className="cp-stepper">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={`cp-step ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''} ${stepErrors[idx] ? 'has-error' : ''}`}
                onClick={() => goToStep(idx)}
              >
                <div className="cp-step-indicator">
                  {idx < currentStep ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : step.icon}
                </div>
                <span className="cp-step-label">{step.label}</span>
              </div>
            ))}
            <div className="cp-stepper-progress" style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }} />
          </div>

          {/* Step Content */}
          <div className="cp-step-content">
            {/* STEP 0: Content */}
            {currentStep === 0 && (
              <div className="cp-step-panel">
                <div className="cp-card cp-content-editor">
                  <div className="cp-content-editor-heading">
                    <div>
                      <span className="cp-content-eyebrow">תוכן הקמפיין</span>
                      <h2>כתיבת הפוסט</h2>
                      <p>נסח את המסר והוסף את הפרטים שיצורפו לפרסום</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="cp-title-input"
                    placeholder="שם הקמפיין — לשימוש פנימי"
                    aria-label="כותרת הקמפיין"
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                  />
                  <div className="cp-textarea-wrap">
                  <textarea
                    ref={postTextareaRef}
                    className={`cp-textarea ${stepErrors[0] && !postText.trim() ? 'input-error' : ''}`}
                    placeholder="כתוב כאן את תוכן הפוסט..."
                    aria-label="תוכן הפוסט"
                    aria-invalid={!!(stepErrors[0] && !postText.trim())}
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    rows={6}
                  />
                  <EmojiPicker
                    textareaRef={postTextareaRef}
                    onSelect={(newText) => setPostText(newText)}
                  />
                  <button
                    type="button"
                    className="cp-ai-generate-btn cp-ai-generate-inline"
                    onClick={() => navigate('/generate-post', { state: { fromCreatePost: true } })}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3Z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8L19 14Z"/></svg>
                    יצירת תוכן עם AI
                  </button>
                  </div>

                  {postImagePreviews.length > 0 && (
                    <div className="cp-images-preview">
                      {postImagePreviews.map((preview, i) => (
                        <div key={i} className="cp-image-preview-item">
                          {postImages[i]?.type?.startsWith('video/') ? (
                            <video src={preview} muted style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                          ) : (
                            <img src={preview} alt={`preview ${i + 1}`} />
                          )}
                          <span className="cp-image-number">{postImages[i]?.type?.startsWith('video/') ? '🎬' : i + 1}</span>
                          <button onClick={() => removeImage(i)} className="cp-remove-img" aria-label={`הסר מדיה ${i + 1}`}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {waLinking && (
                    <div className="cp-whatsapp-wrap">
                      <p className="cp-whatsapp-hint">קשר מספר וואטסאפ פעם אחת, יישמר לכל הפוסטים הבאים</p>
                      <div className="cp-whatsapp-input">
                        <span className="cp-whatsapp-prefix">wa.me/</span>
                        <input
                          type="tel"
                          placeholder="972501234567"
                          value={waTempNumber}
                          onChange={(e) => setWaTempNumber(e.target.value)}
                          dir="ltr"
                        />
                      </div>
                      <div className="cp-whatsapp-input" style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="הודעה מותאמת (אופציונלי)"
                          value={waTempMessage}
                          onChange={(e) => setWaTempMessage(e.target.value)}
                          dir="rtl"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <p className="cp-whatsapp-hint" style={{ fontSize: 11, marginTop: 4 }}>הודעה שתופיע אוטומטית כשמישהו לוחץ על קישור הוואטסאפ שלך</p>
                      <div className="cp-whatsapp-actions">
                        <button
                          type="button"
                          className="cp-wa-save-btn"
                          disabled={waSaving || !waTempNumber.trim()}
                          onClick={async () => {
                            setWaSaving(true)
                            try {
                              const res = await authAPI.updateWhatsapp({ whatsappNumber: waTempNumber.trim(), whatsappMessage: waTempMessage.trim() || null })
                              if (res.data.success) {
                                setWhatsappNumber(res.data.whatsappNumber)
                                setWhatsappMessage(res.data.whatsappMessage || '')
                                setShowWhatsapp(true)
                                setWaLinking(false)
                              }
                            } catch { /* ignore */ }
                            finally { setWaSaving(false) }
                          }}
                        >
                          {waSaving ? '⏳' : '💾 שמור וקשר'}
                        </button>
                        <button type="button" className="cp-wa-cancel-btn" onClick={() => setWaLinking(false)}>ביטול</button>
                      </div>
                    </div>
                  )}

                  {showWhatsapp && whatsappNumber && (
                    <div className="cp-whatsapp-wrap cp-whatsapp-active">
                      <div className="cp-wa-active-header">
                        <span className="cp-wa-active-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </span>
                        <span className="cp-wa-active-title">
                          <strong>קישור WhatsApp</strong>
                          <small>הקישור יצורף לתוכן הפוסט</small>
                        </span>
                        <span className="cp-wa-active-status">פעיל</span>
                      </div>
                      <div className="cp-whatsapp-row cp-wa-active-link" dir="ltr">wa.me/{whatsappNumber.replace(/[^0-9]/g, '')}{whatsappMessage ? '?text=...' : ''}</div>
                      {whatsappMessage && !waEditingMsg && <div className="cp-wa-msg-preview">{whatsappMessage}</div>}
                      {!waEditingMsg ? (
                        <button type="button" className="cp-wa-edit-btn" onClick={() => setWaEditingMsg(true)}>עריכת הודעה</button>
                      ) : (
                        <div className="cp-wa-edit-wrap">
                          <span className="cp-wa-edit-label">הודעה שתוצג בוואטסאפ</span>
                          <input
                            type="text"
                            placeholder="הודעה מותאמת (אופציונלי)"
                            value={whatsappMessage}
                            onChange={(e) => setWhatsappMessage(e.target.value)}
                            dir="rtl"
                          />
                          <button type="button" className="cp-wa-edit-btn" onClick={() => setWaEditingMsg(false)}>סיום עריכה</button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="cp-options cp-content-tools">
                    <div className="cp-content-tools-heading">
                      <strong>אפשרויות נוספות</strong>
                      <span>מדיה, מיקום והגדרות משלימות</span>
                    </div>
                    <label className="cp-options-label">● הוספות</label>
                    <div className="cp-options-row">
                      <label className="cp-option-card">
                        <span className="cp-option-card-icon cp-icon-blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg></span>
                        <span className="cp-option-card-text">תמונות / סרטון</span>
                        <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={handleImageSelect} hidden aria-label="בחר תמונות או סרטונים" />
                      </label>
                      <button
                        type="button"
                        className={`cp-option-card ${showLocationInput ? 'active' : ''}`}
                        onClick={() => setShowLocationInput(!showLocationInput)}
                      >
                        <span className="cp-option-card-icon cp-icon-red"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
                        <span className="cp-option-card-text">מיקום</span>
                      </button>
                      <label className={`cp-option-card ${isAnonymous ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isAnonymous}
                          onChange={(e) => setIsAnonymous(e.target.checked)}
                          hidden
                        />
                        <span className="cp-option-card-icon cp-icon-gray"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>
                        <span className="cp-option-card-text">אנונימי</span>
                      </label>
                    </div>
                    {showLocationInput && (
                      <div className="cp-location-wrap">
                        <LocationAutocomplete
                          value={postLocation}
                          onChange={setPostLocation}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      className={`cp-option-whatsapp ${showWhatsapp ? 'active' : ''}`}
                      onClick={() => {
                        if (!whatsappNumber) {
                          setWaLinking(true)
                        } else {
                          setShowWhatsapp(!showWhatsapp)
                        }
                      }}
                    >
                      <span className="cp-option-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </span>
                      <span>{showWhatsapp ? 'הסר וואטסאפ' : 'הוסף וואטסאפ'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: Distribution */}
            {currentStep === 1 && (
              <div className="cp-step-panel">
                {/* Platform Toggles */}
                <div className="cp-platform-tabs">
                  <button
                    type="button"
                    className={`cp-platform-tab ${distributionTab === 'facebook' ? 'active' : ''}`}
                    onClick={() => setDistributionTab('facebook')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    <span>Facebook</span>
                  </button>
                  <button
                    type="button"
                    className={`cp-platform-tab ${distributionTab === 'instagram' ? 'active' : ''}`}
                    onClick={() => { setDistributionTab('instagram'); checkInstagramStatus() }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    <span>Instagram</span>
                  </button>
                  <button
                    type="button"
                    className={`cp-platform-tab cp-platform-tab-whatsapp ${distributionTab === 'whatsapp' ? 'active' : ''}`}
                    onClick={() => { setDistributionTab('whatsapp'); if (whatsappConnected) loadWaGroups() }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    <span>WhatsApp</span>
                  </button>
                </div>

                {/* ─── Facebook section ─── */}
                {distributionTab === 'facebook' && (
                <div className="cp-facebook-panel">
                <div className="cp-facebook-panel-heading">
                  <div>
                    <span className="cp-facebook-eyebrow">יעדי פרסום</span>
                    <h3>איפה לפרסם בפייסבוק?</h3>
                    <p>אפשר לבחור קבוצות, פרופיל אישי או את שניהם</p>
                  </div>
                  <span className="cp-facebook-target-total">
                    {(selectedGroups.length + (publishToProfile ? 1 : 0))} יעדים
                  </span>
                </div>

                {/* Profile Publishing Toggle */}
                <div className={`cp-facebook-profile-option ${publishToProfile ? 'selected' : ''}`}>
                  <label className="cp-profile-toggle">
                    <span className="cp-profile-toggle-icon">👤</span>
                    <span className="cp-profile-toggle-label">
                      <span>פרסום בפרופיל האישי שלי</span>
                      <span className="cp-profile-toggle-hint">הפוסט יפורסם גם בפרופיל האישי שלך</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={publishToProfile}
                      onChange={(e) => setPublishToProfile(e.target.checked)}
                    />
                  </label>
                </div>

                <div className="cp-facebook-groups-section">
                  <div className="cp-card-header cp-facebook-groups-header">
                    <div>
                      <h3>קבוצות פייסבוק</h3>
                      <span>בחר את הקהלים שאליהם הפוסט יישלח</span>
                    </div>
                    <span className={`cp-badge ${selectedGroups.length > 0 ? 'has-selection' : ''}`}>
                      {selectedGroups.length} נבחרו
                    </span>
                      </div>

                      {selectedGroups.length > 0 && (
                        <div className="cp-selected-groups-chips">
                          {(showAllChips ? selectedGroups : selectedGroups.slice(0, 4)).map(g => (
                            <span key={g.id} className="cp-selected-chip">
                              <span>{g.name}</span>
                              <button type="button" onClick={() => toggleGroup(g)} aria-label={`הסר את ${g.name || 'הקבוצה'} מהבחירה`}>✕</button>
                            </span>
                          ))}
                          {selectedGroups.length > 4 && !showAllChips && (
                            <button type="button" className="cp-selected-chip cp-chip-more" onClick={() => setShowAllChips(true)}>
                              +{selectedGroups.length - 4} עוד
                            </button>
                          )}
                          {selectedGroups.length > 4 && showAllChips && (
                            <button type="button" className="cp-selected-chip cp-chip-more" onClick={() => setShowAllChips(false)}>
                              הצג פחות
                            </button>
                          )}
                        </div>
                      )}

                      {selectedGroups.length > 0 && (
                        <div className="cp-exposure-counter">
                          <span className="cp-exposure-icon">👁️</span>
                          <span className="cp-exposure-number">
                            {selectedGroups.reduce((sum, g) => sum + (g.memberCount || 0), 0).toLocaleString()}
                          </span>
                          <span className="cp-exposure-label">חשיפה פוטנציאלית</span>
                        </div>
                      )}

                      {loadingGroups ? (
                        <div className="cp-loading">טוען קבוצות...</div>
                      ) : groups.length === 0 ? (
                        <div className="cp-no-groups">
                          <p>אין קבוצות שמורות</p>
                          <Link to="/dashboard?tab=groups">סנכרן קבוצות מפייסבוק</Link>
                        </div>
                      ) : (
                        <div className="cp-groups-panel">
                          <div className="cp-group-search">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input
                              type="text"
                              placeholder="חפש קבוצה..."
                              aria-label="חיפוש קבוצה"
                              value={groupSearch}
                              onChange={(e) => setGroupSearch(e.target.value)}
                            />
                          </div>

                          <div className="cp-group-actions">
                            <button onClick={selectAllGroups} type="button">בחר הכל</button>
                            <button onClick={deselectAll} type="button">נקה בחירה</button>
                          </div>

                          <div className="cp-groups-list">
                            {filteredGroups.map((group) => (
                              <label
                                key={group.id}
                                className={`cp-group-item ${selectedGroups.find(g => g.id === group.id) ? 'selected' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={!!selectedGroups.find(g => g.id === group.id)}
                                  onChange={() => toggleGroup(group)}
                                />
                                <span className="cp-group-name">{group.name}</span>
                                {group.memberCount && (
                                  <span className="cp-group-members">{group.memberCount.toLocaleString()}</span>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                </div>
                )}

                {/* ─── Instagram section ─── */}
                {distributionTab === 'instagram' && (
                  <div className="cp-platform-panel cp-instagram-card">
                    {!instagramConnected ? (
                      <div className="cp-ig-connect-notice">
                        <div className="cp-ig-notice-icon">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="url(#ig-gradient)">
                            <defs>
                              <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#FFDC80" />
                                <stop offset="25%" stopColor="#F77737" />
                                <stop offset="50%" stopColor="#E1306C" />
                                <stop offset="75%" stopColor="#C13584" />
                                <stop offset="100%" stopColor="#833AB4" />
                              </linearGradient>
                            </defs>
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                          </svg>
                        </div>
                        <h3 className="cp-ig-notice-title">חבר את חשבון האינסטגרם שלך</h3>
                        <p className="cp-ig-notice-text">כדי לפרסם באינסטגרם, יש לחבר חשבון Instagram מסוג <strong>Business</strong> או <strong>Creator</strong>.</p>
                        <div className="cp-ig-notice-alert">
                          <span className="cp-ig-alert-icon">⚠️</span>
                          <span>חשבון אינסטגרם אישי רגיל לא נתמך. יש להמיר אותו לחשבון מקצועי (Business / Creator) בהגדרות האפליקציה.</span>
                        </div>
                        <button
                          type="button"
                          className="cp-ig-connect-btn"
                          onClick={async () => {
                            try {
                              const res = await authAPI.getInstagramAuthUrl()
                              if (res.data.authUrl) {
                                const popup = window.open(res.data.authUrl, 'instagram-oauth', 'width=600,height=700,left=200,top=100')
                                const handleMessage = (event) => {
                                  if (!event.data || event.data.type !== 'instagram-oauth-callback') return
                                  window.removeEventListener('message', handleMessage)
                                  if (event.data.success) {
                                    setUser(prev => ({ ...prev, instagramConnected: true, instagramUsername: event.data.username }))
                                    setInstagramEnabled(true)
                                  }
                                }
                                window.addEventListener('message', handleMessage)
                                const timer = setInterval(async () => {
                                  if (popup?.closed) {
                                    clearInterval(timer)
                                    window.removeEventListener('message', handleMessage)
                                    try {
                                      const statusRes = await authAPI.getInstagramStatus()
                                      if (statusRes?.data?.connected) {
                                        setUser(prev => ({ ...prev, instagramConnected: true, instagramUsername: statusRes.data.account?.username }))
                                        setInstagramEnabled(true)
                                      }
                                    } catch { /* ignore */ }
                                  }
                                }, 500)
                              }
                            } catch (error) {
                              const message = error?.response?.data?.error || error?.userMessage || 'שגיאה ביצירת קישור חיבור'
                              window.alert(message)
                            }
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                          חבר חשבון Instagram
                        </button>
                      </div>
                    ) : (<>
                      <div className="cp-platform-panel-heading cp-instagram-panel-heading">
                        <div>
                          <span className="cp-platform-eyebrow">חשבון מחובר</span>
                          <h3>פרסום ב־Instagram</h3>
                          <p>בחר את הפורמטים שבהם התוכן יפורסם</p>
                        </div>
                        <span className="cp-platform-selection-count">
                          {instagramPublishTypes.length} פורמטים
                        </span>
                      </div>
                      <div className="cp-ig-options">
                        <p className="cp-ig-options-label">סוג הפרסום באינסטגרם:</p>
                        <div className="cp-ig-type-grid">
                          <button
                            type="button"
                            className={`cp-ig-type-card ${instagramPublishTypes.includes('FEED') ? 'active' : ''}`}
                            onClick={() => toggleInstagramType('FEED')}
                          >
                            <span className="cp-ig-type-icon">🖼️</span>
                            <span className="cp-ig-type-name">פוסט</span>
                            <span className="cp-ig-type-desc">פוסט בפיד האינסטגרם</span>
                          </button>
                          <button
                            type="button"
                            className={`cp-ig-type-card ${instagramPublishTypes.includes('STORY') ? 'active' : ''}`}
                            onClick={() => toggleInstagramType('STORY')}
                          >
                            <span className="cp-ig-type-icon">⏱️</span>
                            <span className="cp-ig-type-name">סטורי</span>
                            <span className="cp-ig-type-desc">סטורי שנעלם אחרי 24 שעות</span>
                          </button>
                          <button
                            type="button"
                            className={`cp-ig-type-card ${instagramPublishTypes.includes('REEL') ? 'active' : ''}`}
                            onClick={() => toggleInstagramType('REEL')}
                          >
                            <span className="cp-ig-type-icon">🎬</span>
                            <span className="cp-ig-type-name">ריל</span>
                            <span className="cp-ig-type-desc">סרטון קצר בפורמט Reels</span>
                          </button>
                        </div>

                        {instagramPublishTypes.length > 1 && (
                          <div className="cp-ig-hint cp-ig-hint-success" style={{ marginTop: 8 }}>
                            <span>✨</span>
                            <span>התוכן יפורסם ב-{instagramPublishTypes.length} סוגים במקביל</span>
                          </div>
                        )}

                        {instagramPublishTypes.includes('STORY') && !postImagePreviews.length && !igTypeMediaPreviews.STORY.length && (
                          <div className="cp-ig-hint cp-ig-upload-prompt">
                            <span>💡</span>
                            <span>סטורי דורש תמונה או סרטון.</span>
                            <label className="cp-ig-upload-btn">
                              📷 העלאת תמונה או סרטון לסטורי
                              <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleIgTypeMediaSelect('STORY')} aria-label="בחר מדיה לסטורי" />
                            </label>
                            <span className="cp-ig-upload-note">📌 מדיה זו תשמש רק לסטורי</span>
                          </div>
                        )}

                        {instagramPublishTypes.includes('STORY') && igTypeMediaPreviews.STORY.length > 0 && (
                          <div className="cp-ig-type-media-preview">
                            <div className="cp-ig-type-media-header">
                              <span>📸 מדיה ספציפית לסטורי:</span>
                            </div>
                            <div className="cp-ig-type-media-grid">
                              {igTypeMediaPreviews.STORY.map((src, i) => (
                                <div key={i} className="cp-ig-type-media-item">
                                  {igTypeMedia.STORY[i]?.type?.startsWith('video/') ? (
                                    <video src={src} className="cp-ig-type-media-thumb" />
                                  ) : (
                                    <img src={src} alt={`סטורי ${i + 1}`} className="cp-ig-type-media-thumb" />
                                  )}
                                  <button type="button" className="cp-ig-type-media-remove" onClick={() => removeIgTypeMedia('STORY', i)} aria-label={`הסר מדיה מסטורי ${i + 1}`}>✕</button>
                                </div>
                              ))}
                            </div>
                            <span className="cp-ig-upload-note">📌 מדיה זו תשמש רק לסטורי</span>
                            <div className="cp-ig-type-caption">
                              <input
                                type="text"
                                className="cp-ig-story-caption-input"
                                placeholder="שנה טקסט לסטורי (ברירת מחדל: טקסט הפוסט)"
                                value={igTypeCaptions.STORY}
                                onChange={(e) => setIgTypeCaptions(prev => ({ ...prev, STORY: e.target.value }))}
                              />
                            </div>
                          </div>
                        )}

                        {/* Story with multiple images — let user choose */}
                        {instagramPublishTypes.includes('STORY') && postImagePreviews.length > 1 && (
                          <div className="cp-ig-media-options">
                            <div className="cp-ig-media-notice">
                              <span className="cp-ig-media-notice-icon">ℹ️</span>
                              <span>סטורי תומך בתמונה/סרטון <strong>אחד בלבד</strong>. העלית {postImagePreviews.length} קבצים — בחרי מה לעשות:</span>
                            </div>
                            <div className="cp-ig-media-choices">
                              <label className={`cp-ig-media-choice ${storyMediaMode === 'first' ? 'active' : ''}`}>
                                <input type="radio" name="storyMedia" checked={storyMediaMode === 'first'} onChange={() => setStoryMediaMode('first')} aria-label="בחר תמונה ראשונה לסטורי" />
                                <div className="cp-ig-media-choice-content">
                                  <span className="cp-ig-media-choice-title">📸 פרסם רק את הראשונה</span>
                                  <span className="cp-ig-media-choice-desc">סטורי אחד עם התמונה הראשונה שהעלית</span>
                                </div>
                              </label>
                              <label className={`cp-ig-media-choice ${storyMediaMode === 'all' ? 'active' : ''}`}>
                                <input type="radio" name="storyMedia" checked={storyMediaMode === 'all'} onChange={() => setStoryMediaMode('all')} aria-label="בחר את כל התמונות לסטורי" />
                                <div className="cp-ig-media-choice-content">
                                  <span className="cp-ig-media-choice-title">📚 פרסם סטורי לכל תמונה</span>
                                  <span className="cp-ig-media-choice-desc">{postImagePreviews.length} סטוריז נפרדים, אחד לכל תמונה</span>
                                </div>
                              </label>
                              <label className={`cp-ig-media-choice ${storyMediaMode === 'pick' ? 'active' : ''}`}>
                                <input type="radio" name="storyMedia" checked={storyMediaMode === 'pick'} onChange={() => setStoryMediaMode('pick')} aria-label="בחר תמונה ידנית לסטורי" />
                                <div className="cp-ig-media-choice-content">
                                  <span className="cp-ig-media-choice-title">🎯 בחר תמונה ספציפית</span>
                                  <span className="cp-ig-media-choice-desc">בחרי איזו תמונה תופיע בסטורי</span>
                                </div>
                              </label>
                            </div>

                            {/* Image picker grid */}
                            {storyMediaMode === 'pick' && (
                              <div className="cp-ig-image-picker">
                                {postImagePreviews.map((img, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    className={`cp-ig-image-pick-item ${storyPickedIndex === i ? 'active' : ''}`}
                                    onClick={() => setStoryPickedIndex(i)}
                                  >
                                    <img src={img} alt={`תמונה ${i + 1}`} />
                                    {storyPickedIndex === i && <span className="cp-ig-image-pick-check">✓</span>}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Per-story captions */}
                            {storyMediaMode === 'all' && (
                              <div className="cp-ig-story-captions">
                                <div className="cp-ig-media-notice" style={{ marginTop: '0.5rem' }}>
                                  <span className="cp-ig-media-notice-icon">✏️</span>
                                  <span>טקסט לכל סטורי (אופציונלי — יופיע על התמונה):</span>
                                </div>
                                {postImagePreviews.map((img, i) => (
                                  <div key={i} className="cp-ig-story-caption-row">
                                    <img src={img} alt={`סטורי ${i + 1}`} className="cp-ig-story-caption-thumb" />
                                    <input
                                      type="text"
                                      className="cp-ig-story-caption-input"
                                      placeholder={`טקסט לסטורי ${i + 1} (ברירת מחדל: טקסט הפוסט)`}
                                      value={storyCaptions[i] || ''}
                                      onChange={(e) => {
                                        const updated = [...storyCaptions]
                                        updated[i] = e.target.value
                                        setStoryCaptions(updated)
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Reels — video required */}
                        {instagramPublishTypes.includes('REEL') && (
                          <div className="cp-ig-media-options">
                            <div className="cp-reel-scope">
                              <div className="cp-reel-scope-heading">
                                <strong>איפה להשתמש בסרטון שאוסיף?</strong>
                                <span>ברירת המחדל היא כל הקמפיין</span>
                              </div>
                              <div className="cp-reel-scope-options" role="radiogroup" aria-label="שימוש בסרטון">
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={reelVideoScope === 'campaign'}
                                  className={reelVideoScope === 'campaign' ? 'active' : ''}
                                  onClick={() => changeReelVideoScope('campaign')}
                                >
                                  <span className="cp-reel-scope-icon">✨</span>
                                  <span><strong>כל הקמפיין</strong><small>Facebook וכל יעדי Instagram</small></span>
                                </button>
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={reelVideoScope === 'reel'}
                                  className={reelVideoScope === 'reel' ? 'active' : ''}
                                  onClick={() => changeReelVideoScope('reel')}
                                >
                                  <span className="cp-reel-scope-icon">🎬</span>
                                  <span><strong>רק לרילס</strong><small>שאר הקמפיין יישאר ללא שינוי</small></span>
                                </button>
                              </div>
                            </div>
                            {(() => {
                              const hasVideo = postImages.some(f => f?.type?.startsWith('video/')) || igTypeMedia.REEL.some(f => f?.type?.startsWith('video/'))
                              const hasImages = postImagePreviews.length > 0 && !postImages.some(f => f?.type?.startsWith('video/'))
                              if (hasVideo) {
                                return (
                                  <div className="cp-ig-hint cp-ig-hint-success">
                                    <span>✅</span>
                                    <span>סרטון זוהה — הוא ישמש כריל שלך.</span>
                                  </div>
                                )
                              }
                              if (hasImages && !igTypeMediaPreviews.REEL.length) {
                                return (
                                  <div className="cp-ig-media-notice cp-ig-media-notice-warn">
                                    <span className="cp-ig-media-notice-icon">⚠️</span>
                                    <span>ריל דורש <strong>סרטון</strong>. העלית רק תמונות.</span>
                                    <label className="cp-ig-upload-btn">
                                      🎬 העלאת סרטון לריל
                                      <input type="file" accept="video/*" style={{ display: 'none' }} onChange={handleReelVideoSelect} aria-label="בחר סרטון לריל" />
                                    </label>
                                    <span className="cp-ig-upload-note">📌 הסרטון ישמש {reelVideoScope === 'campaign' ? 'את כל הקמפיין' : 'רק את הרילס'}</span>
                                  </div>
                                )
                              }
                              if (!igTypeMediaPreviews.REEL.length) {
                                return (
                                  <div className="cp-ig-hint cp-ig-upload-prompt">
                                    <span>💡</span>
                                    <span>ריל דורש סרטון.</span>
                                    <label className="cp-ig-upload-btn">
                                      🎬 העלאת סרטון לריל
                                      <input type="file" accept="video/*" style={{ display: 'none' }} onChange={handleReelVideoSelect} aria-label="בחר סרטון לריל" />
                                    </label>
                                    <span className="cp-ig-upload-note">📌 הסרטון ישמש {reelVideoScope === 'campaign' ? 'את כל הקמפיין' : 'רק את הרילס'}</span>
                                  </div>
                                )
                              }
                              return null
                            })()}

                            {igTypeMediaPreviews.REEL.length > 0 && (
                              <div className="cp-ig-type-media-preview">
                                <div className="cp-ig-type-media-header">
                                  <span>🎬 סרטון ספציפי לריל:</span>
                                </div>
                                <div className="cp-ig-type-media-grid">
                                  {igTypeMediaPreviews.REEL.map((src, i) => (
                                    <div key={i} className="cp-ig-type-media-item">
                                      <video src={src} className="cp-ig-type-media-thumb" />
                                      <button type="button" className="cp-ig-type-media-remove" onClick={() => removeIgTypeMedia('REEL', i)} aria-label={`הסר מדיה מרילס ${i + 1}`}>✕</button>
                                    </div>
                                  ))}
                                </div>
                                <span className="cp-ig-upload-note">📌 סרטון זה ישמש רק לריל</span>
                              </div>
                            )}
                          </div>
                        )}

                        {instagramPublishTypes.includes('FEED') && !postImagePreviews.length && !igTypeMediaPreviews.FEED.length && (
                          <div className="cp-ig-hint cp-ig-upload-prompt">
                            <span>💡</span>
                            <span>פוסט בפיד דורש לפחות תמונה אחת.</span>
                            <label className="cp-ig-upload-btn">
                              📷 העלאת תמונה לפיד
                              <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleIgTypeMediaSelect('FEED')} aria-label="בחר מדיה לפיד" />
                            </label>
                            <span className="cp-ig-upload-note">📌 מדיה זו תשמש רק לפיד</span>
                          </div>
                        )}

                        {instagramPublishTypes.includes('FEED') && igTypeMediaPreviews.FEED.length > 0 && (
                          <div className="cp-ig-type-media-preview">
                            <div className="cp-ig-type-media-header">
                              <span>🖼️ מדיה ספציפית לפיד:</span>
                            </div>
                            <div className="cp-ig-type-media-grid">
                              {igTypeMediaPreviews.FEED.map((src, i) => (
                                <div key={i} className="cp-ig-type-media-item">
                                  {igTypeMedia.FEED[i]?.type?.startsWith('video/') ? (
                                    <video src={src} className="cp-ig-type-media-thumb" />
                                  ) : (
                                    <img src={src} alt={`פיד ${i + 1}`} className="cp-ig-type-media-thumb" />
                                  )}
                                  <button type="button" className="cp-ig-type-media-remove" onClick={() => removeIgTypeMedia('FEED', i)} aria-label={`הסר מדיה מפיד ${i + 1}`}>✕</button>
                                </div>
                              ))}
                            </div>
                            <span className="cp-ig-upload-note">📌 מדיה זו תשמש רק לפיד</span>
                          </div>
                        )}
                      </div>
                    </>)}
                  </div>
                )}

                {/* ─── WhatsApp section ─── */}
                {distributionTab === 'whatsapp' && (
                  <div className="cp-platform-panel cp-whatsapp-card">
                    {!whatsappConnected ? (
                      <div className="cp-ig-connect-notice">
                        <div className="cp-ig-notice-icon" style={{ color: '#25d366', fontSize: 48 }}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </div>
                        <h3 className="cp-ig-notice-title">חבר את חשבון הוואטסאפ שלך</h3>
                        <p className="cp-ig-notice-text">כדי לשלוח הודעות בוואטסאפ, יש לחבר את חשבון הוואטסאפ שלך דרך הגדרות הפלטפורמות.</p>
                        <button
                          type="button"
                          className="cp-ig-connect-btn"
                          style={{ background: '#25d366' }}
                          onClick={() => navigate('/settings/platforms')}
                        >
                          חבר וואטסאפ
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="cp-platform-panel-heading cp-whatsapp-panel-heading">
                          <div>
                            <span className="cp-platform-eyebrow">בחירת נמענים</span>
                            <h3>שליחה דרך WhatsApp</h3>
                            <p>בחר קבוצות או רשימות תפוצה לשליחת הקמפיין</p>
                          </div>
                          <span className="cp-platform-selection-count">
                            {selectedWaTargets.length} יעדים
                          </span>
                        </div>
                        <div className="cp-platform-content cp-whatsapp-content">
                          {(() => {
                            const allWaItems = [
                              ...(waGroups || []).map(g => ({ id: g.id, type: 'group', name: g.name, size: g.participants || null })),
                              ...(waBroadcastLists || []).map(bl => ({ id: bl.id, type: 'broadcast', name: bl.name, size: bl.members?.length || 0 })),
                            ]
                            const searchLower = waSearch.toLowerCase()
                            const filteredWaItems = searchLower
                              ? allWaItems.filter(item => item.name.toLowerCase().includes(searchLower))
                              : allWaItems
                            // A search intentionally spans both target types. Without
                            // a search, only the active inner tab is displayed.
                            const visibleWaItems = searchLower
                              ? filteredWaItems
                              : filteredWaItems.filter(item =>
                                  waTargetTab === 'groups'
                                    ? item.type === 'group'
                                    : item.type === 'broadcast'
                                )
                            const waGroupItems = visibleWaItems.filter(item => item.type === 'group')
                            const waBroadcastItems = visibleWaItems.filter(item => item.type === 'broadcast')

                            return allWaItems.length === 0 ? (
                              <div className="cp-no-groups">
                                <p>אין קבוצות או רשימות תפוצה</p>
                                <Link to="/settings/platforms">סנכרן מוואטסאפ</Link>
                              </div>
                            ) : (
                              <div className="cp-groups-panel">
                                <div className="cp-group-search">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                  </svg>
                                  <input
                                    type="text"
                                    placeholder="חפש קבוצה או רשימת תפוצה..."
                                    aria-label="חיפוש קבוצת וואטסאפ או רשימת תפוצה"
                                    value={waSearch}
                                    onChange={(e) => setWaSearch(e.target.value)}
                                  />
                                </div>

                                <div className="cp-wa-target-tabs" role="tablist" aria-label="סוג יעד בוואטסאפ">
                                  <button
                                    type="button"
                                    role="tab"
                                    aria-selected={waTargetTab === 'groups'}
                                    className={waTargetTab === 'groups' ? 'active' : ''}
                                    onClick={() => setWaTargetTab('groups')}
                                  >
                                    <span>קבוצות WhatsApp</span>
                                    <span className="cp-wa-tab-count">{waGroups?.length || 0}</span>
                                  </button>
                                  <button
                                    type="button"
                                    role="tab"
                                    aria-selected={waTargetTab === 'broadcasts'}
                                    className={waTargetTab === 'broadcasts' ? 'active' : ''}
                                    onClick={() => setWaTargetTab('broadcasts')}
                                  >
                                    <span>רשימות תפוצה</span>
                                    <span className="cp-wa-tab-count">{waBroadcastLists?.length || 0}</span>
                                  </button>
                                </div>

                                <div className="cp-group-actions">
                                  <button onClick={() => {
                                    const all = visibleWaItems.map(item => ({ id: item.id, type: item.type, name: item.name }))
                                    setSelectedWaTargets(prev => {
                                      const existing = new Set(prev.map(t => `${t.type}:${t.id}`))
                                      const toAdd = all.filter(t => !existing.has(`${t.type}:${t.id}`))
                                      return [...prev, ...toAdd]
                                    })
                                  }}>בחר הכל</button>
                                  <button onClick={() => setSelectedWaTargets([])} type="button">נקה בחירה</button>
                                  <span className="cp-selected-count">{selectedWaTargets.length} נבחרו</span>
                                </div>

                                <div className="cp-groups-list">
                                  {waBroadcastItems.length > 0 && (
                                    <div className="cp-wa-section-label">📢 רשימות תפוצה</div>
                                  )}
                                  {waBroadcastItems.map(item => {
                                    const isSelected = selectedWaTargets.some(t => t.id === item.id && t.type === 'broadcast')
                                    return (
                                      <label key={`bl-${item.id}`} className={`cp-group-item ${isSelected ? 'selected' : ''}`}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {
                                            if (isSelected) {
                                              setSelectedWaTargets(prev => prev.filter(t => !(t.id === item.id && t.type === 'broadcast')))
                                            } else {
                                              setSelectedWaTargets(prev => [...prev, { id: item.id, type: 'broadcast', name: item.name }])
                                            }
                                          }}
                                        />
                                        <span className="cp-group-name">{item.name}</span>
                                        {item.size != null && <span className="cp-group-members">{item.size.toLocaleString()}</span>}
                                      </label>
                                    )
                                  })}
                                  {waGroupItems.length > 0 && (
                                    <div className="cp-wa-section-label">👥 קבוצות</div>
                                  )}
                                  {waGroupItems.map(item => {
                                    const isSelected = selectedWaTargets.some(t => t.id === item.id && t.type === 'group')
                                    return (
                                      <label key={`g-${item.id}`} className={`cp-group-item ${isSelected ? 'selected' : ''}`}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {
                                            if (isSelected) {
                                              setSelectedWaTargets(prev => prev.filter(t => !(t.id === item.id && t.type === 'group')))
                                            } else {
                                              setSelectedWaTargets(prev => [...prev, { id: item.id, type: 'group', name: item.name }])
                                            }
                                          }}
                                        />
                                        <span className="cp-group-name">{item.name}</span>
                                        {item.size != null && <span className="cp-group-members">{item.size.toLocaleString()}</span>}
                                      </label>
                                    )
                                  })}
                                  {visibleWaItems.length === 0 && (
                                    <div className="cp-wa-no-results">
                                      {searchLower ? 'לא נמצאו תוצאות בקבוצות או ברשימות תפוצה' : 'אין יעדים בטאב זה'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Schedule */}
            {currentStep === 2 && (() => {
              const hasFacebook = selectedGroups.length > 0 || publishToProfile
              const hasInstagram = instagramEnabled
              const hasWhatsApp = whatsappDistEnabled
              const hasAnyTarget = hasFacebook || hasInstagram || hasWhatsApp

              // Auto-correct platform tab
              const activePlatform = (schedulePlatformTab === 'facebook' && hasFacebook) ? 'facebook'
                : (schedulePlatformTab === 'instagram' && hasInstagram) ? 'instagram'
                : (schedulePlatformTab === 'whatsapp' && hasWhatsApp) ? 'whatsapp'
                : hasFacebook ? 'facebook' : hasInstagram ? 'instagram' : 'whatsapp'

              // Auto-correct FB sub-tab
              const activeFbSub = (fbScheduleSubTab === 'groups' && selectedGroups.length > 0) ? 'groups'
                : (fbScheduleSubTab === 'profile' && publishToProfile) ? 'profile'
                : selectedGroups.length > 0 ? 'groups' : 'profile'

              return (
              <div className="cp-step-panel">

                {!hasAnyTarget && (
                  <div className="cp-card">
                    <div className="cp-card-header"><h3>מתי לפרסם?</h3></div>
                    <div className="schedule-info">
                      <p className="schedule-info-text">לא נבחרו יעדי פרסום. חזרו לשלב התפוצה.</p>
                    </div>
                  </div>
                )}

                {hasAnyTarget && (
                <div className="cp-card">
                  <div className="cp-card-header"><h3>מתי לפרסם?</h3></div>

                  <div className="cp-schedule-hint-bubble">
                    בחרו את התזמון לכל פלטפורמה בנפרד: מיידי, חד-פעמי או חוזר.
                  </div>

                  {/* ─── Level 1: Platform tabs ─── */}
                  <div className="cp-schedule-sub-tabs">
                    {hasFacebook && (
                      <button type="button"
                        className={`cp-schedule-sub-tab ${activePlatform === 'facebook' ? 'active' : ''}`}
                        onClick={() => setSchedulePlatformTab('facebook')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        <span>Facebook</span>
                      </button>
                    )}
                    {hasInstagram && (
                      <button type="button"
                        className={`cp-schedule-sub-tab cp-schedule-sub-tab-ig ${activePlatform === 'instagram' ? 'active' : ''}`}
                        onClick={() => setSchedulePlatformTab('instagram')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="url(#ig-sched-grad)">
                          <defs>
                            <linearGradient id="ig-sched-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#FFDC80" />
                              <stop offset="50%" stopColor="#E1306C" />
                              <stop offset="100%" stopColor="#833AB4" />
                            </linearGradient>
                          </defs>
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                        </svg>
                        <span>Instagram</span>
                      </button>
                    )}
                    {hasWhatsApp && (
                      <button type="button"
                        className={`cp-schedule-sub-tab cp-schedule-sub-tab-wa ${activePlatform === 'whatsapp' ? 'active' : ''}`}
                        onClick={() => setSchedulePlatformTab('whatsapp')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        <span>WhatsApp</span>
                      </button>
                    )}
                  </div>

                  {/* ═══ Facebook panel ═══ */}
                  {activePlatform === 'facebook' && (
                    <>
                      {/* Level 2: Facebook sub-tabs (only if both groups & profile) */}
                      {selectedGroups.length > 0 && publishToProfile && (
                        <div className="cp-schedule-sub-tabs cp-schedule-sub-tabs-inner">
                          <button type="button"
                            className={`cp-schedule-sub-tab ${activeFbSub === 'groups' ? 'active' : ''}`}
                            onClick={() => setFbScheduleSubTab('groups')}>
                            <span>קבוצות ({selectedGroups.length})</span>
                            {scheduleMode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                          </button>
                          <button type="button"
                            className={`cp-schedule-sub-tab ${activeFbSub === 'profile' ? 'active' : ''}`}
                            onClick={() => setFbScheduleSubTab('profile')}>
                            <span>פרופיל</span>
                            {profileScheduleMode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                          </button>
                        </div>
                      )}

                      {/* Groups Scheduler */}
                      {activeFbSub === 'groups' && (
                    <div className="cp-schedule">
                      <div className="schedule-tabs">
                        <button type="button" className={`schedule-tab ${scheduleMode === 'now' ? 'active' : ''}`} onClick={() => setScheduleMode('now')}>
                          <span className="schedule-tab-icon">⚡</span>
                          <span>עכשיו</span>
                        </button>
                        <button type="button" className={`schedule-tab ${scheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => { setScheduleMode('scheduled'); setRecurringDays([]); setDayTimes({}); setRecurringStartDate(''); setRecurringEndDate('') }}>
                          <span className="schedule-tab-icon">📅</span>
                          <span>חד-פעמי</span>
                        </button>
                        <button type="button" className={`schedule-tab ${scheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => { setScheduleMode('recurring'); setScheduleDate(''); setScheduleTime('') }}>
                          <span className="schedule-tab-icon">🔄</span>
                          <span>חוזר</span>
                        </button>
                      </div>

                      {scheduleMode === 'now' && (
                        <div className="schedule-info">
                          <p className="schedule-info-text">יפורסם מיד בלחיצה על פרסום</p>
                        </div>
                      )}

                      {scheduleMode !== 'now' && (
                        <OptimalTimesHint
                          onSelectTime={(time) => {
                            if (scheduleMode === 'scheduled') setScheduleTime(time)
                          }}
                          onSelectDay={(dayNum) => {
                            if (scheduleMode === 'recurring' && !recurringDays.includes(dayNum)) {
                              setRecurringDays(prev => [...prev, dayNum])
                            }
                          }}
                        />
                      )}

                      {scheduleMode === 'scheduled' && (
                        <div className="schedule-fields">
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
                              📅 {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה {scheduleTime}
                            </div>
                          )}
                        </div>
                      )}

                      {scheduleMode === 'recurring' && (
                        <div className="schedule-fields">
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
                                <button key={i} type="button" className={`day-btn ${recurringDays.includes(i) ? 'active' : ''}`}
                                  onClick={() => {
                                    setRecurringDays(prev => {
                                      if (prev.includes(i)) {
                                        setDayTimes(dt => { const copy = { ...dt }; delete copy[i]; return copy })
                                        return prev.filter(d => d !== i)
                                      } else {
                                        setDayTimes(dt => ({ ...dt, [i]: [''] }))
                                        return [...prev, i]
                                      }
                                    })
                                  }}>{day}</button>
                              ))}
                              <button type="button" className={`day-btn day-btn-all ${recurringDays.length === 7 ? 'active' : ''}`}
                                onClick={() => {
                                  if (recurringDays.length === 7) { setRecurringDays([]); setDayTimes({}) }
                                  else { setRecurringDays([0,1,2,3,4,5,6]); setDayTimes(dt => { const c = {...dt}; for(let i=0;i<7;i++){if(!c[i])c[i]=['']} return c }) }
                                }}>כל יום</button>
                            </div>
                          </div>
                          {recurringDays.length > 0 && (
                            <div className="schedule-section day-times-section">
                              <label className="schedule-section-label">שעות לכל יום</label>
                              <div className="day-times-list">
                                {recurringDays.sort((a,b)=>a-b).map(dayIdx => {
                                  const dayName = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][dayIdx]
                                  const times = dayTimes[dayIdx] || ['']
                                  return (
                                    <div key={dayIdx} className="day-times-card">
                                      <div className="day-times-header">
                                        <span className="day-times-day-name">יום {dayName}</span>
                                        <span className="day-times-count">{times.filter(t=>t).length} שעות</span>
                                      </div>
                                      <div className="day-times-slots">
                                        {times.map((time,ti) => (
                                          <div key={ti} className="time-slot">
                                            <input type="time" value={time} onChange={(e) => { setDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||[''])]; c[dayIdx][ti]=e.target.value; return c }) }} aria-label={`שעה ${ti + 1} ליום ${dayName}`} />
                                            {times.length > 1 && <button type="button" className="time-remove-btn" onClick={() => { setDayTimes(dt => { const c={...dt}; c[dayIdx]=c[dayIdx].filter((_,idx)=>idx!==ti); return c }) }} aria-label={`הסר שעה ${ti + 1} מיום ${dayName}`}>✕</button>}
                                          </div>
                                        ))}
                                        {times.length < 5 && <button type="button" className="time-add-btn" onClick={() => { setDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||['']),''] ; return c }) }}>+ שעה</button>}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {recurringDays.length > 0 && Object.values(dayTimes).some(ts => ts.some(t => t)) && recurringStartDate && (
                            <div className="schedule-summary">
                              🔄 {recurringDays.sort((a,b)=>a-b).map(d => { const n=['א','ב','ג','ד','ה','ו','ש'][d]; const ts=(dayTimes[d]||[]).filter(t=>t); return ts.length?`${n}: ${ts.join(', ')}`:null }).filter(Boolean).join(' | ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ Profile Scheduler ═══ */}
                  {activeFbSub === 'profile' && (
                    <div className="cp-schedule">
                      <div className="schedule-tabs">
                        <button type="button" className={`schedule-tab ${profileScheduleMode === 'now' ? 'active' : ''}`} onClick={() => setProfileScheduleMode('now')}>
                          <span className="schedule-tab-icon">⚡</span>
                          <span>עכשיו</span>
                        </button>
                        <button type="button" className={`schedule-tab ${profileScheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => { setProfileScheduleMode('scheduled'); setProfileRecurringDays([]); setProfileDayTimes({}) }}>
                          <span className="schedule-tab-icon">📅</span>
                          <span>חד-פעמי</span>
                        </button>
                        <button type="button" className={`schedule-tab ${profileScheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => { setProfileScheduleMode('recurring'); setProfileScheduleDate(''); setProfileScheduleTime('') }}>
                          <span className="schedule-tab-icon">🔄</span>
                          <span>חוזר</span>
                        </button>
                      </div>

                      {profileScheduleMode === 'now' && (
                        <div className="schedule-info">
                          <p className="schedule-info-text">יפורסם בפרופיל מיד עם יצירת הקמפיין</p>
                        </div>
                      )}

                      {profileScheduleMode === 'scheduled' && (
                        <div className="schedule-fields">
                          <div className="schedule-row-centered">
                            <div className="schedule-field">
                              <label>תאריך</label>
                              <SingleDatePicker
                                value={profileScheduleDate}
                                onChange={setProfileScheduleDate}
                                minDate={toDateStr(new Date())}
                              />
                            </div>
                            <div className="schedule-field schedule-field-time-wrap">
                              <label>שעה</label>
                              <input
                                type="time"
                                value={profileScheduleTime}
                                onChange={(e) => setProfileScheduleTime(e.target.value)}
                                disabled={!profileScheduleDate}
                                className={!profileScheduleDate ? 'disabled-input' : ''}
                              />
                            </div>
                          </div>
                          {profileScheduleDate && profileScheduleTime && (
                            <div className="schedule-summary">
                              📅 {new Date(`${profileScheduleDate}T${profileScheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה {profileScheduleTime}
                            </div>
                          )}
                        </div>
                      )}

                      {profileScheduleMode === 'recurring' && (
                        <div className="schedule-fields">
                          <div className="schedule-section">
                            <label className="schedule-section-label">תקופה</label>
                            <RecurringDateRange
                              startDate={profileRecurringStartDate}
                              endDate={profileRecurringEndDate}
                              onStartChange={setProfileRecurringStartDate}
                              onEndChange={setProfileRecurringEndDate}
                              minDate={toDateStr(new Date())}
                              initialMonth={profileRecurringStartDate ? new Date(profileRecurringStartDate) : new Date()}
                            />
                          </div>
                          <div className="schedule-section">
                            <label className="schedule-section-label">באילו ימים?</label>
                            <div className="days-grid">
                              {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((day,i) => (
                                <button key={i} type="button" className={`day-btn ${profileRecurringDays.includes(i)?'active':''}`}
                                  onClick={() => {
                                    setProfileRecurringDays(prev => {
                                      if(prev.includes(i)){setProfileDayTimes(dt=>{const c={...dt};delete c[i];return c});return prev.filter(d=>d!==i)}
                                      else{setProfileDayTimes(dt=>({...dt,[i]:['']}));return[...prev,i]}
                                    })
                                  }}>{day}</button>
                              ))}
                              <button type="button" className={`day-btn day-btn-all ${profileRecurringDays.length===7?'active':''}`}
                                onClick={() => {
                                  if(profileRecurringDays.length===7){setProfileRecurringDays([]);setProfileDayTimes({})}
                                  else{setProfileRecurringDays([0,1,2,3,4,5,6]);setProfileDayTimes(dt=>{const c={...dt};for(let i=0;i<7;i++){if(!c[i])c[i]=['']}return c})}
                                }}>כל יום</button>
                            </div>
                          </div>
                          {profileRecurringDays.length > 0 && (
                            <div className="schedule-section day-times-section">
                              <label className="schedule-section-label">שעות לכל יום</label>
                              <div className="day-times-list">
                                {profileRecurringDays.sort((a,b)=>a-b).map(dayIdx => {
                                  const dayName = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][dayIdx]
                                  const times = profileDayTimes[dayIdx] || ['']
                                  return (
                                    <div key={dayIdx} className="day-times-card">
                                      <div className="day-times-header">
                                        <span className="day-times-day-name">יום {dayName}</span>
                                        <span className="day-times-count">{times.filter(t=>t).length} שעות</span>
                                      </div>
                                      <div className="day-times-slots">
                                        {times.map((time,ti) => (
                                          <div key={ti} className="time-slot">
                                            <input type="time" value={time} onChange={(e) => { setProfileDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||[''])]; c[dayIdx][ti]=e.target.value; return c }) }} aria-label={`שעה ${ti + 1} לפרופיל ביום ${dayName}`} />
                                            {times.length>1 && <button type="button" className="time-remove-btn" onClick={() => { setProfileDayTimes(dt => { const c={...dt}; c[dayIdx]=c[dayIdx].filter((_,idx)=>idx!==ti); return c }) }} aria-label={`הסר שעה ${ti + 1} מפרופיל ביום ${dayName}`}>✕</button>}
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
                  </>
                  )}

                  {/* ═══ Instagram panel ═══ */}
                  {activePlatform === 'instagram' && (
                    <>
                      {/* Level 2: IG type sub-tabs */}
                      {instagramPublishTypes.length > 1 && (
                        <div className="cp-schedule-sub-tabs cp-schedule-sub-tabs-inner">
                          {instagramPublishTypes.includes('FEED') && (
                            <button type="button"
                              className={`cp-schedule-sub-tab cp-schedule-sub-tab-ig ${igScheduleSubTab === 'FEED' ? 'active' : ''}`}
                              onClick={() => setIgScheduleSubTab('FEED')}>
                              📷 פוסט
                              {igTypeSchedules.FEED?.mode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                            </button>
                          )}
                          {instagramPublishTypes.includes('STORY') && (
                            <button type="button"
                              className={`cp-schedule-sub-tab cp-schedule-sub-tab-ig ${igScheduleSubTab === 'STORY' ? 'active' : ''}`}
                              onClick={() => setIgScheduleSubTab('STORY')}>
                              📱 סטורי
                              {igTypeSchedules.STORY?.mode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                            </button>
                          )}
                          {instagramPublishTypes.includes('REEL') && (
                            <button type="button"
                              className={`cp-schedule-sub-tab cp-schedule-sub-tab-ig ${igScheduleSubTab === 'REEL' ? 'active' : ''}`}
                              onClick={() => setIgScheduleSubTab('REEL')}>
                              🎬 ריל
                              {igTypeSchedules.REEL?.mode !== 'now' && <span className="cp-schedule-sub-tab-badge">📅</span>}
                            </button>
                          )}
                        </div>
                      )}

                      {igScheduleSubTab === 'STORY' && (
                        <div className="cp-ig-hint" style={{ marginBottom: 12 }}>
                          <span>💡</span>
                          <span>סטורי נעלם אחרי 24 שעות מרגע הפרסום</span>
                        </div>
                      )}

                    {(() => {
                      const activeIgType = instagramPublishTypes.includes(igScheduleSubTab) ? igScheduleSubTab : instagramPublishTypes[0]
                      const ts = igTypeSchedules[activeIgType] || { mode: 'now', date: '', time: '', recurringDays: [], dayTimes: {}, startDate: '', endDate: '' }
                      const updateTs = (field, value) => setIgTypeSchedules(prev => ({ ...prev, [activeIgType]: { ...prev[activeIgType], [field]: value } }))
                      const updateTsMulti = (updates) => setIgTypeSchedules(prev => ({ ...prev, [activeIgType]: { ...prev[activeIgType], ...updates } }))
                      return (
                    <div className="cp-schedule">
                      <div className="schedule-tabs">
                        <button type="button" className={`schedule-tab ${ts.mode === 'now' ? 'active' : ''}`} onClick={() => updateTs('mode', 'now')}>
                          <span className="schedule-tab-icon">⚡</span>
                          <span>עכשיו</span>
                        </button>
                        <button type="button" className={`schedule-tab ${ts.mode === 'scheduled' ? 'active' : ''}`} onClick={() => updateTsMulti({ mode: 'scheduled', recurringDays: [], dayTimes: {} })}>
                          <span className="schedule-tab-icon">📅</span>
                          <span>חד-פעמי</span>
                        </button>
                        <button type="button" className={`schedule-tab ${ts.mode === 'recurring' ? 'active' : ''}`} onClick={() => updateTsMulti({ mode: 'recurring', date: '', time: '' })}>
                          <span className="schedule-tab-icon">🔄</span>
                          <span>חוזר</span>
                        </button>
                      </div>

                      {ts.mode === 'now' && (
                        <div className="schedule-info">
                          <p className="schedule-info-text">יפורסם באינסטגרם מיד עם יצירת הקמפיין</p>
                        </div>
                      )}

                      {ts.mode === 'scheduled' && (
                        <div className="schedule-fields">
                          <div className="schedule-row-centered">
                            <div className="schedule-field">
                              <label>תאריך</label>
                              <SingleDatePicker
                                value={ts.date}
                                onChange={(v) => updateTs('date', v)}
                                minDate={toDateStr(new Date())}
                              />
                            </div>
                            <div className="schedule-field schedule-field-time-wrap">
                              <label>שעה</label>
                              <input
                                type="time"
                                value={ts.time}
                                onChange={(e) => updateTs('time', e.target.value)}
                                disabled={!ts.date}
                                className={!ts.date ? 'disabled-input' : ''}
                              />
                            </div>
                          </div>
                          {ts.date && ts.time && (
                            <div className="schedule-summary">
                              📅 {new Date(`${ts.date}T${ts.time}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה {ts.time}
                            </div>
                          )}
                        </div>
                      )}

                      {ts.mode === 'recurring' && (
                        <div className="schedule-fields">
                          <div className="schedule-section">
                            <label className="schedule-section-label">תקופה</label>
                            <RecurringDateRange
                              startDate={ts.startDate}
                              endDate={ts.endDate}
                              onStartChange={(v) => updateTs('startDate', v)}
                              onEndChange={(v) => updateTs('endDate', v)}
                              minDate={toDateStr(new Date())}
                              initialMonth={ts.startDate ? new Date(ts.startDate) : new Date()}
                            />
                          </div>
                          <div className="schedule-section">
                            <label className="schedule-section-label">באילו ימים?</label>
                            <div className="days-grid">
                              {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((day,i) => (
                                <button key={i} type="button" className={`day-btn ${ts.recurringDays.includes(i)?'active':''}`}
                                  onClick={() => {
                                    setIgTypeSchedules(prev => {
                                      const cur = prev[activeIgType]
                                      const newDays = cur.recurringDays.includes(i) ? cur.recurringDays.filter(d => d !== i) : [...cur.recurringDays, i]
                                      const newDayTimes = { ...cur.dayTimes }
                                      if (cur.recurringDays.includes(i)) delete newDayTimes[i]
                                      else newDayTimes[i] = ['']
                                      return { ...prev, [activeIgType]: { ...cur, recurringDays: newDays, dayTimes: newDayTimes } }
                                    })
                                  }}>{day}</button>
                              ))}
                              <button type="button" className={`day-btn day-btn-all ${ts.recurringDays.length===7?'active':''}`}
                                onClick={() => {
                                  setIgTypeSchedules(prev => {
                                    const cur = prev[activeIgType]
                                    if (cur.recurringDays.length === 7) return { ...prev, [activeIgType]: { ...cur, recurringDays: [], dayTimes: {} } }
                                    const newDayTimes = { ...cur.dayTimes }; for(let j=0;j<7;j++){if(!newDayTimes[j])newDayTimes[j]=['']}
                                    return { ...prev, [activeIgType]: { ...cur, recurringDays: [0,1,2,3,4,5,6], dayTimes: newDayTimes } }
                                  })
                                }}>כל יום</button>
                            </div>
                          </div>
                          {ts.recurringDays.length > 0 && (
                            <div className="schedule-section day-times-section">
                              <label className="schedule-section-label">שעות לכל יום</label>
                              <div className="day-times-list">
                                {[...ts.recurringDays].sort((a,b)=>a-b).map(dayIdx => {
                                  const dayName = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][dayIdx]
                                  const times = ts.dayTimes[dayIdx] || ['']
                                  return (
                                    <div key={dayIdx} className="day-times-card">
                                      <div className="day-times-header">
                                        <span className="day-times-day-name">יום {dayName}</span>
                                        <span className="day-times-count">{times.filter(t=>t).length} שעות</span>
                                      </div>
                                      <div className="day-times-slots">
                                        {times.map((time,ti) => (
                                          <div key={ti} className="time-slot">
                                            <input type="time" value={time} aria-label={`שעה ${ti + 1} לאינסטגרם ביום ${dayName}`} onChange={(e) => {
                                              setIgTypeSchedules(prev => {
                                                const cur = prev[activeIgType]
                                                const newDayTimes = { ...cur.dayTimes, [dayIdx]: [...(cur.dayTimes[dayIdx] || [''])] }
                                                newDayTimes[dayIdx][ti] = e.target.value
                                                return { ...prev, [activeIgType]: { ...cur, dayTimes: newDayTimes } }
                                              })
                                            }} />
                                            {times.length>1 && <button type="button" className="time-remove-btn" aria-label={`הסר שעה ${ti + 1} מאינסטגרם ביום ${dayName}`} onClick={() => {
                                              setIgTypeSchedules(prev => {
                                                const cur = prev[activeIgType]
                                                const newDayTimes = { ...cur.dayTimes, [dayIdx]: cur.dayTimes[dayIdx].filter((_,idx)=>idx!==ti) }
                                                return { ...prev, [activeIgType]: { ...cur, dayTimes: newDayTimes } }
                                              })
                                            }}>✕</button>}
                                          </div>
                                        ))}
                                        {times.length<5 && <button type="button" className="time-add-btn" onClick={() => {
                                          setIgTypeSchedules(prev => {
                                            const cur = prev[activeIgType]
                                            const newDayTimes = { ...cur.dayTimes, [dayIdx]: [...(cur.dayTimes[dayIdx] || ['']), ''] }
                                            return { ...prev, [activeIgType]: { ...cur, dayTimes: newDayTimes } }
                                          })
                                        }}>+ שעה</button>}
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
                      )
                    })()}
                    </>
                  )}

                  {/* ═══ WhatsApp panel ═══ */}
                  {activePlatform === 'whatsapp' && (
                    <div className="cp-schedule">
                      <div className="schedule-tabs">
                        <button type="button" className={`schedule-tab ${waScheduleMode === 'now' ? 'active' : ''}`} onClick={() => setWaScheduleMode('now')}>
                          <span className="schedule-tab-icon">⚡</span>
                          <span>עכשיו</span>
                        </button>
                        <button type="button" className={`schedule-tab ${waScheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => { setWaScheduleMode('scheduled'); setWaRecurringDays([]); setWaDayTimes({}); setWaRecurringStartDate(''); setWaRecurringEndDate('') }}>
                          <span className="schedule-tab-icon">📅</span>
                          <span>חד-פעמי</span>
                        </button>
                        <button type="button" className={`schedule-tab ${waScheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => { setWaScheduleMode('recurring'); setWaScheduleDate(''); setWaScheduleTime('') }}>
                          <span className="schedule-tab-icon">🔄</span>
                          <span>חוזר</span>
                        </button>
                      </div>

                      {waScheduleMode === 'now' && (
                        <div className="schedule-info">
                          <p className="schedule-info-text">ישלח בוואטסאפ מיד עם יצירת הקמפיין</p>
                        </div>
                      )}

                      {waScheduleMode === 'scheduled' && (
                        <div className="schedule-fields">
                          <div className="schedule-row-centered">
                            <div className="schedule-field">
                              <label>תאריך</label>
                              <SingleDatePicker
                                value={waScheduleDate}
                                onChange={setWaScheduleDate}
                                minDate={toDateStr(new Date())}
                              />
                            </div>
                            <div className="schedule-field schedule-field-time-wrap">
                              <label>שעה</label>
                              <input
                                type="time"
                                value={waScheduleTime}
                                onChange={(e) => setWaScheduleTime(e.target.value)}
                                disabled={!waScheduleDate}
                                className={!waScheduleDate ? 'disabled-input' : ''}
                              />
                            </div>
                          </div>
                          {waScheduleDate && waScheduleTime && (
                            <div className="schedule-summary">
                              📅 {new Date(`${waScheduleDate}T${waScheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה {waScheduleTime}
                            </div>
                          )}
                        </div>
                      )}

                      {waScheduleMode === 'recurring' && (
                        <div className="schedule-fields">
                          <div className="schedule-section">
                            <label className="schedule-section-label">תקופה</label>
                            <RecurringDateRange
                              startDate={waRecurringStartDate}
                              endDate={waRecurringEndDate}
                              onStartChange={setWaRecurringStartDate}
                              onEndChange={setWaRecurringEndDate}
                              minDate={toDateStr(new Date())}
                              initialMonth={waRecurringStartDate ? new Date(waRecurringStartDate) : new Date()}
                            />
                          </div>
                          <div className="schedule-section">
                            <label className="schedule-section-label">באילו ימים?</label>
                            <div className="days-grid">
                              {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((day,i) => (
                                <button key={i} type="button" className={`day-btn ${waRecurringDays.includes(i)?'active':''}`}
                                  onClick={() => {
                                    setWaRecurringDays(prev => {
                                      if(prev.includes(i)){setWaDayTimes(dt=>{const c={...dt};delete c[i];return c});return prev.filter(d=>d!==i)}
                                      else{setWaDayTimes(dt=>({...dt,[i]:['']}));return[...prev,i]}
                                    })
                                  }}>{day}</button>
                              ))}
                              <button type="button" className={`day-btn day-btn-all ${waRecurringDays.length===7?'active':''}`}
                                onClick={() => {
                                  if(waRecurringDays.length===7){setWaRecurringDays([]);setWaDayTimes({})}
                                  else{setWaRecurringDays([0,1,2,3,4,5,6]);setWaDayTimes(dt=>{const c={...dt};for(let i=0;i<7;i++){if(!c[i])c[i]=['']}return c})}
                                }}>כל יום</button>
                            </div>
                          </div>
                          {waRecurringDays.length > 0 && (
                            <div className="schedule-section day-times-section">
                              <label className="schedule-section-label">שעות לכל יום</label>
                              <div className="day-times-list">
                                {waRecurringDays.sort((a,b)=>a-b).map(dayIdx => {
                                  const dayName = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][dayIdx]
                                  const times = waDayTimes[dayIdx] || ['']
                                  return (
                                    <div key={dayIdx} className="day-times-card">
                                      <div className="day-times-header">
                                        <span className="day-times-day-name">יום {dayName}</span>
                                        <span className="day-times-count">{times.filter(t=>t).length} שעות</span>
                                      </div>
                                      <div className="day-times-slots">
                                        {times.map((time,ti) => (
                                          <div key={ti} className="time-slot">
                                            <input type="time" value={time} onChange={(e) => { setWaDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||[''])]; c[dayIdx][ti]=e.target.value; return c }) }} aria-label={`שעה ${ti + 1} לוואטסאפ ביום ${dayName}`} />
                                            {times.length>1 && <button type="button" className="time-remove-btn" onClick={() => { setWaDayTimes(dt => { const c={...dt}; c[dayIdx]=c[dayIdx].filter((_,idx)=>idx!==ti); return c }) }} aria-label={`הסר שעה ${ti + 1} מוואטסאפ ביום ${dayName}`}>✕</button>}
                                          </div>
                                        ))}
                                        {times.length<5 && <button type="button" className="time-add-btn" onClick={() => { setWaDayTimes(dt => { const c={...dt}; c[dayIdx]=[...(c[dayIdx]||['']),''] ; return c }) }}>+ שעה</button>}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {waRecurringDays.length > 0 && Object.values(waDayTimes).some(ts => Array.isArray(ts) && ts.some(t => t)) && waRecurringStartDate && (
                            <div className="schedule-summary">
                              🔄 {waRecurringDays.sort((a,b)=>a-b).map(d => { const n=['א','ב','ג','ד','ה','ו','ש'][d]; const ts=(waDayTimes[d]||[]).filter(t=>t); return ts.length?`${n}: ${ts.join(', ')}`:null }).filter(Boolean).join(' | ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>
                )}
              </div>
              )
            })()}

            {/* STEP 3: Review */}
            {currentStep === 3 && (
              <div className="cp-step-panel">
                <div className="cp-card cp-review-card">
                  <div className="cp-card-header">
                    <h3>סיכום לפני פרסום</h3>
                  </div>
                  <div className="cp-review">
                    <div className="cp-review-section">
                      <span className="cp-review-label">תוכן:</span>
                      <p className="cp-review-text">{postText.length > 120 ? postText.slice(0, 120) + '...' : postText}</p>
                      {campaignTitle && <span className="cp-review-meta">כותרת: {campaignTitle}</span>}
                    </div>

                    {postImagePreviews.length > 0 && (
                      <div className="cp-review-section">
                        <span className="cp-review-label">תמונות:</span>
                        <div className="cp-review-images">
                          {postImagePreviews.map((p, i) => <img key={i} src={p} alt="" />)}
                        </div>
                      </div>
                    )}

                    <div className="cp-review-section">
                      <span className="cp-review-label">יעדי פרסום:</span>
                      <div className="cp-review-groups">
                        {publishToProfile && <span className="cp-review-chip cp-chip-profile">👤 פרופיל אישי</span>}
                        {selectedGroups.length > 0 && <span className="cp-review-chip cp-chip-profile">Facebook · {selectedGroups.length} קבוצות</span>}
                        {selectedGroups.slice(0, 5).map(g => (
                          <span key={g.id} className="cp-review-chip">👥 {g.name}</span>
                        ))}
                        {selectedGroups.length > 5 && <span className="cp-review-chip cp-chip-more">+{selectedGroups.length - 5} נוספות</span>}
                        {instagramEnabled && instagramPublishTypes.map(type => (
                          <span className="cp-review-chip cp-chip-instagram" key={type}>
                            📸 Instagram · {type === 'FEED' ? 'פוסט' : type === 'STORY' ? 'סטורי' : 'רילס'}
                            {type === 'STORY' && postImagePreviews.length > 1 && storyMediaMode === 'all' && ` (${postImagePreviews.length})`}
                            {type === 'STORY' && storyMediaMode === 'pick' && ` (תמונה ${storyPickedIndex + 1})`}
                          </span>
                        ))}
                        {whatsappDistEnabled && (
                          <span className="cp-review-chip cp-chip-whatsapp">
                            💬 WhatsApp — {selectedWaTargets.length} יעדים
                          </span>
                        )}
                        {!publishToProfile && selectedGroups.length === 0 && !instagramEnabled && !whatsappDistEnabled && <span className="cp-review-value">לא נבחרו יעדים</span>}
                      </div>
                    </div>

                    <div className="cp-review-section">
                      <span className="cp-review-label">תזמון:</span>
                      <div className="cp-review-schedule-list">
                        {selectedGroups.length > 0 && (
                          <div className="cp-review-schedule-item">
                            <span className="cp-review-schedule-platform">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                              {' '}קבוצות:
                            </span>
                            <span>
                              {scheduleMode === 'now' && '⚡ מיידי'}
                              {scheduleMode === 'scheduled' && `📅 ${scheduleDate && scheduleTime ? new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' ' + scheduleTime : 'לא הוגדר'}`}
                              {scheduleMode === 'recurring' && `🔄 ${recurringDays.length} ימים בשבוע`}
                            </span>
                          </div>
                        )}
                        {publishToProfile && (
                          <div className="cp-review-schedule-item">
                            <span className="cp-review-schedule-platform">👤 פרופיל:</span>
                            <span>
                              {profileScheduleMode === 'now' && '⚡ מיידי'}
                              {profileScheduleMode === 'scheduled' && `📅 ${profileScheduleDate && profileScheduleTime ? new Date(`${profileScheduleDate}T${profileScheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' ' + profileScheduleTime : 'לא הוגדר'}`}
                              {profileScheduleMode === 'recurring' && `🔄 ${profileRecurringDays.length} ימים בשבוע`}
                            </span>
                          </div>
                        )}
                        {instagramEnabled && instagramPublishTypes.map(type => {
                          const typeLabel = type === 'FEED' ? 'פוסט' : type === 'STORY' ? 'סטורי' : 'רילס'
                          const typeSchedule = igTypeSchedules[type] || { mode: 'now', recurringDays: [] }
                          return (
                            <div className="cp-review-schedule-item" key={type}>
                              <span className="cp-review-schedule-platform">📸 Instagram {typeLabel}:</span>
                              <span>
                                {typeSchedule.mode === 'now' && '⚡ מיידי'}
                                {typeSchedule.mode === 'scheduled' && `📅 ${typeSchedule.date && typeSchedule.time ? new Date(`${typeSchedule.date}T${typeSchedule.time}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' ' + typeSchedule.time : 'לא הוגדר'}`}
                                {typeSchedule.mode === 'recurring' && `🔄 ${(typeSchedule.recurringDays || []).length} ימים בשבוע`}
                              </span>
                            </div>
                          )
                        })}
                        {whatsappDistEnabled && (
                          <div className="cp-review-schedule-item">
                            <span className="cp-review-schedule-platform">💬 WhatsApp:</span>
                            <span>
                              {waScheduleMode === 'now' && '⚡ מיידי'}
                              {waScheduleMode === 'scheduled' && `📅 ${waScheduleDate && waScheduleTime ? new Date(`${waScheduleDate}T${waScheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' ' + waScheduleTime : 'לא הוגדר'}`}
                              {waScheduleMode === 'recurring' && `🔄 ${waRecurringDays.length} ימים בשבוע`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>



                    {isAnonymous && (
                      <div className="cp-review-section">
                        <span className="cp-review-label">מצב:</span>
                        <span className="cp-review-value">🕶️ פרסום אנונימי</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && <div className="cp-error">{error}</div>}

          {/* Navigation buttons */}
          <div className="cp-wizard-nav">
            <div className="cp-nav-spacer" />

            <button
              type="button"
              className="cp-preview-btn-mobile"
              onClick={() => setShowMobilePreview(true)}
            >
              👁️ תצוגה מקדימה
            </button>

            {currentStep < steps.length - 1 ? (
              <button type="button" className="cp-nav-btn cp-nav-next" onClick={goNext}>
                הבא ←
              </button>
            ) : (
              <button
                type="button"
                className="cp-publish-btn"
                onClick={handlePublish}
                disabled={publishing}
              >
                <span className="cp-publish-full">
                  {(() => {
                    const targets = []
                    if (selectedGroups.length > 0) targets.push(`${selectedGroups.length} קבוצות`)
                    if (publishToProfile) targets.push('פרופיל')
                    if (instagramEnabled) targets.push('Instagram')
                    if (whatsappDistEnabled) targets.push('WhatsApp')
                    const targetStr = targets.join(' + ')

                    if (publishing) return `⏳ מפרסם ${targetStr ? `ב-${targetStr}` : ''}...`
                    if (scheduleMode === 'recurring') return `🔄 תזמן חוזר ${targetStr ? `ב-${targetStr}` : ''}`
                    if (scheduleMode === 'scheduled') return `📅 תזמן ${targetStr ? `ב-${targetStr}` : ''}`
                    return `🚀 פרסם ${targetStr ? `ב-${targetStr}` : ''}`
                  })()}
                </span>
                <span className="cp-publish-short">{publishing ? '⏳' : '🚀 פרסם'}</span>
              </button>
            )}
          </div>
        </div>
        </div>

        {showMobilePreview && (
          <div className="fbp-modal-overlay" onClick={() => setShowMobilePreview(false)}>
            <div
              className="fbp-modal-content"
              role="dialog"
              aria-modal="true"
              aria-label="תצוגה מקדימה"
              onClick={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div className="fbp-modal-toolbar">
                <div>
                  <strong>תצוגה מקדימה</strong>
                  <span>כך הקמפיין ייראה בפלטפורמה</span>
                </div>
                <button className="fbp-modal-close" onClick={() => setShowMobilePreview(false)} aria-label="סגור תצוגה מקדימה">✕</button>
              </div>
              <div className="cp-preview-toggle cp-preview-toggle-mobile">
                <button
                  type="button"
                  className={`cp-preview-toggle-btn cp-toggle-fb ${previewMode === 'facebook' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('facebook')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  FB
                </button>
                <button
                  type="button"
                  className={`cp-preview-toggle-btn cp-toggle-ig ${previewMode.startsWith('ig-') ? 'active' : ''}`}
                  onClick={() => setPreviewMode(prev => prev.startsWith('ig-') ? prev : 'ig-feed')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  IG
                </button>
                <button
                  type="button"
                  className={`cp-preview-toggle-btn cp-toggle-wa ${previewMode === 'whatsapp' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('whatsapp')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WA
                </button>
              </div>
              {previewMode.startsWith('ig-') && (
                <div className="cp-preview-sub-toggle cp-preview-sub-toggle-mobile">
                  <button type="button" className={`cp-preview-sub-btn ${previewMode === 'ig-feed' ? 'active' : ''}`} onClick={() => setPreviewMode('ig-feed')}>🖼️ פוסט</button>
                  <button type="button" className={`cp-preview-sub-btn ${previewMode === 'ig-story' ? 'active' : ''}`} onClick={() => setPreviewMode('ig-story')}>⏱️ סטורי</button>
                  <button type="button" className={`cp-preview-sub-btn ${previewMode === 'ig-reel' ? 'active' : ''}`} onClick={() => setPreviewMode('ig-reel')}>🎬 רילס</button>
                </div>
              )}
              <div className="fbp-modal-stage">
              {previewMode === 'facebook' ? (
                <FacebookPreview
                  text={postText}
                  images={postImagePreviews}
                  groupName={selectedGroups[0]?.name}
                  userName={user?.name}
                  whatsappNumber={showWhatsapp ? whatsappNumber : ''}
                  isAnonymous={isAnonymous}
                />
              ) : previewMode === 'whatsapp' ? (
                <WhatsAppPreview
                  text={postText}
                  images={postImagePreviews}
                  userName={user?.name}
                  targetName={selectedWaTargets[0]?.name}
                />
              ) : (
                <InstagramPreview
                  text={postText}
                  images={postImagePreviews}
                  userName={user?.name}
                  mode={previewMode === 'ig-story' ? 'STORY' : previewMode === 'ig-reel' ? 'REEL' : 'FEED'}
                />
              )}
              </div>
            </div>
          </div>
        )}
      </>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText="כן"
        cancelText="ביטול"
        onConfirm={() => { const action = confirmAction?.action; setConfirmAction(null); action?.() }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
