import { useNavigate } from 'react-router-dom'
import { getAccessToken } from '../services/http'
import BrandLogo from '../components/BrandLogo'
import '../styles/auth.css'

export default function CancellationPolicy() {
  const navigate = useNavigate()

  const handleLogoClick = () => {
    navigate(getAccessToken() ? '/dashboard' : '/')
  }

  return (
    <div className="auth-container">
      <div className="privacy-page">
        <div className="privacy-topbar">
          <BrandLogo className="privacy-logo-img" onClick={handleLogoClick} style={{ cursor: 'pointer' }} />
          <h1 className="privacy-topbar-title">ביטול עסקה ומדיניות החזרים</h1>
          <button onClick={() => navigate(-1)} className="privacy-back-btn" aria-label="חזור">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>

        <div className="privacy-content">
          <section className="privacy-section">
            <h2>ביטול עסקה או מנוי</h2>
            <p><strong>עדכון אחרון:</strong> יולי 2026</p>
            <p>ניתן לבקש ביטול עסקה, ביטול מנוי או הפסקת חיוב עבור שירותי Possbo באמצעות פנייה אלינו במייל.</p>
            <p>הבקשה תטופל בהתאם להוראות חוק הגנת הצרכן, תקנות ביטול עסקה, תנאי השירות וסוג השירות שנרכש.</p>
          </section>

          <section className="privacy-section">
            <h2>איך שולחים בקשת ביטול</h2>
            <p>כדי לבטל עסקה או מנוי, יש לשלוח הודעת ביטול לכתובת המייל הבאה:</p>
            <div className="privacy-contact">
              <a href="mailto:possbonoweasyway@gmail.com?subject=בקשת ביטול עסקה - Possbo">possbonoweasyway@gmail.com</a>
            </div>
            <p>כדי שנוכל לזהות את החשבון ולטפל בבקשה במהירות, מומלץ לצרף:</p>
            <ul>
              <li>שם מלא.</li>
              <li>כתובת המייל של החשבון ב-Possbo.</li>
              <li>מספר טלפון, אם קיים בחשבון.</li>
              <li>סוג הבקשה: ביטול מנוי, ביטול עסקה או בירור חיוב.</li>
              <li>תאריך הרכישה או החיוב, אם ידוע.</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>מועד הטיפול בבקשה</h2>
            <p>לאחר קבלת הודעת הביטול, נבדוק את הבקשה ונפעל לביטול או הפסקת החיוב בהתאם לדין ולתנאי העסקה.</p>
            <p>במקרה של עסקה מתמשכת או מנוי, סיום השירות והפסקת החיוב יבוצעו בהתאם למועדים הקבועים בדין.</p>
            <p className="privacy-note">נשתדל לאשר את קבלת הבקשה תוך 48 שעות עבודה.</p>
          </section>

          <section className="privacy-section">
            <h2>החזרים כספיים</h2>
            <p>ככל שהמשתמש זכאי להחזר לפי דין או לפי תנאי השירות, ההחזר יבוצע לאמצעי התשלום שממנו בוצעה העסקה, בכפוף לבדיקה ולאישור הבקשה.</p>
            <p>ייתכנו מקרים שבהם לא תקום זכאות להחזר מלא או חלקי, למשל כאשר השירות כבר סופק או נעשה בו שימוש, והכול בהתאם להוראות הדין.</p>
          </section>

          <section className="privacy-section">
            <h2>שאלות בנושא ביטול</h2>
            <p>לכל שאלה בנושא חיובים, ביטולים או החזרים ניתן לפנות אלינו במייל:</p>
            <div className="privacy-contact">
              <a href="mailto:possbonoweasyway@gmail.com">possbonoweasyway@gmail.com</a>
            </div>
          </section>
        </div>

        <div className="privacy-footer">
          <p>© {new Date().getFullYear()} Possbo. כל הזכויות שמורות.</p>
        </div>
      </div>
    </div>
  )
}
