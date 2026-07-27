import { useNavigate } from 'react-router-dom'
import { getAccessToken } from '../services/http'
import BrandLogo from '../components/BrandLogo'
import '../styles/auth.css'

export default function Privacy() {
  const navigate = useNavigate()

  const handleLogoClick = () => {
    navigate(getAccessToken() ? '/dashboard' : '/')
  }

  return (
    <div className="auth-container">
      <div className="privacy-page">
        <div className="privacy-topbar">
          <BrandLogo className="privacy-logo-img" onClick={handleLogoClick} style={{ cursor: 'pointer' }} />
          <h1 className="privacy-topbar-title">מדיניות פרטיות ותנאי שימוש</h1>
          <button onClick={() => navigate(-1)} className="privacy-back-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>

        <div className="privacy-content">
          <section className="privacy-section">
            <h2>🔒 מדיניות פרטיות</h2>
            <p><strong>עדכון אחרון:</strong> יוני 2026</p>
            <p>Possbo מחויב להגנה על הפרטיות שלך. מדיניות זו מסבירה כיצד אנו אוספים, משתמשים ושומרים את המידע שלך.</p>

            <h3>מידע שאנו אוספים</h3>
            <ul>
              <li><strong>פרטי חשבון:</strong> אימייל, שם, מספר טלפון (אם סופק)</li>
              <li><strong>נתוני שימוש:</strong> פוסטים שנוצרו, קבוצות שנבחרו, הגדרות תזמון</li>
              <li><strong>חיבורים חיצוניים:</strong> טוקנים של פייסבוק ווואטסאפ (מוצפנים)</li>
            </ul>

            <h3>כיצד אנו משתמשים במידע</h3>
            <ul>
              <li>ניהול החשבון שלך ומתן גישה לשירותים</li>
              <li>פרסום פוסטים בקבוצות לפי בחירתך</li>
              <li>שליחת הודעות אימות וקודי אבטחה</li>
              <li>שיפור השירות וחוויית המשתמש</li>
            </ul>

            <h3>אבטחת מידע</h3>
            <ul>
              <li>סיסמאות מוצפנות באמצעות bcrypt</li>
              <li>טוקנים מוצפנים ב-AES-256-GCM</li>
              <li>תקשורת מאובטחת בפרוטוקול HTTPS</li>
              <li>אימות דו-שלבי באמצעות קוד מייל</li>
            </ul>

            <h3>שמירה ומחיקה</h3>
            <p>המידע שלך נשמר כל עוד החשבון פעיל. באפשרותך לבקש מחיקת חשבון ומידע בכל עת באמצעות פנייה אלינו.</p>
          </section>

          <section className="privacy-section">
            <h2>📋 תנאי שימוש</h2>

            <h3>שימוש מותר</h3>
            <ul>
              <li>פרסום תוכן חוקי בקבוצות פייסבוק שאתה חבר בהן</li>
              <li>שימוש בתזמון אוטומטי לפרסום תכנים</li>
              <li>ניהול קמפיינים שיווקיים לגיטימיים</li>
            </ul>

            <h3>שימוש אסור</h3>
            <ul>
              <li>ספאם או תוכן מטעה</li>
              <li>הפרת תנאי השימוש של פייסבוק</li>
              <li>שימוש לצורך הונאה, הטרדה או פעילות בלתי חוקית</li>
              <li>שיתוף גישה לחשבון עם צדדים שלישיים</li>
            </ul>

            <h3>הגבלת אחריות</h3>
            <p>Possbo אינו אחראי לחסימות, הגבלות או נזקים שנגרמים כתוצאה משימוש בשירות. המשתמש אחראי באופן בלעדי לתכנים שהוא מפרסם.</p>
          </section>

          <section className="privacy-section">
            <h2>📧 יצירת קשר</h2>
            <p>לכל שאלה, בקשה או דיווח:</p>
            <div className="privacy-contact">
              <a href="mailto:possbonoweasyway@gmail.com">📧 possbonoweasyway@gmail.com</a>
            </div>
            <p className="privacy-note">נשתדל לחזור תוך 48 שעות עבודה.</p>
          </section>
        </div>

        <div className="privacy-footer">
          <p>© {new Date().getFullYear()} Possbo. כל הזכויות שמורות.</p>
        </div>
      </div>
    </div>
  )
}
