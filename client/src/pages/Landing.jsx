import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Clock, Moon, Pencil, Send, Sun, Users } from 'lucide-react'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import LandingChatBot from '../components/LandingChatBot'
import BrandLogo from '../components/BrandLogo'
import '../styles/landing.css'

export default function Landing() {
  const navigate = useNavigate()
  const { user, authChecked } = useAppData()
  const { theme, toggleTheme } = useTheme()
  const [isNavScrolled, setIsNavScrolled] = useState(false)

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (authChecked && user) {
      navigate('/dashboard')
    }
  }, [authChecked, user, navigate])

  useEffect(() => {
    const handleScroll = () => {
      setIsNavScrolled(window.scrollY > 48)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="landing-page">
      <nav className={`landing-nav ${isNavScrolled ? 'landing-nav-scrolled' : ''}`}>
        <div className="nav-logo" aria-label="Possbo">
          <BrandLogo className="nav-logo-img" decorative />
          <span className="nav-logo-wordmark">ossbo</span>
        </div>
        <div className="nav-buttons">
          <button className="nav-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}>
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.9} /> : <Moon size={18} strokeWidth={1.9} />}
          </button>
          <Link to="/login" className="nav-btn nav-btn-login">התחברות</Link>
          <Link to="/register" className="nav-btn nav-btn-register">הרשמה</Link>
        </div>
      </nav>

      <main className="landing-hero">
        <div className="hero-content">
          <h1>פרסם בכל הקבוצות בלחיצה אחת</h1>
          <p className="hero-subtitle">
            Possbo מאפשר לך לנהל את כל קבוצות הפייסבוק שלך, ליצור פוסטים ולפרסם אותם
            במספר קבוצות במקביל, בקליק אחד.
          </p>

          <div className="hero-features">
            <div className="feature-item">
              <span className="feature-icon"><Users size={28} strokeWidth={1.8} /></span>
              <div>
                <h3>ניהול קבוצות</h3>
                <p>צפה בכל הקבוצות שלך במקום אחד</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon"><Pencil size={28} strokeWidth={1.8} /></span>
              <div>
                <h3>יצירת פוסטים</h3>
                <p>צור פוסט עם תמונה, מיקום ואנונימיות</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon"><Send size={28} strokeWidth={1.8} /></span>
              <div>
                <h3>פרסום מרובה</h3>
                <p>פרסם בכמה קבוצות בו זמנית</p>
              </div>
            </div>
            <div className="feature-item">
              <span className="feature-icon"><Clock size={28} strokeWidth={1.8} /></span>
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
            <span aria-hidden="true">|</span>
            <Link to="/accessibility-statement">הצהרת נגישות</Link>
            <span aria-hidden="true">|</span>
            <Link to="/cancellation-policy">ביטול עסקה</Link>
            <span aria-hidden="true">|</span>
            <Link to="/contact">צור קשר</Link>
          </div>
        </div>
      </main>

      <section className="landing-section landing-workflow">
        <div className="landing-section-inner">
          <div className="landing-section-heading">
            <span>איך זה עובד</span>
            <h2>מהרעיון לפרסום מתוזמן בכמה צעדים</h2>
            <p>Possbo מרכז את העבודה השוטפת במקום אחד, כדי שלא תצטרך לקפוץ בין קבוצות, פוסטים ותזכורות.</p>
          </div>

          <div className="workflow-grid">
            <div className="workflow-card">
              <strong>1</strong>
              <h3>מחברים חשבונות וקבוצות</h3>
              <p>רכז את יעדי הפרסום שלך והכן אותם לקמפיינים חוזרים או חד פעמיים.</p>
            </div>
            <div className="workflow-card">
              <strong>2</strong>
              <h3>יוצרים תוכן פעם אחת</h3>
              <p>כתוב פוסט, צרף תמונות, בחר יעד ותזמון, ושמור הכל בצורה מסודרת.</p>
            </div>
            <div className="workflow-card">
              <strong>3</strong>
              <h3>עוקבים אחרי התוצאות</h3>
              <p>בדשבורד תוכל לראות מה פורסם, מה מתוזמן ומה צריך טיפול.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-insights">
        <div className="landing-section-inner landing-insights-grid">
          <div>
            <span className="landing-eyebrow">בנוי לעבודה יומיומית</span>
            <h2>פחות עבודה ידנית, יותר שליטה על הפרסום</h2>
            <p>
              הדף הזה נוסף גם כדי לבדוק את התנהגות הניווט בגלילה: כשהמשתמש מתקדם למטה,
              הלוגו נשאר קומפקטי ומפנה מקום לפעולות החשובות.
            </p>
          </div>
          <div className="insights-list">
            <div>
              <h3>תזמון ברור</h3>
              <p>אפשר לראות מראש אילו קמפיינים יוצאים ומתי.</p>
            </div>
            <div>
              <h3>ניהול מרוכז</h3>
              <p>קבוצות, פרופילים ויעדי פרסום נשארים באותה סביבת עבודה.</p>
            </div>
            <div>
              <h3>תצוגה מותאמת</h3>
              <p>העיצוב נשאר קריא גם בלייט וגם בדארק מוד.</p>
            </div>
          </div>
        </div>
      </section>
      <LandingChatBot />
    </div>
  )
}
