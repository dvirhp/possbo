import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import LandingChatBot from '../components/LandingChatBot'
import '../styles/landing.css'

export default function Landing() {
  const navigate = useNavigate()

  // If already logged in, redirect to dashboard
  useEffect(() => {
    authAPI.refresh()
      .then(() => navigate('/dashboard'))
      .catch(() => {}) // Not logged in - stay
  }, [navigate])

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="nav-logo"><img src="/logo.svg" alt="PostIt" className="nav-logo-img" /> PostIt</div>
        <div className="nav-buttons">
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

          <div className="landing-footer">
            <Link to="/privacy">מדיניות פרטיות ותנאי שימוש</Link>
          </div>
        </div>
      </main>
      <LandingChatBot />
    </div>
  )
}
