import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import Seo from '../components/Seo'
import '../styles/marketing-solution.css'

const SOLUTIONS = {
  facebook: {
    path: '/facebook-groups-automation',
    eyebrow: 'אוטומציה ל-Facebook',
    title: 'פרסום אוטומטי בקבוצות ובפרופיל — בלי להעתיק ולהדביק',
    description: 'יוצרים פוסט פעם אחת, בוחרים קבוצות ופרופיל אישי, מתזמנים ועוקבים אחר כל הפרסומים מתוך קמפיין אחד.',
    seoTitle: 'פרסום אוטומטי בקבוצות פייסבוק | Possbo',
    seoDescription: 'פרסמו פוסטים בקבוצות Facebook ובפרופיל האישי, הגדירו תזמון חד-פעמי או חוזר ועקבו אחר לייקים, תגובות ושיתופים.',
    image: '/landing/possbo-create-real.webp',
    features: ['בחירת מספר קבוצות ופרופיל אישי', 'פרסום מיידי, מתוזמן או מחזורי', 'תמונות, סרטונים, מיקום ופרסום אנונימי', 'היסטוריית פרסומים וקישור ישיר לפוסט', 'סנכרון לייקים, תגובות ושיתופים', 'תבניות לקמפיינים שחוזרים על עצמם'],
    steps: [['מחברים', 'חיבור חד־פעמי לחשבון וסנכרון הקבוצות.'], ['יוצרים', 'כותבים פוסט לבד או יוצרים אותו עם AI.'], ['מפיצים', 'בוחרים יעדים, תזמון ועוקבים אחר התוצאות.']],
    faq: [['אפשר לפרסם גם בפרופיל האישי?', 'כן. אפשר לבחור קבוצות Facebook, פרופיל אישי או את שניהם באותו קמפיין.'], ['אפשר לקבוע פרסום חוזר?', 'כן. ניתן לבחור ימים, שעות וטווח תאריכים לקמפיין מחזורי.']],
  },
  instagram: {
    path: '/instagram-scheduling',
    eyebrow: 'ניהול Instagram',
    title: 'פוסט, סטורי ורילס — לכל פורמט יש את המקום והזמן שלו',
    description: 'מכינים את התוכן, מתאימים מדיה לכל פורמט ומתזמנים את הפעילות ב-Instagram כחלק מאותו קמפיין רב־ערוצי.',
    seoTitle: 'תזמון פוסטים, סטורי ורילס באינסטגרם | Possbo',
    seoDescription: 'נהלו ותזמנו פוסטים, Stories ו-Reels ב-Instagram לצד Facebook ו-WhatsApp מתוך מערכת אחת.',
    image: '/landing/possbo-create-real.webp',
    features: ['Feed, Story ו-Reels', 'בחירת מספר פורמטים במקביל', 'מדיה נפרדת המותאמת לכל פורמט', 'תזמון עצמאי לכל סוג פרסום', 'היסטוריה וקישורים לפרסומים', 'נתוני צפיות, לייקים ותגובות לפי זמינות הפלטפורמה'],
    steps: [['מחברים', 'מחברים חשבון Business או Creator פעם אחת.'], ['מתאימים', 'בוחרים פורמטים ומדיה לכל סוג פרסום.'], ['מודדים', 'רואים מה פורסם ומה יצר מעורבות.']],
    faq: [['אילו חשבונות נתמכים?', 'חשבונות Instagram מסוג Business או Creator המחוברים לתשתית Meta.'], ['אפשר לתזמן סטורי בנפרד מפוסט?', 'כן. לכל פורמט ניתן להגדיר תזמון משלו.']],
  },
  whatsapp: {
    path: '/whatsapp-campaigns',
    eyebrow: 'קמפיינים ב-WhatsApp',
    title: 'מגיעים לקבוצות ולרשימות תפוצה — ומנהלים הכול גם מהצ׳אט',
    description: 'בוחרים קבוצות קיימות או רשימות תפוצה, שולחים בזמן הנכון ומנהלים קמפיינים ותבניות ישירות דרך הבוט של Possbo.',
    seoTitle: 'שליחת קמפיינים לקבוצות ותפוצות WhatsApp | Possbo',
    seoDescription: 'צרו ותזמנו קמפיינים לקבוצות ולרשימות תפוצה ב-WhatsApp ונהלו קמפיינים ותבניות דרך צ׳אטבוט חכם.',
    image: '/landing/possbo-dashboard-real.webp',
    features: ['שליחה לקבוצות WhatsApp קיימות', 'יצירת וניהול רשימות תפוצה', 'תזמון חד־פעמי ומחזורי', 'יצירת קמפיין מתוך שיחת WhatsApp', 'שמירת קמפיין כתבנית מהצ׳אט', 'בדיקת סטטוס קמפיינים מהטלפון'],
    steps: [['מסנכרנים', 'מחברים את WhatsApp וטוענים קבוצות ותפוצות.'], ['בוחרים', 'מסמנים יעדים ומגדירים מועד שליחה.'], ['מנהלים', 'ממשיכים לנהל ולבדוק סטטוס דרך הצ׳אטבוט.']],
    faq: [['האם אפשר לשלוח גם לקבוצות?', 'כן. Possbo תומכת בקבוצות קיימות וברשימות תפוצה שנוצרו במערכת.'], ['הבוט משמש רק לתמיכה?', 'לא. הבוט מאפשר ליצור קמפיינים, לעבוד עם תבניות ולבדוק סטטוסים.']],
  },
  ai: {
    path: '/ai-social-post-generator',
    eyebrow: 'יצירת תוכן עם AI',
    title: 'מבריף קצר לפוסט שלם שמוכן לצאת לכל הערוצים',
    description: 'מספרים ל-Possbo מה מפרסמים, למי ובאיזה סגנון — ומקבלים טקסט שיווקי מלא שאפשר לערוך, לשמור כתבנית ולהפיץ.',
    seoTitle: 'יצירת פוסט שיווקי עם AI בעברית | Possbo',
    seoDescription: 'צרו פוסט שיווקי מלא בעברית בעזרת AI, התאימו טון, קהל וקריאה לפעולה והמשיכו ישירות לקמפיין רב-ערוצי.',
    image: '/landing/possbo-create-real.webp',
    features: ['בחירת סוג פוסט ומטרת הקמפיין', 'הגדרת קהל יעד וטון כתיבה', 'קריאה לפעולה ופרטי קשר', 'יצירת טקסט שיווקי מלא בעברית', 'עריכה לפני הפרסום', 'שמירה כתבנית והפצה לכל הפלטפורמות'],
    steps: [['מתדרכים', 'מגדירים מוצר, קהל, יתרון וטון.'], ['מייצרים', 'ה-AI בונה פוסט שלם עם מסר וקריאה לפעולה.'], ['מפרסמים', 'עורכים וממשיכים ישר לבחירת הערוצים והתזמון.']],
    faq: [['אפשר לערוך את התוצאה?', 'כן. התוכן נשאר בשליטתכם ואפשר לערוך אותו לפני שממשיכים לפרסום.'], ['האם אפשר לשמור לשימוש חוזר?', 'כן. אפשר לשמור את התוכן והגדרות הקמפיין כתבנית.']],
  },
}

