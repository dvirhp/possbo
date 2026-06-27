import { Link } from 'react-router-dom'
import '../styles/auth.css'

export default function Privacy() {
  return (
    <div className="auth-container">
      <div className="privacy-page">
        <Link to="/" className="auth-back-btn">←</Link>
        <div className="privacy-header">
          <h1>📌 PostIt</h1>
          <p>מדיניות פרטיות ותנאי שימוש</p>
        </div>

        <div className="privacy-content">
          <section className="privacy-section">
            <h2>🔒 מדיניות פרטיות</h2>
            <p><strong>עדכון אחרון:</strong> יוני 2026</p>
            <p>PostIt מחויב להגנה על הפרטיות שלך. מדיניות זו מסבירה כיצד אנו אוספים, משתמשים ושומרים את המידע שלך.</p>

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
            <p>PostIt אינו אחראי לחסימות, הגבלות או נזקים שנגרמים כתוצאה משימוש בשירות. המשתמש אחראי באופן בלעדי לתכנים שהוא מפרסם.</p>
          </section>

          <section className="privacy-section">
            <h2>📧 יצירת קשר</h2>
            <p>לכל שאלה, בקשה או דיווח:</p>
            <div className="privacy-contact">
              <a href="mailto:postitnoweasyway@gmail.com">📧 postitnoweasyway@gmail.com</a>
            </div>
            <p className="privacy-note">נשתדל לחזור תוך 48 שעות עבודה.</p>
          </section>
        </div>

        <div className="privacy-footer">
          <Link to="/">חזרה לדף הבית</Link>
          <span> | </span>
          <Link to="/login">התחברות</Link>
          <span> | </span>
          <Link to="/register">הרשמה</Link>
        </div>
      </div>
    </div>
  )
}
