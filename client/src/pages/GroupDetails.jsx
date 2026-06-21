import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { screenshotService } from '../services/screenshotService'
import { publishService } from '../services/publishService'
import { groupsService } from '../services/groupsService'
import GenericList from '../components/GenericList'
import LocationAutocomplete from '../components/LocationAutocomplete'
import BackButton from '../components/BackButton'
import locale from '../assets/i18n'
import '../styles/group-details.css'

export default function GroupDetails() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const group = location.state

  // Screenshot state
  const [screenshot, setScreenshot] = useState(null)
  const [capturing, setCapturing] = useState(false)

  // Publish state
  const [showPostForm, setShowPostForm] = useState(false)
  const [postText, setPostText] = useState('')
  const [postImage, setPostImage] = useState(null)
  const [postImagePreview, setPostImagePreview] = useState(null)
  const [postAnonymous, setPostAnonymous] = useState(false)
  const [postLocation, setPostLocation] = useState('')
  const [showLocationInput, setShowLocationInput] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState(null)

  // Posts history
  const [posts, setPosts] = useState([])

  const [error, setError] = useState(null)

  useEffect(() => {
    if (group?.id) {
      loadPosts()
    }
  }, [group?.id])

  const loadPosts = async () => {
    try {
      const res = await groupsService.getGroupPosts(group.id)
      if (res.data.success) {
        setPosts(res.data.posts)
      }
    } catch {
      // silent - history is optional
    }
  }

  if (!group) {
    return (
      <div className="group-details-page">
        <div className="group-details-card">
          <p>{locale.groupDetails.groupNotFound}</p>
          <button onClick={() => navigate('/dashboard')} className="back-btn">{locale.groupDetails.back} →</button>
        </div>
      </div>
    )
  }

  const handleCapture = async () => {
    setCapturing(true)
    setError(null)
    setScreenshot(null)
    try {
      const res = await screenshotService.capture(group.url)
      if (res.data.success && res.data.screenshot) {
        setScreenshot('data:image/png;base64,' + res.data.screenshot)
      } else {
        setError(locale.groupDetails.captureFailed)
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      if (msg === 'FACEBOOK_SESSION_REQUIRED') {
        localStorage.removeItem('fbSessionReady')
        navigate('/')
      } else {
        setError(`${locale.errors.generic} ${msg}`)
      }
    } finally {
      setCapturing(false)
    }
  }

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPostImage(file)
      setPostImagePreview(URL.createObjectURL(file))
    }
  }

  const handlePublish = async () => {
    if (!postText.trim()) {
      setError(locale.publish.textRequired)
      return
    }
    setPublishing(true)
    setError(null)
    setPublishResult(null)
    try {
      const res = await publishService.publish(group.url, postText, postImage, group.name, postAnonymous, postLocation)
      if (res.data.success) {
        setPublishResult({
          success: true,
          screenshot: res.data.screenshot ? 'data:image/png;base64,' + res.data.screenshot : null,
          postUrl: res.data.savedPost?.postUrl || res.data.postUrl || null,
        })
        setShowPostForm(false)
        loadPosts()
      } else {
        setError(locale.publish.failed)
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      if (msg === 'FACEBOOK_SESSION_REQUIRED') {
        localStorage.removeItem('fbSessionReady')
        navigate('/')
      } else {
        setError(`${locale.errors.generic} ${msg}`)
      }
    } finally {
      setPublishing(false)
    }
  }

  const resetPostForm = () => {
    setShowPostForm(false)
    setPostText('')
    setPostImage(null)
    setPostImagePreview(null)
    setPostAnonymous(false)
    setPostLocation('')
    setShowLocationInput(false)
    setPublishResult(null)
  }

  return (
    <div className="group-details-page">
      <div className="group-details-card">
        <BackButton />

        <div className="group-details-header">
          {group.image && <img src={group.image} alt="" className="group-details-image" />}
          <div>
            <h2 className="group-details-name">{group.name}</h2>
            <a href={group.url} target="_blank" rel="noopener noreferrer" className="group-details-link">
              🔗 {locale.groupDetails.openInFacebook}
            </a>
          </div>
        </div>

        <div className="group-details-actions">
          <button onClick={handleCapture} disabled={capturing} className="action-btn capture-action-btn">
            {capturing ? `⏳ ${locale.groupDetails.capturing}` : `📸 ${locale.groupDetails.captureScreenshot}`}
          </button>
          <button onClick={() => setShowPostForm(true)} className="action-btn publish-action-btn">
            ✏️ {locale.groupDetails.publishPost}
          </button>
          <button
            onClick={() => navigate('/create-post', { state: { group } })}
            className="action-btn create-post-action-btn"
          >
            🚀 פרסם בקבוצה זו (+ קבוצות נוספות)
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {screenshot && (
          <div className="screenshot-result">
            <h3>📸 {locale.groupDetails.screenshotTitle}</h3>
            <img src={screenshot} alt="Screenshot" className="screenshot-img" />
          </div>
        )}

        {publishResult?.success && (
          <div className="publish-result">
            <h3>✅ {locale.publish.success}</h3>
            {publishResult.postUrl && (
              <a href={publishResult.postUrl} target="_blank" rel="noopener noreferrer" className="post-url-link">
                🔗 קישור לפוסט
              </a>
            )}
            {publishResult.screenshot && (
              <img src={publishResult.screenshot} alt="Post proof" className="screenshot-img" />
            )}
          </div>
        )}

        {showPostForm && (
          <div className="fb-create-post-overlay" onClick={resetPostForm}>
            <div className="fb-create-post-dialog" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="fb-cp-header">
                <h3>{locale.publish.title}</h3>
                <button onClick={resetPostForm} className="fb-cp-close-btn">✕</button>
              </div>

              <div className="fb-cp-divider" />

              {/* Anonymous toggle */}
              <div className="fb-cp-anonymous-row">
                <span className="fb-cp-anonymous-label">{locale.publish.postAnonymously}</span>
                <button
                  type="button"
                  className={`fb-cp-toggle ${postAnonymous ? 'fb-cp-toggle-on' : ''}`}
                  onClick={() => setPostAnonymous(!postAnonymous)}
                  disabled={publishing}
                >
                  <span className="fb-cp-toggle-knob" />
                </button>
              </div>

              <div className="fb-cp-divider" />

              {/* User / Group info */}
              <div className="fb-cp-user-info">
                {group.image && <img src={group.image} alt="" className="fb-cp-avatar" />}
                <div className="fb-cp-user-meta">
                  <span className="fb-cp-user-name">{group.name}</span>
                </div>
              </div>

              {/* Textarea */}
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder={locale.publish.textPlaceholder}
                className="fb-cp-textarea"
                disabled={publishing}
              />

              {/* Image preview */}
              {postImagePreview && (
                <div className="fb-cp-image-preview">
                  <img src={postImagePreview} alt="Preview" />
                  <button
                    onClick={() => { setPostImage(null); setPostImagePreview(null) }}
                    className="fb-cp-remove-image"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Add to post toolbar */}
              <div className="fb-cp-toolbar">
                <span className="fb-cp-toolbar-label">{locale.publish.addToPost}</span>
                <div className="fb-cp-toolbar-icons">
                  <label className="fb-cp-icon-btn fb-cp-icon-photo" title={locale.publish.addImage}>
                    🖼️
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      hidden
                      disabled={publishing}
                    />
                  </label>
                  <span className="fb-cp-icon-btn fb-cp-icon-tag" title={locale.publish.tagPeople}>👥</span>
                  <span className="fb-cp-icon-btn fb-cp-icon-emoji" title={locale.publish.addEmoji}>😊</span>
                  <span className="fb-cp-icon-btn fb-cp-icon-location" title={locale.publish.addLocation} onClick={() => setShowLocationInput(!showLocationInput)}>📍</span>
                  <span className="fb-cp-icon-btn fb-cp-icon-more">⋯</span>
                </div>
              </div>

              {/* Location input */}
              {showLocationInput && (
                <LocationAutocomplete
                  value={postLocation}
                  onChange={setPostLocation}
                  placeholder={locale.publish.locationPlaceholder}
                  disabled={publishing}
                />
              )}

              {/* Post button */}
              <button
                onClick={handlePublish}
                disabled={publishing || !postText.trim()}
                className="fb-cp-post-btn"
              >
                {publishing ? locale.publish.publishing : locale.publish.submit}
              </button>
            </div>
          </div>
        )}

        {posts.length > 0 && (
          <div className="posts-history">
            <h3>📋 פוסטים שפורסמו</h3>
            <GenericList
              items={posts.map((post) => ({
                id: post.id,
                name: post.text.length > 80 ? post.text.slice(0, 80) + '...' : post.text,
                subtitle: new Date(post.createdAt).toLocaleString('he-IL'),
                url: post.postUrl,
              }))}
              linkMode="external"
              buttonLabel="צפה בפוסט"
              searchable={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}