export default function MarketingSolution({ type }) {
  const page = SOLUTIONS[type]
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `Possbo — ${page.eyebrow}`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: page.seoDescription,
    url: `https://possbo.com${page.path}`,
  }

  return (
    <div className="solution-page">
      <Seo title={page.seoTitle} description={page.seoDescription} path={page.path} image={page.image} schema={schema} />
      <nav className="solution-nav">
        <Link to="/" className="solution-logo"><BrandLogo decorative /><b>ossbo</b></Link>
        <div><Link to="/">דף הבית</Link><Link to="/login">כניסה</Link><Link className="solution-nav-cta" to="/register">פתיחת חשבון</Link></div>
      </nav>

      <main>
        <header className="solution-hero">
          <div>
            <span><Sparkles /> {page.eyebrow}</span>
            <h1>{page.title}</h1>
            <p>{page.description}</p>
            <div className="solution-actions"><Link to="/register">מתחילים לעבוד <ArrowLeft /></Link><Link to="/#product-demo">צפו בהדגמה</Link></div>
          </div>
          <figure><img src={page.image} alt={`מסך ${page.eyebrow} במערכת Possbo`} /></figure>
        </header>

        <section className="solution-feature-section">
          <div className="solution-heading"><small>כל מה שצריך בתהליך אחד</small><h2>פחות עבודה ידנית. יותר שליטה בתוצאה.</h2></div>
          <div className="solution-feature-grid">{page.features.map(feature => <article key={feature}><Check /><span>{feature}</span></article>)}</div>
        </section>

        <section className="solution-steps">
          <div className="solution-heading"><small>איך זה עובד</small><h2>שלושה צעדים מהרעיון לקמפיין</h2></div>
          <div>{page.steps.map(([title, text], index) => <article key={title}><b>0{index + 1}</b><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="solution-faq">
          <div className="solution-heading"><small>שאלות נפוצות</small><h2>תשובות לפני שמתחילים</h2></div>
          {page.faq.map(([question, answer]) => <article key={question}><h3>{question}</h3><p>{answer}</p></article>)}
        </section>

        <section className="solution-final">
          <span>Possbo מחברת את כל הערוצים</span>
          <h2>לא משנה מאיזה ערוץ מתחילים — הכול נשאר בקמפיין אחד.</h2>
          <Link to="/register">יצירת קמפיין ראשון <ArrowLeft /></Link>
        </section>
      </main>
      <footer><Link to="/">Possbo</Link><span>© {new Date().getFullYear()}</span><Link to="/contact">יצירת קשר</Link></footer>
    </div>
  )
}
