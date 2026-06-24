import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { groupsService } from '../services/groupsService'
import { publishService } from '../services/publishService'
import LocationAutocomplete from '../components/LocationAutocomplete'
import '../styles/create-post.css'

export default function CreatePost() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, authChecked, groups: cachedGroups, forceRefresh } = useAppData()

  const preSelectedGroup = location.state?.group || null
  const republishData = location.state?.republish || null

  const [postText, setPostText] = useState(republishData?.content || '')
  const [postImages, setPostImages] = useState([])
  const [postImagePreviews, setPostImagePreviews] = useState([])
  const [isAnonymous, setIsAnonymous] = useState(republishData?.isAnonymous || false)
  const [postLocation, setPostLocation] = useState(republishData?.location || '')
  const [showLocationInput, setShowLocationInput] = useState(!!republishData?.location)

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState('now') // 'now' | 'scheduled' | 'recurring'
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [recurringDays, setRecurringDays] = useState([])
  const [recurringTime, setRecurringTime] = useState('')

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
    if (!postText.trim()) {
      setError('יש לכתוב טקסט לפוסט')
      return
    }
    if (selectedGroups.length === 0) {
      setError('יש לבחור לפחות קבוצה אחת')
      return
    }

    // Validate scheduling fields
    if (scheduleMode === 'scheduled') {
      if (!scheduleDate || !scheduleTime) {
        setError('יש לבחור תאריך ושעה לתזמון')
        return
      }
    }
    if (scheduleMode === 'recurring') {
      if (recurringDays.length === 0) {
        setError('יש לבחור לפחות יום אחד לפרסום חוזר')
        return
      }
      if (!recurringTime) {
        setError('יש לבחור שעת פרסום')
        return
      }
    }

    setPublishing(true)
    setError(null)
    setResults(null)

    // If scheduling (not immediate), use scheduler API
    if (scheduleMode === 'scheduled' || scheduleMode === 'recurring') {
      try {
        // First create the post via publish service (without actually publishing to FB)
        const res = await groupsService.createCampaign({
          text: postText,
          groupIds: selectedGroups.map(g => g.id),
          anonymous: isAnonymous,
          location: postLocation,
          scheduleMode,
          scheduleDate,
          scheduleTime,
          recurringDays,
          recurringTime,
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
    const publishResults = []

    const promises = selectedGroups.map(async (group) => {
      try {
        const groupUrl = group.url || `https://www.facebook.com/groups/${group.externalId}`
        const res = await publishService.publish(
          groupUrl,
          postText,
          postImages,
          group.name,
          isAnonymous,
          postLocation
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

          {/* Session error — offer reconnect + retry */}
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
                    // Retry publish with same data
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
            <button onClick={() => { setResults(null); setPostText(''); setSelectedGroups([]); setPostImages([]); setPostImagePreviews([]) }} className="cp-btn-secondary">
              צור קמפיין נוסף
            </button>
            <Link to="/dashboard" className="cp-btn-primary">חזרה לדשבורד</Link>
          </div>
        </div>
      ) : (
        <div className="cp-layout">
          {/* LEFT: Post editor */}
          <div className="cp-editor">
            <div className="cp-card">
              <div className="cp-card-header">
                <h3>תוכן הפוסט</h3>
              </div>
              <textarea
                className="cp-textarea"
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
              </div>
            </div>

            {/* Schedule card */}
            <div className="cp-card">
              <div className="cp-card-header">
                <h3>תזמון</h3>
              </div>
              <div className="cp-schedule">
                <div className="schedule-tabs">
                  <button type="button" className={`schedule-tab ${scheduleMode === 'now' ? 'active' : ''}`} onClick={() => setScheduleMode('now')}>
                    <span className="schedule-tab-icon">⚡</span>
                    <span>פרסם עכשיו</span>
                  </button>
                  <button type="button" className={`schedule-tab ${scheduleMode === 'scheduled' ? 'active' : ''}`} onClick={() => setScheduleMode('scheduled')}>
                    <span className="schedule-tab-icon">📅</span>
                    <span>תזמן לעתיד</span>
                  </button>
                  <button type="button" className={`schedule-tab ${scheduleMode === 'recurring' ? 'active' : ''}`} onClick={() => setScheduleMode('recurring')}>
                    <span className="schedule-tab-icon">🔄</span>
                    <span>חוזר</span>
                  </button>
                </div>

                {scheduleMode === 'scheduled' && (
                  <div className="schedule-fields">
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
                )}

                {scheduleMode === 'recurring' && (
                  <div className="schedule-fields">
                    <div className="schedule-field schedule-field-full">
                      <label>ימים לפרסום</label>
                      <div className="days-grid">
                        {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map((day, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`day-btn ${recurringDays.includes(i) ? 'active' : ''}`}
                            onClick={() => {
                              setRecurringDays(prev =>
                                prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                              )
                            }}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="schedule-field">
                      <label>שעת פרסום</label>
                      <input
                        type="time"
                        value={recurringTime}
                        onChange={(e) => setRecurringTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Group selector + Publish */}
          <div className="cp-sidebar">
            <div className="cp-card cp-groups-card" ref={groupsPanelRef}>
              <button
                type="button"
                className="cp-groups-toggle"
                onClick={() => setGroupsOpen(!groupsOpen)}
              >
                <div className="cp-groups-toggle-info">
                  <span className="cp-groups-toggle-icon">👥</span>
                  <span className="cp-groups-toggle-label">קבוצות לפרסום</span>
                  {selectedGroups.length > 0 && (
                    <span className="cp-badge">{selectedGroups.length} נבחרו</span>
                  )}
                </div>
                <svg className={`cp-groups-chevron ${groupsOpen ? 'open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Selected groups chips */}
              {!groupsOpen && selectedGroups.length > 0 && (
                <div className="cp-selected-chips">
                  {selectedGroups.slice(0, 3).map(g => (
                    <span key={g.id} className="cp-selected-chip">
                      {g.name}
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleGroup(g) }}>✕</button>
                    </span>
                  ))}
                  {selectedGroups.length > 3 && (
                    <span className="cp-selected-chip cp-chip-more">+{selectedGroups.length - 3}</span>
                  )}
                </div>
              )}

              {groupsOpen && (
                <div className="cp-groups-panel">
                  {preSelectedGroup && (
                    <div className="cp-pre-selected">
                      📌 הקבוצה "{preSelectedGroup.name}" נבחרה אוטומטית
                    </div>
                  )}

                  {loadingGroups ? (
                    <div className="cp-loading">טוען קבוצות...</div>
                  ) : groups.length === 0 ? (
                    <div className="cp-no-groups">
                      <p>אין קבוצות שמורות</p>
                      <Link to="/dashboard" state={{ tab: 'groups' }}>סנכרן קבוצות מפייסבוק</Link>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && <div className="cp-error">{error}</div>}

            {/* Publish button */}
            <button
              onClick={handlePublish}
              disabled={publishing || !postText.trim() || selectedGroups.length === 0}
              className="cp-publish-btn"
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
          </div>
        </div>
      )}
    </div>
  )
}
