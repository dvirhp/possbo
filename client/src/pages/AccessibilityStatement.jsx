import { useNavigate } from 'react-router-dom'
import { getAccessToken } from '../services/http'
import BrandLogo from '../components/BrandLogo'
import '../styles/auth.css'

export default function AccessibilityStatement() {
  const navigate = useNavigate()

  const handleLogoClick = () => {
    navigate(getAccessToken() ? '/dashboard' : '/')
  }

  return (
    <div className="auth-container">
      <div className="privacy-page">
        <div className="privacy-topbar">
          <BrandLogo className="privacy-logo-img" onClick={handleLogoClick} style={{ cursor: 'pointer' }} />
          <h1 className="privacy-topbar-title">הצהרת נגישות</h1>
          <button onClick={() => navigate(-1)} className="privacy-back-btn" aria-label="חזור">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>

        <div className="privacy-content">
          <section className="privacy-section">
            <h2>מחויבות לנגישות</h2>
            <p><strong>עדכון אחרון:</strong> יולי 2026</p>
            <p>Possbo פועלת כדי לאפשר לכלל המשתמשים, לרבות אנשים עם מוגבלויות, להשתמש באתר ובמערכת באופן נוח, שוויוני ונגיש ככל האפשר.</p>
            <p>התאמות הנגישות באתר מבוססות על עקרונות תקן ישראלי ת&quot;י 5568, המבוסס על הנחיות WCAG 2.0 ברמת AA, ובוצעו תוך התייחסות לעקרונות עדכניים של WCAG 2.1.</p>
          </section>

          <section className="privacy-section">
            <h2>התאמות שבוצעו באתר</h2>
            <ul>
              <li>תמיכה בניווט באמצעות מקלדת ברכיבים מרכזיים באתר.</li>
              <li>סימון פוקוס גלוי וברור בעת מעבר בין רכיבים.</li>
              <li>שימוש בשמות נגישים לכפתורים, שדות, תפריטים ודיאלוגים.</li>
              <li>התאמת צבעים וניגודיות למצב בהיר ולמצב כהה.</li>
              <li>תמיכה בהעדפת מערכת להפחתת תנועה ואנימציות.</li>
              <li>הודעות מערכת עם תמיכה בהכרזה לקוראי מסך כאשר מתאים.</li>
              <li>התאמות רספונסיביות למסכי מובייל ודפדפן.</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>שימוש ברכיב נגישות</h2>
            <p>באתר קיים כפתור נגישות המאפשר לבצע התאמות תצוגה כגון הגדלת טקסט, ניגודיות גבוהה, הדגשת קישורים, עצירת אנימציות וסמן מוגדל.</p>
            <p>הכפתור זמין במסכי האתר המרכזיים ומותאם לצבעי מצב בהיר ומצב כהה.</p>
          </section>

          <section className="privacy-section">
            <h2>מגבלות וחריגים</h2>
            <p>אנו עושים מאמץ מתמשך לשפר את הנגישות. ייתכן שחלקים מסוימים באתר, תכנים שמקורם במערכות חיצוניות, תצוגות מקדימות של רשתות חברתיות או תכנים שהועלו על ידי משתמשים לא יהיו נגישים באופן מלא.</p>
            <p>אם נתקלת בקושי נגישות, נשמח לקבל דיווח כדי שנוכל לבדוק ולתקן במהירות האפשרית.</p>
          </section>

          <section className="privacy-section">
            <h2>פנייה בנושא נגישות</h2>
            <p>אם נתקלת בבעיה, חסם נגישות או צורך בהתאמה מיוחדת, ניתן לפנות אלינו:</p>
            <div className="privacy-contact">
              <a href="mailto:possbonoweasyway@gmail.com">possbonoweasyway@gmail.com</a>
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
