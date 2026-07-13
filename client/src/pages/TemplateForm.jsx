import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { templatesService } from '../services/templatesService'
import { groupsService } from '../services/groupsService'
import LocationAutocomplete from '../components/LocationAutocomplete'
import OptimalTimesHint from '../components/OptimalTimesHint'
import { X, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import '../styles/templates.css'

const DAYS = [
  { id: 0, label: 'א׳' },
  { id: 1, label: 'ב׳' },
  { id: 2, label: 'ג׳' },
  { id: 3, label: 'ד׳' },
  { id: 4, label: 'ה׳' },
  { id: 5, label: 'ו׳' },
  { id: 6, label: 'ש׳' },
]

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
  const { user, authChecked, groups: cachedGroups } = useAppData()

  // Form state
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [location, setLocation] = useState('')
  const [showLocation, setShowLocation] = useState(false)
  const [whatsappText, setWhatsappText] = useState('')
  const [showWhatsapp, setShowWhatsapp] = useState(false)
  const [scheduleMode, setScheduleMode] = useState('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [recurringDays, setRecurringDays] = useState([])
  const [dayTimes, setDayTimes] = useState({})

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
        setScheduledDate(t.scheduledDate || '')
        setRecurringDays(t.recurringDays || [])
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

  const toggleDay = (dayId) => {
    setRecurringDays(prev => {
      if (prev.includes(dayId)) {
        const next = prev.filter(d => d !== dayId)
        const newDT = { ...dayTimes }
        delete newDT[dayId]
        setDayTimes(newDT)
        return next
      }
      const newDT = { ...dayTimes, [dayId]: dayTimes[dayId] || [''] }
      setDayTimes(newDT)
      return [...prev, dayId]
    })
  }

  const addTimeSlot = (dayId) => {
    setDayTimes(prev => ({
      ...prev,
      [dayId]: [...(prev[dayId] || []), ''],
    }))
  }

  const updateTimeSlot = (dayId, idx, val) => {
    setDayTimes(prev => ({
      ...prev,
      [dayId]: prev[dayId].map((t, i) => (i === idx ? val : t)),
    }))
  }

  const removeTimeSlot = (dayId, idx) => {
    setDayTimes(prev => ({
      ...prev,
      [dayId]: prev[dayId].filter((_, i) => i !== idx),
    }))
  }

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
        scheduledDate: scheduleMode === 'scheduled' ? scheduledDate || null : null,
        recurringDays,
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
      <div className="tpl-loading"><div className="tpl-spinner" /><span>טוען...</span></div>
    </div>
  )

  return (
    <div className="templates-page">
      {/* Top Bar */}
      <div className="tpl-topbar">
        <div style={{ width: 40 }} />
        <h1 className="tpl-title">{isEdit ? 'עריכת טמפלייט' : 'טמפלייט חדש'}</h1>
        <button className="tpl-back" onClick={() => navigate('/templates')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
      </div>

      <div className="tpl-form-layout">
        <div className="tpl-form">
          {error && <div className="tpl-error">{error}</div>}

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
            <textarea
              className="tpl-textarea"
              placeholder="מה ברצונך לשתף?"
              rows={6}
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          {/* Anonymous + Location */}
          <div className="tpl-toggles">
            <label className="tpl-toggle">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={e => setIsAnonymous(e.target.checked)}
              />
              <span>פרסום אנונימי</span>
            </label>
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
              onClick={() => setShowWhatsapp(!showWhatsapp)}
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

          {showWhatsapp && (
            <div className="tpl-field">
              <label className="tpl-label">הודעת WhatsApp</label>
              <textarea
                className="tpl-textarea"
                placeholder="טקסט שיישלח בווטסאפ..."
                value={whatsappText}
                onChange={e => setWhatsappText(e.target.value)}
                rows={3}
                style={{ minHeight: '80px' }}
              />
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
                onSelectDay={(dayNum) => {
                  if (!recurringDays.includes(dayNum)) setRecurringDays(prev => [...prev, dayNum])
                }}
              />
            )}

            {scheduleMode === 'scheduled' && (
              <div className="tpl-scheduled-picker">
                <label className="tpl-label">תאריך ושעה</label>
                <input
                  type="datetime-local"
                  className="tpl-input"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Recurring config */}
          {scheduleMode === 'recurring' && (
            <div className="tpl-recurring">
              <label className="tpl-label">ימים חוזרים</label>
              <div className="tpl-days">
                {DAYS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    className={`tpl-day ${recurringDays.includes(d.id) ? 'active' : ''}`}
                    onClick={() => toggleDay(d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {recurringDays.sort((a, b) => a - b).map(dayId => (
                <div key={dayId} className="tpl-day-times">
                  <span className="tpl-day-label">{DAYS.find(d => d.id === dayId)?.label}</span>
                  {(dayTimes[dayId] || ['']).map((time, idx) => (
                    <div key={idx} className="tpl-time-slot">
                      <input
                        type="time"
                        value={time}
                        onChange={e => updateTimeSlot(dayId, idx, e.target.value)}
                        className="tpl-time-input"
                      />
                      {(dayTimes[dayId] || []).length > 1 && (
                        <button type="button" className="tpl-time-remove" onClick={() => removeTimeSlot(dayId, idx)}>✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="tpl-time-add" onClick={() => addTimeSlot(dayId)}>
                    + שעה נוספת
                  </button>
                </div>
              ))}
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
              onClick={() => navigate('/templates')}
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
