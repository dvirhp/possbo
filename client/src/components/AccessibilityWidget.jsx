import { useState, useEffect } from 'react'
import '../styles/accessibility.css'

const A11Y_STORAGE_KEY = 'possbo-a11y-settings'

const DEFAULT_SETTINGS = {
  fontSize: 0, // 0 = normal, 1 = large, 2 = largest
  highContrast: false,
  linkHighlight: false,
  grayscale: false,
  pauseAnimations: false,
  bigCursor: false,
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(A11Y_STORAGE_KEY)
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch { return DEFAULT_SETTINGS }
  })

  // Apply settings to document
  useEffect(() => {
    const root = document.documentElement

    // Font size
    root.classList.remove('a11y-font-large', 'a11y-font-largest')
    if (settings.fontSize === 1) root.classList.add('a11y-font-large')
    if (settings.fontSize === 2) root.classList.add('a11y-font-largest')

    // High contrast
    root.classList.toggle('a11y-high-contrast', settings.highContrast)

    // Link highlight
    root.classList.toggle('a11y-link-highlight', settings.linkHighlight)

    // Grayscale
    root.classList.toggle('a11y-grayscale', settings.grayscale)

    // Pause animations
    root.classList.toggle('a11y-no-animations', settings.pauseAnimations)

    // Big cursor
    root.classList.toggle('a11y-big-cursor', settings.bigCursor)

    // Save to localStorage
    try { localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
  }, [settings])

  const toggleSetting = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const cycleFontSize = () => {
    setSettings(prev => ({ ...prev, fontSize: (prev.fontSize + 1) % 3 }))
  }

  const resetAll = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  const fontLabel = ['רגיל', 'גדול', 'גדול מאוד'][settings.fontSize]

  return (
    <>
      <button
        className="a11y-fab"
        onClick={() => setOpen(!open)}
        aria-label="הגדרות נגישות"
        title="נגישות"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4.5" r="2.5" />
          <path d="M12 7v4m0 0l-3 7m3-7l3 7" />
          <path d="M7 11h10" />
        </svg>
      </button>

      {open && (
        <>
          <div className="a11y-overlay" onClick={() => setOpen(false)} />
          <div className="a11y-panel" role="dialog" aria-label="תפריט נגישות">
            <div className="a11y-panel-header">
              <h3>♿ הגדרות נגישות</h3>
              <button className="a11y-close" onClick={() => setOpen(false)} aria-label="סגור">✕</button>
            </div>

            <div className="a11y-options">
              <button className="a11y-option" onClick={cycleFontSize}>
                <span className="a11y-option-icon">🔤</span>
                <span className="a11y-option-label">גודל גופן</span>
                <span className="a11y-option-value">{fontLabel}</span>
              </button>

              <button className={`a11y-option ${settings.highContrast ? 'active' : ''}`} onClick={() => toggleSetting('highContrast')}>
                <span className="a11y-option-icon">🌗</span>
                <span className="a11y-option-label">ניגודיות גבוהה</span>
                <span className="a11y-option-status">{settings.highContrast ? '✓' : ''}</span>
              </button>

              <button className={`a11y-option ${settings.linkHighlight ? 'active' : ''}`} onClick={() => toggleSetting('linkHighlight')}>
                <span className="a11y-option-icon">🔗</span>
                <span className="a11y-option-label">הדגשת קישורים</span>
                <span className="a11y-option-status">{settings.linkHighlight ? '✓' : ''}</span>
              </button>

              <button className={`a11y-option ${settings.grayscale ? 'active' : ''}`} onClick={() => toggleSetting('grayscale')}>
                <span className="a11y-option-icon">🎨</span>
                <span className="a11y-option-label">גווני אפור</span>
                <span className="a11y-option-status">{settings.grayscale ? '✓' : ''}</span>
              </button>

              <button className={`a11y-option ${settings.pauseAnimations ? 'active' : ''}`} onClick={() => toggleSetting('pauseAnimations')}>
                <span className="a11y-option-icon">⏸️</span>
                <span className="a11y-option-label">עצירת אנימציות</span>
                <span className="a11y-option-status">{settings.pauseAnimations ? '✓' : ''}</span>
              </button>

              <button className={`a11y-option ${settings.bigCursor ? 'active' : ''}`} onClick={() => toggleSetting('bigCursor')}>
                <span className="a11y-option-icon">🖱️</span>
                <span className="a11y-option-label">סמן גדול</span>
                <span className="a11y-option-status">{settings.bigCursor ? '✓' : ''}</span>
              </button>
            </div>

            <button className="a11y-reset" onClick={resetAll}>
              🔄 איפוס הגדרות
            </button>

            <div className="a11y-footer">
              <p>אתר זה מונגש בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (WCAG 2.0 AA)</p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
