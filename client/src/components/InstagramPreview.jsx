import { useRef } from 'react'
import '../styles/ig-preview.css'

export default function InstagramPreview({ text, images, userName, mode = 'FEED', onAddImage }) {
  const displayName = userName || 'possbo_user'
  const usernameHandle = displayName.replace(/\s+/g, '_').toLowerCase()
  const fileInputRef = useRef(null)

  const handleFileClick = () => {
    if (onAddImage) fileInputRef.current?.click()
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0 && onAddImage) onAddImage(files)
    e.target.value = ''
  }

  const noImageUpload = (label) => (
    <div className="igp-story-empty igp-upload-prompt" onClick={handleFileClick}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <p>{label}</p>
      {onAddImage && <span className="igp-upload-btn">לחצי להוספת תמונה</span>}
      {onAddImage && (
        <input
          ref={fileInputRef}
          type="file"
          accept={mode === 'REEL' ? 'video/mp4,video/quicktime,video/webm' : 'image/*,video/mp4,video/quicktime,video/webm'}
          multiple
          onChange={handleFileChange}
          hidden
        />
      )}
    </div>
  )

  if (mode === 'REEL') {
    return (
      <div className="igp-phone-frame igp-story-frame igp-reel-frame">
        <div className="igp-phone-notch">
          <div className="igp-phone-time">10:10</div>
          <div className="igp-phone-island" />
          <div className="igp-phone-icons">
            <span className="igp-signal" />
            <span className="igp-wifi" />
            <span className="igp-battery" />
          </div>
        </div>

        <div className="igp-reel-content">
          {/* Reel media */}
          <div className="igp-reel-media">
            {images && images.length > 0 ? (
              <img src={images[0]} alt="" className="igp-reel-image" />
            ) : noImageUpload('הוסיפי סרטון לריל')}
          </div>

          {/* Reel right actions */}
          <div className="igp-reel-actions">
            <div className="igp-reel-action">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span>1.2K</span>
            </div>
            <div className="igp-reel-action">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>86</span>
            </div>
            <div className="igp-reel-action">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              <span>שתף</span>
            </div>
            <div className="igp-reel-action">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </div>
          </div>

          {/* Reel bottom info */}
          <div className="igp-reel-bottom">
            <div className="igp-reel-user">
              <div className="igp-avatar-placeholder igp-reel-avatar" />
              <span className="igp-reel-username">{usernameHandle}</span>
              <button className="igp-reel-follow">עקוב</button>
            </div>
            {text && (
              <div className="igp-reel-caption">
                {text.length > 80 ? text.slice(0, 80) + '...' : text}
              </div>
            )}
            <div className="igp-reel-audio">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <span className="igp-reel-audio-text">{usernameHandle} · אודיו מקורי</span>
            </div>
          </div>

          {/* Reel progress bar */}
          <div className="igp-reel-progress">
            <div className="igp-reel-progress-bar" />
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'STORY') {
    return (
      <div className="igp-phone-frame igp-story-frame">
        <div className="igp-phone-notch">
          <div className="igp-phone-time">10:10</div>
          <div className="igp-phone-island" />
          <div className="igp-phone-icons">
            <span className="igp-signal" />
            <span className="igp-wifi" />
            <span className="igp-battery" />
          </div>
        </div>

        <div className="igp-story-content">
          {/* Story progress bar */}
          <div className="igp-story-progress">
            <div className="igp-story-progress-bar">
              <div className="igp-story-progress-fill" />
            </div>
          </div>

          {/* Story header */}
          <div className="igp-story-header">
            <div className="igp-story-avatar">
              <div className="igp-avatar-placeholder" />
            </div>
            <span className="igp-story-username">{usernameHandle}</span>
            <span className="igp-story-time">עכשיו</span>
            <div className="igp-story-actions">
              <span className="igp-story-more">···</span>
              <span className="igp-story-close">✕</span>
            </div>
          </div>

          {/* Story media */}
          <div className="igp-story-media">
            {images && images.length > 0 ? (
              <img src={images[0]} alt="" className="igp-story-image" />
            ) : noImageUpload('הוסיפי תמונה או סרטון לסטורי')}

            {/* Text overlay on story */}
            {text && (
              <div className="igp-story-text-overlay">
                <span>{text.length > 100 ? text.slice(0, 100) + '...' : text}</span>
              </div>
            )}
          </div>

          {/* Story bottom */}
          <div className="igp-story-bottom">
            <div className="igp-story-reply">
              <input type="text" placeholder="שלח הודעה..." disabled className="igp-story-reply-input" />
            </div>
            <div className="igp-story-send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // FEED mode (default)
  return (
    <div className="igp-phone-frame">
      <div className="igp-phone-notch">
        <div className="igp-phone-time">10:10</div>
        <div className="igp-phone-island" />
        <div className="igp-phone-icons">
          <span className="igp-signal" />
          <span className="igp-wifi" />
          <span className="igp-battery" />
        </div>
      </div>

      {/* Instagram app bar */}
      <div className="igp-app-bar">
        <div className="igp-app-bar-right">
          <span className="igp-ig-logo">Instagram</span>
        </div>
        <div className="igp-app-bar-left">
          <div className="igp-icon-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <div className="igp-icon-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
        </div>
      </div>

      <div className="igp-content">
        {/* Post header */}
        <div className="igp-post-header">
          <div className="igp-post-avatar">
            <div className="igp-avatar-ring">
              <div className="igp-avatar-placeholder" />
            </div>
          </div>
          <span className="igp-post-username">{usernameHandle}</span>
          <div className="igp-post-more">···</div>
        </div>

        {/* Post image */}
        <div className="igp-post-image">
          {images && images.length > 0 ? (
            <img src={images[0]} alt="" />
          ) : noImageUpload('הוסיפי תמונה לפוסט')}
          {images && images.length > 1 && (
            <div className="igp-carousel-dots">
              {images.slice(0, 5).map((_, i) => (
                <span key={i} className={`igp-carousel-dot ${i === 0 ? 'active' : ''}`} />
              ))}
              {images.length > 5 && <span className="igp-carousel-dot" />}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="igp-actions">
          <div className="igp-actions-right">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </div>
          <div className="igp-actions-left">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </div>
        </div>

        {/* Likes */}
        <div className="igp-likes">
          <strong>142 לייקים</strong>
        </div>

        {/* Caption */}
        {text && (
          <div className="igp-caption">
            <strong>{usernameHandle}</strong>{' '}
            <span>{text.length > 120 ? text.slice(0, 120) + '...' : text}</span>
          </div>
        )}

        {/* Comments */}
        <div className="igp-comments-link">הצג את כל 8 התגובות</div>

        {/* Time */}
        <div className="igp-post-time">עכשיו</div>
      </div>

      {!text && !images?.length && (
        <div className="igp-empty-state">
          <p>התחל לכתוב כדי לראות תצוגה מקדימה</p>
        </div>
      )}
    </div>
  )
}
