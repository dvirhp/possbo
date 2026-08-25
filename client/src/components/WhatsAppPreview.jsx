import '../styles/wa-preview.css'

export default function WhatsAppPreview({ text, images, targetName }) {

  const timeStr = '10:10'

  // Strip wa.me links from preview (not relevant in WhatsApp context)
  const cleanText = text
    ? text.replace(/\n*https?:\/\/wa\.me\/[^\s]*/g, '').trim()
    : ''

  return (
    <div className="wap-phone-frame">
      <div className="wap-phone-notch">
        <div className="wap-phone-time">10:10</div>
        <div className="wap-phone-island" />
        <div className="wap-phone-icons">
          <span className="wap-signal" />
          <span className="wap-wifi" />
          <span className="wap-battery" />
        </div>
      </div>

      {/* WhatsApp top bar */}
      <div className="wap-app-bar">
        <div className="wap-app-bar-right">
          <svg className="wap-back-arrow" width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          <div className="wap-contact-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <div className="wap-contact-info">
            <span className="wap-contact-name">{targetName || 'קבוצה / רשימת תפוצה'}</span>
            <span className="wap-contact-status">מחובר/ת</span>
          </div>
        </div>
        <div className="wap-app-bar-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-5-5.2zm-6.2 0c-2.6 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2 4.6-4.6 4.6z"/></svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </div>
      </div>

      {/* Chat area */}
      <div className="wap-chat-area">
        <div className="wap-chat-bg" />

        {/* Date chip */}
        <div className="wap-date-chip">
          <span>היום</span>
        </div>

        {!cleanText && !images?.length ? (
          <div className="wap-empty-state">
            <p>התחילי לכתוב כדי לראות תצוגה מקדימה</p>
          </div>
        ) : (
          <div className="wap-bubble-container">
            <div className="wap-bubble wap-bubble-out">
              <div className="wap-bubble-tail" />

              {/* Images */}
              {images && images.length > 0 && (
                <div className={`wap-bubble-images ${images.length === 1 ? 'single' : 'multi'}`}>
                  {images.slice(0, 4).map((img, i) => (
                    <div key={i} className="wap-bubble-img-wrap">
                      <img src={img} alt="" />
                      {i === 3 && images.length > 4 && (
                        <div className="wap-bubble-img-more">+{images.length - 4}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Text */}
              {cleanText && (
                <div className="wap-bubble-text">
                  {cleanText.split('\n').map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < cleanText.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              )}

              {/* Time + checkmarks */}
              <div className="wap-bubble-meta">
                <span className="wap-bubble-time">{timeStr}</span>
                <svg className="wap-bubble-check" width="16" height="11" viewBox="0 0 16 11" fill="#53bdeb">
                  <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.343-.15.477.477 0 0 0-.343.15l-.546.547a.48.48 0 0 0 0 .682l2.86 2.852a.496.496 0 0 0 .332.15c.14 0 .26-.06.343-.178L11.2 1.792a.48.48 0 0 0 .025-.66z"/>
                  <path d="M14.757.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-0.572-.596-.891 1.1 1.166 1.193a.496.496 0 0 0 .332.15c.14 0 .26-.06.343-.178l6.897-8.456a.48.48 0 0 0 .025-.66z"/>
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom input bar */}
      <div className="wap-input-bar">
        <div className="wap-input-actions-right">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#8696a0"><circle cx="12" cy="12" r="10" fill="none" stroke="#8696a0" strokeWidth="1.5"/><path d="M8 14s1.5 2 4 2 4-2 4-2" fill="none" stroke="#8696a0" strokeWidth="1.5"/><circle cx="9" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/></svg>
        </div>
        <div className="wap-input-field">
          <span>הודעה</span>
        </div>
        <div className="wap-input-actions-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#8696a0"><path d="M15.17 11l-3.88-3.88a1 1 0 1 1 1.42-1.42l4.59 4.59a1 1 0 0 1 0 1.42l-4.59 4.59a1 1 0 0 1-1.42-1.42L15.17 13H4a1 1 0 0 1 0-2h11.17z" transform="rotate(180 12 12)"/></svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#8696a0"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" opacity="0"/><path d="M12 15l5-5H7z"/></svg>
        </div>
        <div className="wap-mic-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
        </div>
      </div>
    </div>
  )
}
