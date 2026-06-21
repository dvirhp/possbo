import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'
import { publishService } from '../services/publishService'
import LocationAutocomplete from '../components/LocationAutocomplete'
import BackButton from '../components/BackButton'
import '../styles/create-post.css'

export default function CreatePost() {
  const navigate = useNavigate()
  const location = useLocation()

  // Pre-selected group from navigation state (coming from group page)
  const preSelectedGroup = location.state?.group || null
  // Republish data from PostDetails page
  const republishData = location.state?.republish || null

  const [postText, setPostText] = useState(republishData?.content || '')
  const [postImage, setPostImage] = useState(null)
  const [postImagePreview, setPostImagePreview] = useState(null)
  const [isAnonymous, setIsAnonymous] = useState(republishData?.isAnonymous || false)
  const [postLocation, setPostLocation] = useState(republishData?.location || '')
  const [showLocationInput, setShowLocationInput] = useState(!!republishData?.location)

  // Groups selection
  const [groups, setGroups] = useState([])
  const [selectedGroups, setSelectedGroups] = useState(
    preSelectedGroup ? [preSelectedGroup] : []
  )
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [showGroupSelector, setShowGroupSelector] = useState(!preSelectedGroup)
  const [groupSearch, setGroupSearch] = useState('')

  // Publishing state
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const init = async () => {
      try {
        await authAPI.refresh()
      } catch {
        navigate('/login')
        return
      }
      loadGroups()
    }
    init()
  }, [navigate])

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
      if (exists) {
        return prev.filter(g => g.id !== group.id)
      }
      return [...prev, group]
    })
  }

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPostImage(file)
      setPostImagePreview(URL.createObjectURL(file))
    }
  }

  const removeImage = () => {
    setPostImage(null)
    setPostImagePreview(null)
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

    setPublishing(true)
    setError(null)
    setResults(null)

    const publishResults = []

    // Publish to all selected groups in parallel
    const promises = selectedGroups.map(async (group) => {
      try {
        const groupUrl = group.url || `https://www.facebook.com/groups/${group.externalId}`
        const res = await publishService.publish(
          groupUrl,
          postText,
          postImage,
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
  }

  return (
    <div className="create-post-page">
      <div className="page-header">
        <BackButton />
        <h2>✍️ צור פוסט חדש</h2>
      </div>

      {results ? (
        <div className="publish-results">
          <h3>תוצאות הפרסום:</h3>
          <div className="results-list">
            {results.map((r, i) => (
              <div key={i} className={`result-item ${r.success ? 'success' : 'failed'}`}>
                <span className="result-group">{r.group}</span>
                <span className="result-status">
                  {r.success ? '✓ פורסם בהצלחה' : `✗ ${r.error}`}
                </span>
                {r.postUrl && (
                  <a href={r.postUrl} target="_blank" rel="noopener noreferrer" className="result-link">
                    צפה בפוסט
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="results-actions">
            <button onClick={() => { setResults(null); setPostText(''); setSelectedGroups([]) }} className="btn-secondary">
              צור פוסט נוסף
            </button>
            <Link to="/dashboard" className="btn-primary">חזרה לדשבורד</Link>
          </div>
        </div>
      ) : (
        <div className="post-form-container">
          {/* Post content */}
          <div className="post-form-card">
            <textarea
              className="post-textarea"
              placeholder="מה ברצונך לשתף?"
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              rows={5}
            />

            {postImagePreview && (
              <div className="image-preview">
                <img src={postImagePreview} alt="preview" />
                <button onClick={removeImage} className="remove-image-btn">✕</button>
              </div>
            )}

            {showLocationInput && (
              <LocationAutocomplete
                value={postLocation}
                onChange={setPostLocation}
              />
            )}

            <div className="post-options">
              <label className="file-input-label">
                📷 תמונה
                <input type="file" accept="image/*" onChange={handleImageSelect} hidden />
              </label>
              <button
                type="button"
                className={`option-btn ${showLocationInput ? 'active' : ''}`}
                onClick={() => setShowLocationInput(!showLocationInput)}
              >
                📍 מיקום
              </button>
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
                🕶️ אנונימי
              </label>
            </div>
          </div>

          {/* Group selection */}
          <div className="group-selector-card">
            <div className="selector-header">
              <h3>בחר קבוצות לפרסום</h3>
              {selectedGroups.length > 0 && (
                <span className="selected-count">{selectedGroups.length} נבחרו</span>
              )}
            </div>

            {preSelectedGroup && (
              <div className="pre-selected-note">
                הקבוצה "{preSelectedGroup.name}" נבחרה אוטומטית. ניתן להוסיף קבוצות נוספות.
              </div>
            )}

            {loadingGroups ? (
              <p className="loading-text">טוען קבוצות...</p>
            ) : groups.length === 0 ? (
              <div className="no-groups">
                <p>אין קבוצות שמורות.</p>
                <Link to="/my-groups">טען קבוצות מפייסבוק</Link>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  className="group-search-input"
                  placeholder="🔍 חפש קבוצה..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
                <div className="groups-checkboxes">
                  {groups
                    .filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
                    .map((group) => (
                    <label
                      key={group.id}
                      className={`group-checkbox-item ${selectedGroups.find(g => g.id === group.id) ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedGroups.find(g => g.id === group.id)}
                        onChange={() => toggleGroup(group)}
                      />
                      <span className="group-name">{group.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            onClick={handlePublish}
            disabled={publishing || !postText.trim() || selectedGroups.length === 0}
            className="publish-btn"
          >
            {publishing
              ? `🔄 מפרסם ב-${selectedGroups.length} קבוצות...`
              : `🚀 פרסם ב-${selectedGroups.length} קבוצות`
            }
          </button>
        </div>
      )}
    </div>
  )
}
