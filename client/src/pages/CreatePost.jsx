import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { groupsService } from '../services/groupsService'
import { publishService } from '../services/publishService'
import { authAPI } from '../services/api'
import confetti from 'canvas-confetti'
import LocationAutocomplete from '../components/LocationAutocomplete'
import FacebookPreview from '../components/FacebookPreview'
import ConfirmDialog from '../components/ConfirmDialog'
import '../styles/create-post.css'

export default function CreatePost() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, authChecked, groups: cachedGroups, forceRefresh } = useAppData()

  const preSelectedGroup = location.state?.group || null
  const republishData = location.state?.republish || null

  const [campaignTitle, setCampaignTitle] = useState(republishData?.title || '')
  const [postText, setPostText] = useState(republishData?.content || '')
  const [postImages, setPostImages] = useState([])
  const [postImagePreviews, setPostImagePreviews] = useState([])
  const [isAnonymous, setIsAnonymous] = useState(republishData?.isAnonymous || false)
  const [postLocation, setPostLocation] = useState(republishData?.location || '')
  const [showLocationInput, setShowLocationInput] = useState(!!republishData?.location)
  const [whatsappNumber, setWhatsappNumber] = useState(user?.whatsappNumber || '')
  const [whatsappMessage, setWhatsappMessage] = useState(user?.whatsappMessage || '')
  const [showWhatsapp, setShowWhatsapp] = useState(false)
  const [waLinking, setWaLinking] = useState(false) // inline linking mode
  const [waTempNumber, setWaTempNumber] = useState('')
  const [waTempMessage, setWaTempMessage] = useState('')
  const [waSaving, setWaSaving] = useState(false)

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState('now') // 'now' | 'scheduled' | 'recurring'
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [recurringDays, setRecurringDays] = useState([])
  const [recurringTime, setRecurringTime] = useState('')
  const [recurringStartDate, setRecurringStartDate] = useState('')
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [dayTimes, setDayTimes] = useState({}) // { 0: ['10:00'], 2: ['16:00','17:00'] }

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
  const [loadingGroups, setLoadingGroups] = useState(!cachedGroups?.length)
  const [groupSearch, setGroupSearch] = useState('')

  // Publishing
  const [publishing, setPublishing] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [showMobilePreview, setShowMobilePreview] = useState(false)

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

  // Load recent drafts/history for restore panel
  useEffect(() => {
    if (user && !republishData) loadRecentCampaigns()
  }, [user])

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

    const waLink = whatsappNumber.trim()
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
        }, postImages)
        if (res.data.success) {
          setResults([{
            group: `${selectedGroups.length} קבוצות`,
            success: true,
            postUrl: null,
            scheduled: true,
          }])
          forceRefresh()
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
        } else {
          setError(res.data.error || 'שגיאה ביצירת הקמפיין')
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message)
      } finally {
        setPublishing(false)
      }
      return
    }

    // Immediate publish — fire requests and navigate to dashboard
    const finalText = waLink
      ? `${postText}\n\n${waLink}`
      : postText

    setPublishing(false)

    const groupsCopy = [...selectedGroups]
    const groupCount = groupsCopy.length

    // Navigate immediately — let user continue browsing
    window.dispatchEvent(new CustomEvent('postit-publish-start', { detail: { count: groupCount } }))
    navigate('/dashboard')

    // Fire publish in background
    const publishResults = []
    const promises = groupsCopy.map(async (group) => {
      try {
        const groupUrl = group.url || `https://www.facebook.com/groups/${group.externalId}`
        await publishService.publish(
          groupUrl,
          finalText,
          postImages,
          group.name,
          isAnonymous,
          postLocation,
          campaignTitle
        )
        publishResults.push({ group: group.name, success: true })
      } catch (err) {
        publishResults.push({ group: group.name, success: false })
      }
    })

    Promise.all(promises).then(() => {
      forceRefresh()
      const allSuccess = publishResults.length > 0 && publishResults.every(r => r.success)
      // Dispatch custom event for dashboard to pick up
      window.dispatchEvent(new CustomEvent('postit-publish-done', {
        detail: { allSuccess, total: publishResults.length, failed: publishResults.filter(r => !r.success).length }
      }))
    })
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
          const waLink = whatsappNumber.trim()
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
          }, postImages)
          forceRefresh()
          navigate('/dashboard', { state: { toast: 'נשמר כטיוטה ✓' } })
        } catch (err) {
          setError(err.response?.data?.error || 'שגיאה בשמירה')
        } finally {
          setSavingDraft(false)
        }
      }
    })
  }

  const handleExitWizard = () => {
    // If already published/scheduled successfully, just go back
    if (results && results.some(r => r.success)) {
      navigate('/dashboard')
      return
    }
    if (postText.trim() || selectedGroups.length > 0) {
      setConfirmAction({
        title: 'יציאה מיצירת קמפיין',
        message: 'האם אתה בטוח שברצונך לצאת? השינויים שלך לא יישמרו.',
        action: () => navigate('/dashboard'),
      })
    } else {
      navigate('/dashboard')
    }
  }

  // ─── Restore / Continue from draft ─────────────────────
  const [showRestore, setShowRestore] = useState(false)
  const [recentDrafts, setRecentDrafts] = useState([])
  const [recentHistory, setRecentHistory] = useState([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [showMoreHistory, setShowMoreHistory] = useState(false)

  const loadRecentCampaigns = async () => {
    setLoadingRecent(true)
    try {
      const res = await groupsService.getRecentCampaigns()
      if (res.data.success) {
        setRecentDrafts(res.data.drafts || [])
        setRecentHistory(res.data.history || [])
      }
    } catch { /* silent */ }
    finally { setLoadingRecent(false) }
  }

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
    const content = draft.content?.replace(/\n\nhttps:\/\/wa\.me\/[^\s]*/g, '') || ''
    setPostText(content)
    setCampaignTitle(draft.title || '')
    setIsAnonymous(draft.isAnonymous || false)
    setPostLocation(draft.location || '')
    setShowLocationInput(!!draft.location)

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

    // Restore schedule
    if (draft.scheduleMode === 'recurring') {
      setScheduleMode('recurring')
      setRecurringDays(draft.recurringDays || [])
      if (draft.dayTimes) setDayTimes(draft.dayTimes)
      if (draft.recurringStart) setRecurringStartDate(new Date(draft.recurringStart).toISOString().split('T')[0])
      if (draft.recurringEnd) setRecurringEndDate(new Date(draft.recurringEnd).toISOString().split('T')[0])
    } else if (draft.scheduleMode === 'scheduled') {
      setScheduleMode('scheduled')
    }

    setShowRestore(false)

    // Jump to the last step the user was working on
    setTimeout(() => {
      if (draft.scheduleMode && draft.scheduleMode !== 'now' && (draft.recurringDays?.length > 0 || draft.scheduleMode === 'scheduled')) {
        setCurrentStep(3) // Was on review
      } else if (draft.groupCount > 0) {
        setCurrentStep(2) // Was on schedule
      } else if (content.trim()) {
        setCurrentStep(1) // Was on groups
      } else {
        setCurrentStep(0) // Was on content
      }
    }, 100)
  }

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  )

  const [groupsOpen, setGroupsOpen] = useState(false)
  const groupsPanelRef = useRef(null)

  // Multi-step wizard
  const [currentStep, setCurrentStep] = useState(0)
  const [stepErrors, setStepErrors] = useState({}) // { 0: 'msg', 1: 'msg' }

  // Clear errors automatically when user fixes the issue
  useEffect(() => {
    if (Object.keys(stepErrors).length === 0) return
    const newErrors = { ...stepErrors }
    if (newErrors[0] && postText.trim()) { delete newErrors[0] }
    if (newErrors[1] && selectedGroups.length > 0) { delete newErrors[1] }
    if (newErrors[2]) {
      if (scheduleMode === 'now') { delete newErrors[2] }
      else if (scheduleMode === 'scheduled' && scheduleDate && scheduleTime) { delete newErrors[2] }
      else if (scheduleMode === 'recurring' && recurringDays.length > 0 && recurringDays.some(d => dayTimes[d]?.some(t => t.trim())) && recurringStartDate) { delete newErrors[2] }
    }
    if (JSON.stringify(newErrors) !== JSON.stringify(stepErrors)) {
      setStepErrors(newErrors)
      if (Object.keys(newErrors).length === 0) setError(null)
    }
  }, [postText, selectedGroups, scheduleMode, scheduleDate, scheduleTime, recurringDays, dayTimes, recurringStartDate])

  const steps = [
    { id: 'content', label: 'תוכן', icon: '✏️' },
    { id: 'groups', label: 'קבוצות', icon: '👥' },
    { id: 'schedule', label: 'תזמון', icon: '⏰' },
    { id: 'review', label: 'סיכום', icon: '🚀' },
  ]

  const validateStep = (step) => {
    const errors = {}
    if (step >= 0) {
      if (!postText.trim()) errors[0] = 'יש לכתוב טקסט לפוסט'
    }
    if (step >= 1) {
      if (selectedGroups.length === 0) errors[1] = 'יש לבחור לפחות קבוצה אחת'
    }
    if (step >= 2) {
      if (scheduleMode === 'scheduled') {
        if (!scheduleDate || !scheduleTime) errors[2] = 'יש לבחור תאריך ושעה'
        else if (new Date(`${scheduleDate}T${scheduleTime}`) <= new Date()) errors[2] = 'תאריך חייב להיות בעתיד'
      }
      if (scheduleMode === 'recurring') {
        if (recurringDays.length === 0) errors[2] = 'יש לבחור לפחות יום אחד'
        else if (!recurringDays.some(d => dayTimes[d]?.some(t => t.trim()))) errors[2] = 'יש לבחור לפחות שעה אחת'
        else if (!recurringStartDate) errors[2] = 'יש לבחור תאריך התחלה'
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
        {postText.trim() && !results && (
          <button
            type="button"
            className="cp-topbar-draft"
            onClick={handleSaveAsDraft}
            disabled={savingDraft}
          >
            {savingDraft ? '⏳' : '💾'} {savingDraft ? 'שומר...' : 'שמור כטיוטה'}
          </button>
        )}
        <div className="cp-topbar-spacer" />
        <h1 className="cp-title">קמפיין חדש</h1>
        <button className="cp-back" onClick={handleExitWizard}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
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
            <span className="cp-preview-label">תצוגה מקדימה</span>
            <FacebookPreview
              text={postText}
              images={postImagePreviews}
              groupName={selectedGroups[0]?.name}
              userName={user?.name}
              whatsappNumber={whatsappNumber}
              isAnonymous={isAnonymous}
            />
          </div>

          <div className="cp-wizard">
          {/* Restore / Continue buttons */}
          {!results && currentStep === 0 && !showRestore && (recentDrafts.length > 0 || recentHistory.length > 0) && (
            <div className="cp-restore-bar">
              {recentDrafts.length > 0 && (
                <button type="button" className="cp-restore-btn" onClick={() => setShowRestore('drafts')}>
                  📝 המשך מאיפה שעצרתי ({recentDrafts.length})
                </button>
              )}
              {recentHistory.length > 0 && (
                <button type="button" className="cp-restore-btn cp-restore-history" onClick={() => setShowRestore('history')}>
                  🔄 שחזור מהיסטוריה
                </button>
              )}
            </div>
          )}

          {/* Restore panel */}
          {showRestore && (
            <div className="cp-restore-panel">
              <div className="cp-restore-header">
                <h3>{showRestore === 'drafts' ? '📝 טיוטות שנשמרו' : '🔄 שחזור מקמפיינים קודמים'}</h3>
                <button type="button" className="cp-restore-close" onClick={() => setShowRestore(false)}>✕</button>
              </div>
              {loadingRecent ? (
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
                  {idx < currentStep ? '✓' : <span>{step.icon}</span>}
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
                <div className="cp-card">
                  <input
                    type="text"
                    className="cp-title-input"
                    placeholder="כותרת הקמפיין (לא תפורסם בפייסבוק)"
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                  />
                  <textarea
                    className={`cp-textarea ${stepErrors[0] && !postText.trim() ? 'input-error' : ''}`}
                    placeholder="מה ברצונך לשתף?"
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    rows={6}
                  />

                  {postImagePreviews.length > 0 && (
                    <div className="cp-images-preview">
                      {postImagePreviews.map((preview, i) => (
                        <div key={i} className="cp-image-preview-item">
                          <img src={preview} alt={`preview ${i + 1}`} />
                          <span className="cp-image-number">{i + 1}</span>
                          <button onClick={() => removeImage(i)} className="cp-remove-img">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showLocationInput && (
                    <div className="cp-location-wrap">
                      <LocationAutocomplete
                        value={postLocation}
                        onChange={setPostLocation}
                      />
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
                      <span>✓ קישור וואטסאפ יצורף: </span>
                      <span className="cp-whatsapp-link" dir="ltr">wa.me/{whatsappNumber.replace(/[^0-9]/g, '')}{whatsappMessage ? '?text=...' : ''}</span>
                      {whatsappMessage && <p className="cp-whatsapp-hint" style={{ marginTop: 4, fontSize: 11 }}>💬 הודעה: {whatsappMessage}</p>}
                    </div>
                  )}

                  <div className="cp-options">
                    <label className="cp-option">
                      <span className="cp-option-icon">📷</span>
                      <span>תמונות</span>
                      <input type="file" accept="image/*" multiple onChange={handleImageSelect} hidden />
                    </label>
                    <button
                      type="button"
                      className={`cp-option ${showLocationInput ? 'active' : ''}`}
                      onClick={() => setShowLocationInput(!showLocationInput)}
                    >
                      <span className="cp-option-icon">📍</span>
                      <span>מיקום</span>
                    </button>
                    <label className={`cp-option ${isAnonymous ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        hidden
                      />
                      <span className="cp-option-icon">🕶️</span>
                      <span>אנונימי</span>
                    </label>
                    <button
                      type="button"
                      className={`cp-option ${showWhatsapp ? 'active' : ''}`}
                      onClick={() => {
                        if (!whatsappNumber) {
                          // Not linked yet — show inline linking
                          setWaLinking(true)
                        } else {
                          setShowWhatsapp(!showWhatsapp)
                        }
                      }}
                    >
                      <span className="cp-option-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </span>
                      <span>הוסף וואטסאפ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: Groups */}
            {currentStep === 1 && (
              <div className="cp-step-panel">
                <div className="cp-card">
                  <div className="cp-card-header">
                    <h3>בחר קבוצות לפרסום</h3>
                    {selectedGroups.length > 0 && <span className="cp-badge">{selectedGroups.length} נבחרו</span>}
                  </div>

                  {selectedGroups.length > 0 && (
                    <div className="cp-selected-groups-chips">
                      {selectedGroups.map(g => (
                        <span key={g.id} className="cp-selected-chip">
                          <span>{g.name}</span>
                          <button type="button" onClick={() => toggleGroup(g)}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}

                  {selectedGroups.length > 0 && (
                    <div className="cp-exposure-counter">
                      <span className="cp-exposure-icon">👁</span>
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
                    <div className="cp-groups-panel" style={{ display: 'block' }}>
                      <div className="cp-group-search">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input
                          type="text"
                          placeholder="חפש קבוצה..."
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                        />
                      </div>

                      <div className="cp-group-actions">
                        <button onClick={selectAllGroups}>בחר הכל</button>
                        <button onClick={deselectAll}>נקה בחירה</button>
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

            {/* STEP 2: Schedule */}
            {currentStep === 2 && (
              <div className="cp-step-panel">
                <div className="cp-card">
                  <div className="cp-card-header">
                    <h3>מתי לפרסם?</h3>
                  </div>
                  <div className="cp-schedule">
                    <div className="schedule-tabs">
                      <button type="button" className={`schedule-tab ${scheduleMode === 'now' ? 'active' : ''}`} onClick={() => setScheduleMode('now')}>
                        <span className="schedule-tab-icon">⚡</span>
                        <span>פרסם עכשיו</span>
                      </button>
                      <button type="button" className={`schedule-tab ${scheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => setScheduleMode('scheduled')}>
                        <span className="schedule-tab-icon">📅</span>
                        <span>פרסום חד-פעמי</span>
                      </button>
                      <button type="button" className={`schedule-tab ${scheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => setScheduleMode('recurring')}>
                        <span className="schedule-tab-icon">🔄</span>
                        <span>פרסום קבוע</span>
                      </button>
                    </div>

                    {scheduleMode === 'now' && (
                      <div className="schedule-info">
                        <p className="schedule-info-text">הפוסט יפורסם מיד לאחר לחיצה על כפתור הפרסום</p>
                      </div>
                    )}

                    {scheduleMode === 'scheduled' && (
                      <div className="schedule-fields">
                        <p className="schedule-desc">בחר תאריך ושעה לפרסום חד-פעמי בעתיד</p>
                        <div className="schedule-row">
                          <div className="schedule-field">
                            <label>תאריך</label>
                            <input
                              type="date"
                              value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                            />
                          </div>
                          <div className="schedule-field">
                            <label>שעה</label>
                            <input
                              type="time"
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                            />
                          </div>
                        </div>
                        {scheduleDate && scheduleTime && (
                          <div className="schedule-summary">
                            📅 יפורסם ב-{new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} בשעה {scheduleTime}
                          </div>
                        )}
                      </div>
                    )}

                    {scheduleMode === 'recurring' && (
                      <div className="schedule-fields">
                        <p className="schedule-desc">בחר ימים והגדר שעות לכל יום, הפוסט יפורסם באופן קבוע</p>

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
                          </div>
                        </div>

                        {recurringDays.length > 0 && (
                          <div className="schedule-section day-times-section">
                            <label className="schedule-section-label">שעות לכל יום</label>
                            <div className="day-times-list">
                              {recurringDays.sort((a, b) => a - b).map(dayIdx => {
                                const dayName = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][dayIdx]
                                const times = dayTimes[dayIdx] || ['']
                                return (
                                  <div key={dayIdx} className="day-times-card">
                                    <div className="day-times-header">
                                      <span className="day-times-day-name">יום {dayName}</span>
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

                        <div className="schedule-section">
                          <label className="schedule-section-label">תקופה</label>
                          <div className="schedule-row">
                            <div className="schedule-field">
                              <label>מתאריך</label>
                              <input
                                type="date"
                                value={recurringStartDate}
                                onChange={(e) => setRecurringStartDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                              />
                            </div>
                            <div className="schedule-field">
                              <label>עד תאריך (אופציונלי)</label>
                              <input
                                type="date"
                                value={recurringEndDate}
                                onChange={(e) => setRecurringEndDate(e.target.value)}
                                min={recurringStartDate || new Date().toISOString().split('T')[0]}
                              />
                            </div>
                          </div>
                        </div>

                        {recurringDays.length > 0 && Object.values(dayTimes).some(ts => ts.some(t => t)) && recurringStartDate && (
                          <div className="schedule-summary">
                            🔄 לוח פרסום:
                            {recurringDays.sort((a, b) => a - b).map(d => {
                              const name = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][d]
                              const ts = (dayTimes[d] || []).filter(t => t)
                              return ts.length ? `\n• ${name}: ${ts.join(', ')}` : null
                            }).filter(Boolean).join('')}
                            {`\nהחל מ-${new Date(recurringStartDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                            {recurringEndDate ? ` עד ${new Date(recurringEndDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}` : ' (ללא הגבלה)'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

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
                      <span className="cp-review-label">קבוצות ({selectedGroups.length}):</span>
                      <div className="cp-review-groups">
                        {selectedGroups.slice(0, 5).map(g => (
                          <span key={g.id} className="cp-review-chip">{g.name}</span>
                        ))}
                        {selectedGroups.length > 5 && <span className="cp-review-chip cp-chip-more">+{selectedGroups.length - 5} נוספות</span>}
                      </div>
                    </div>

                    <div className="cp-review-section">
                      <span className="cp-review-label">תזמון:</span>
                      <span className="cp-review-value">
                        {scheduleMode === 'now' && '⚡ פרסום מיידי'}
                        {scheduleMode === 'scheduled' && `📅 ${new Date(`${scheduleDate}T${scheduleTime}`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} בשעה ${scheduleTime}`}
                        {scheduleMode === 'recurring' && `🔄 ${recurringDays.length} ימים בשבוע`}
                      </span>
                    </div>

                    {whatsappNumber.trim() && (
                      <div className="cp-review-section">
                        <span className="cp-review-label">וואטסאפ:</span>
                        <span className="cp-review-value">wa.me/{whatsappNumber.replace(/[^0-9]/g, '')}</span>
                      </div>
                    )}

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
            {currentStep < steps.length - 1 ? (
              <button type="button" className="cp-nav-btn cp-nav-next" onClick={goNext}>
                ← הבא
              </button>
            ) : (
              <button
                type="button"
                className="cp-publish-btn"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing
                  ? `מפרסם ב-${selectedGroups.length} קבוצות...`
                  : scheduleMode === 'recurring'
                    ? `🔄 תזמן חוזר ב-${selectedGroups.length} קבוצות`
                    : scheduleMode === 'scheduled'
                      ? `📅 תזמן ב-${selectedGroups.length} קבוצות`
                      : `🚀 פרסם ב-${selectedGroups.length} קבוצות`
                }
              </button>
            )}

            <button
              type="button"
              className="cp-preview-btn-mobile"
              onClick={() => setShowMobilePreview(true)}
            >
              👁️ תצוגה מקדימה
            </button>

            <div className="cp-nav-spacer" />

            {currentStep > 0 && (
              <button type="button" className="cp-nav-btn cp-nav-back" onClick={goBack}>
                הקודם →
              </button>
            )}
          </div>
        </div>
        </div>

        {showMobilePreview && (
          <div className="fbp-modal-overlay" onClick={() => setShowMobilePreview(false)}>
            <div className="fbp-modal-content" onClick={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
              <button className="fbp-modal-close" onClick={() => setShowMobilePreview(false)}>✕</button>
              <FacebookPreview
                text={postText}
                images={postImagePreviews}
                groupName={selectedGroups[0]?.name}
                userName={user?.name}
                whatsappNumber={whatsappNumber}
                isAnonymous={isAnonymous}
              />
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
