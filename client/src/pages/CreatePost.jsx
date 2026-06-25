import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { groupsService } from '../services/groupsService'
import { publishService } from '../services/publishService'
import LocationAutocomplete from '../components/LocationAutocomplete'
import FacebookPreview from '../components/FacebookPreview'
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
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [showWhatsapp, setShowWhatsapp] = useState(false)

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
    // Use cached groups if available, otherwise load
    if (cachedGroups?.length) {
      setGroups(cachedGroups)
      setLoadingGroups(false)
    } else {
      loadGroups()
    }
  }, [authChecked, user, navigate, cachedGroups])

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

    // If scheduling (not immediate), use scheduler API
    if (scheduleMode === 'scheduled' || scheduleMode === 'recurring') {
      try {
        const campaignText = whatsappNumber.trim()
          ? `${postText}\n\nhttps://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
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

    // Immediate publish
    const finalText = whatsappNumber.trim()
      ? `${postText}\n\nhttps://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
      : postText
    const publishResults = []

    const promises = selectedGroups.map(async (group) => {
      try {
        const groupUrl = group.url || `https://www.facebook.com/groups/${group.externalId}`
        const res = await publishService.publish(
          groupUrl,
          finalText,
          postImages,
          group.name,
          isAnonymous,
          postLocation,
          campaignTitle
        )
        publishResults.push({
          group: group.name,
          success: true,
          postUrl: res.data?.postUrl || res.data?.savedPost?.postUrl || null,
        })
      } catch (err) {
        const msg = err.response?.data?.error || err.message
        publishResults.push({
          group: group.name,
          success: false,
          error: msg,
        })
      }
    })

    await Promise.all(promises)
    setResults(publishResults)
    setPublishing(false)
    forceRefresh()
  }

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  )

  const [groupsOpen, setGroupsOpen] = useState(false)
  const groupsPanelRef = useRef(null)

  // Multi-step wizard
  const [currentStep, setCurrentStep] = useState(0)
  const [stepErrors, setStepErrors] = useState({}) // { 0: 'msg', 1: 'msg' }

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
        <button className="cp-back" onClick={() => navigate('/dashboard')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>חזרה</span>
        </button>
        <h1 className="cp-title">קמפיין חדש</h1>
        <div className="cp-topbar-spacer" />
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
                    window.alert('החיבור לא הושלם — נסה שוב')
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
            <div className="cp-stepper-progress" style={{ transform: `scaleX(${currentStep / (steps.length - 1)})` }} />
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
                    onChange={(e) => { setPostText(e.target.value); if (stepErrors[0]) setStepErrors({}) }}
                    rows={6}
                  />

                  {postImagePreviews.length > 0 && (
                    <div className="cp-images-preview">
                      {postImagePreviews.map((preview, i) => (
                        <div key={i} className="cp-image-preview-item">
                          <img src={preview} alt={`preview ${i + 1}`} />
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

                  {showWhatsapp && (
                    <div className="cp-whatsapp-wrap">
                      <div className="cp-whatsapp-input">
                        <span className="cp-whatsapp-prefix">wa.me/</span>
                        <input
                          type="tel"
                          placeholder="972501234567"
                          value={whatsappNumber}
                          onChange={(e) => setWhatsappNumber(e.target.value)}
                        />
                      </div>
                      {whatsappNumber.trim() && (
                        <div className="cp-whatsapp-preview">
                          יצורף בסוף הפוסט: https://wa.me/{whatsappNumber.replace(/[^0-9]/g, '')}
                        </div>
                      )}
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
                      onClick={() => setShowWhatsapp(!showWhatsapp)}
                    >
                      <span className="cp-option-icon">💬</span>
                      <span>וואטסאפ</span>
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

                  {loadingGroups ? (
                    <div className="cp-loading">טוען קבוצות...</div>
                  ) : groups.length === 0 ? (
                    <div className="cp-no-groups">
                      <p>אין קבוצות שמורות</p>
                      <Link to="/dashboard" state={{ tab: 'groups' }}>סנכרן קבוצות מפייסבוק</Link>
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
                        <p className="schedule-desc">בחר ימים והגדר שעות לכל יום — הפוסט יפורסם באופן קבוע</p>

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
            {currentStep > 0 && (
              <button type="button" className="cp-nav-btn cp-nav-back" onClick={goBack}>
                → הקודם
              </button>
            )}
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
          </div>
        </div>
        </div>

        {showMobilePreview && (
          <div className="fbp-modal-overlay" onClick={() => setShowMobilePreview(false)}>
            <div className="fbp-modal-content" onClick={(e) => e.stopPropagation()}>
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
    </div>
  )
}
