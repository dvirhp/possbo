import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import LandingChatBot from '../components/LandingChatBot'
import '../styles/landing.css'

export default function Landing() {
  const navigate = useNavigate()
  const { user, authChecked } = useAppData()
  const { theme, toggleTheme } = useTheme()

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (authChecked && user) {
      navigate('/dashboard')
    }
  }, [authChecked, user, navigate])

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="nav-logo"><img src="/logo.svg" alt="PostIt" className="nav-logo-img" /> PostIt</div>
        <div className="nav-buttons">
          <button className="nav-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <Link to="/login" className="nav-btn nav-btn-login">התחברות</Link>
          <Link to="/register" className="nav-btn nav-btn-register">הרשמה</Link>
        </div>
      </nav>

      <main className="landing-hero">
        <div className="hero-content">
          <h1>פרסם בכל הקבוצות בלחיצה אחת</h1>
          <p className="hero-subtitle">
            PostIt מאפשר לך לנהל את כל קבוצות הפייסבוק שלך, ליצור פוסטים ולפרסם אותם
            במספר קבוצות במקביל, בקליק אחד.
          </p>

          <div className="hero-features">
            <div className="feature-item">
              <span className="feature-icon">📋</span>
              <div>
                <h3>ניהול קבוצות</h3>
                <p>צפה בכל הקבוצות שלך במקום אחד</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon">✍️</span>
              <div>
                <h3>יצירת פוסטים</h3>
                <p>צור פוסט עם תמונה, מיקום ואנונימיות</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🚀</span>
              <div>
                <h3>פרסום מרובה</h3>
                <p>פרסם בכמה קבוצות בו זמנית</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⏰</span>
              <div>
                <h3>תזמון פרסומים</h3>
                <p>תזמן פוסטים לפרסום אוטומטי בזמן שתבחר</p>
              </div>
            </div>
          </div>

          <div className="hero-cta">
            <Link to="/register" className="cta-btn cta-btn-primary">התחל עכשיו בחינם</Link>
            <Link to="/login" className="cta-btn cta-btn-secondary">כבר יש לי חשבון</Link>
          </div>

          <a
            href="https://play.google.com/store"
            target="_blank"
            rel="noopener noreferrer"
            className="google-play-btn"
          >
            <svg viewBox="0 0 24 24" className="gp-icon" fill="currentColor">
              <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.3 2.3-8.636-8.632z"/>
            </svg>
            <div className="gp-text">
              <span className="gp-small">הורדה מ-</span>
              <span className="gp-big">Google Play</span>
            </div>
          </a>

          <div className="landing-footer">
            <Link to="/privacy">מדיניות פרטיות ותנאי שימוש</Link>
          </div>
        </div>
      </main>
      <LandingChatBot />
    </div>
  )
}
