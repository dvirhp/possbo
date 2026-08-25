import '../styles/fb-preview.css'

export default function FacebookPreview({ text, images, groupName, userName, whatsappNumber, isAnonymous }) {
  const displayName = isAnonymous ? 'חבר/ת בקבוצה' : (userName || 'המשתמש שלך')
  const finalText = whatsappNumber?.trim()
    ? `${text}\n\nhttps://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`
    : text

  const timeAgo = 'עכשיו'

  return (
    <div className="fbp-phone-frame">
      <div className="fbp-phone-notch">
        <div className="fbp-phone-time">10:10</div>
        <div className="fbp-phone-island" />
        <div className="fbp-phone-icons">
          <span className="fbp-signal" />
          <span className="fbp-wifi" />
          <span className="fbp-battery" />
        </div>
      </div>

      <div className="fbp-app-bar">
        <div className="fbp-app-bar-right">
          <span className="fbp-fb-logo">facebook</span>
        </div>
        <div className="fbp-app-bar-left">
          <div className="fbp-icon-circle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12c0 2.3.8 4.4 2.1 6.1l.5.5-1.1 3.4 3.5-1.1.5.3c1.5.9 3.3 1.4 5.1 1.4h.1c5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
          </div>
          <div className="fbp-icon-circle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.5"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5"/></svg>
          </div>
          <div className="fbp-icon-circle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" strokeWidth="2"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2"/></svg>
          </div>
        </div>
      </div>

      <div className="fbp-content">
        {/* Group header */}
        <div className="fbp-group-header">
          <div className="fbp-group-avatar">
            <div className="fbp-avatar-placeholder" />
          </div>
          <div className="fbp-group-info">
            <span className="fbp-group-name">{groupName || 'שם הקבוצה'}</span>
            <div className="fbp-post-meta">
              <span className="fbp-author">{displayName}</span>
              <span className="fbp-dot">·</span>
              <span className="fbp-time">{timeAgo}</span>
              <span className="fbp-dot">·</span>
              <span className="fbp-privacy">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.5 5.5l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 011.06-1.06L7 7.94l3.47-3.47a.75.75 0 011.06 1.06z"/></svg>
              </span>
            </div>
          </div>
          <div className="fbp-more-btn">···</div>
        </div>

        {/* Post text */}
        {finalText && (
          <div className="fbp-post-text">
            {finalText.split('\n').map((line, i) => (
              <span key={i}>
                {line.startsWith('http') ? <a className="fbp-link">{line}</a> : line}
                {i < finalText.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
        )}

        {/* Post images */}
        {images && images.length > 0 && (
          <div className={`fbp-post-images ${images.length === 1 ? 'single' : images.length === 2 ? 'double' : 'multi'}`}>
            {images.slice(0, 4).map((img, i) => (
              <div key={i} className="fbp-image-item">
                <img src={img} alt="" />
                {i === 3 && images.length > 4 && (
                  <div className="fbp-image-more">+{images.length - 4}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions bar */}
        <div className="fbp-reactions-bar">
          <div className="fbp-reactions-left">
            <span className="fbp-reaction-icons">👍❤️</span>
            <span className="fbp-reaction-count">12</span>
          </div>
          <div className="fbp-reactions-right">
            <span>3 תגובות</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="fbp-actions">
          <button className="fbp-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            <span>לייק</span>
          </button>
          <button className="fbp-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>תגובה</span>
          </button>
          <button className="fbp-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            <span>שיתוף</span>
          </button>
        </div>
      </div>

      {!finalText && !images?.length && (
        <div className="fbp-empty-state">
          <p>התחל לכתוב כדי לראות תצוגה מקדימה</p>
        </div>
      )}
    </div>
  )
}
