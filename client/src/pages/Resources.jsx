import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, BookOpen, Bot, CalendarDays, Camera, CheckCircle2,
  Clock3, MessageCircle, Sparkles, Users,
} from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import Seo from '../components/Seo'
import '../styles/resources.css'

const SOURCES = {
  googleHelpful: ['Google Search Central - יצירת תוכן מועיל ואמין', 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content'],
  googleSeo: ['Google Search Central - מדריך SEO למתחילים', 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide'],
  facebookSchedule: ['מרכז העזרה של Facebook - תזמון וניהול פוסטים', 'https://www.facebook.com/help/389849807718635'],
  facebookGroups: ['מרכז העזרה של Facebook - פרסום בקבוצות', 'https://www.facebook.com/help/messenger-app/232426073439303/'],
  facebookSpam: ['מרכז העזרה של Facebook - ניהול ספאם בקבוצות', 'https://www.facebook.com/help/938172370267447/'],
  instagram: ['מרכז העזרה הרשמי של Instagram', 'https://www.facebook.com/help/instagram'],
  whatsapp: ['תיעוד WhatsApp Business Platform', 'https://developers.facebook.com/docs/whatsapp/overview'],
}

const ARTICLES = {
  'publish-to-facebook-groups': {
    category: 'Facebook',
    Icon: Users,
    title: 'איך לפרסם פוסט במספר קבוצות Facebook בצורה מסודרת',
    description: 'תהליך מעשי לבחירת קבוצות, התאמת המסר, תזמון ומעקב אחר פרסום בקבוצות בלי להפוך את הפעילות לספאם.',
    time: '7 דקות',
    updated: '30 ביולי 2026',
    accent: 'facebook',
    sections: [
      ['מתחילים ממפת קהלים ולא מרשימת קבוצות', 'רשמו למי כל קבוצה מיועדת, באיזה אזור היא פועלת ומה מותר לפרסם בה. קבוצה גדולה אינה בהכרח מתאימה יותר. קבוצה ממוקדת שבה הקהל מחפש פתרון כמו שלכם עשויה לייצר תגובות איכותיות יותר.'],
      ['קוראים את כללי הקבוצה לפני שמפרסמים', 'מנהלי קבוצות יכולים לקבוע כללי פרסום, לדרוש אישור מוקדם ואף להגביל פעילות. בדקו אם מותר לפרסם קישור, באילו ימים מותר תוכן עסקי והאם נדרש נוסח מסוים. שמירת הכללים לצד שם הקבוצה חוסכת טעויות בקמפיין הבא.'],
      ['מתאימים את הפתיחה לקהילה', 'אל תפיצו נוסח זהה לכל מקום. שמרו על ההצעה המרכזית, אבל התאימו את המשפט הראשון, הדוגמה והקריאה לפעולה לקהל של כל קבוצה. כתבו בפסקאות קצרות והסבירו מה הערך לפני שאתם מבקשים מהקורא לפעול.'],
      ['פורסים את הפרסום ועוקבים אחר התוצאות', 'אל תפרסמו בעשרות קבוצות ברגע אחד. בנו חלונות זמן, תעדו היכן פורסם וסמנו פוסטים שממתינים לאישור. לאחר מכן השוו תגובות, פניות וקליקים כדי להבין אילו קבוצות ונוסחים מצדיקים פעילות חוזרת.'],
      ['צ checklist לפני פרסום', 'ודאו שהקבוצה רלוונטית, שהנוסח עומד בכללים, שהתמונה תקינה, שהקישור מוביל לעמוד הנכון ושיש דרך למדוד את התוצאה. אם אחד הסעיפים חסר, עדיף לתקן לפני ההפצה.'],
    ],
    sources: [SOURCES.facebookGroups, SOURCES.facebookSpam],
    related: '/facebook-groups-automation',
    relatedLabel: 'לפרסום מסודר בקבוצות Facebook',
  },
  'instagram-content-scheduling': {
    category: 'Instagram',
    Icon: Camera,
    title: 'תזמון פוסטים באינסטגרם: איך בונים שבוע תוכן מראש',
    description: 'מדריך לבניית תמהיל פוסטים, סטוריז ורילס, בחירת מועדי פרסום ושמירה על מקום לתוכן עדכני.',
    time: '8 דקות',
    updated: '30 ביולי 2026',
    accent: 'instagram',
    sections: [
      ['מגדירים מטרה אחת לכל פרסום', 'לפני שבוחרים פורמט, מחליטים אם מטרת התוכן היא היכרות, מעורבות, פנייה או מכירה. מטרה ברורה עוזרת לבחור מסר וקריאה לפעולה ואינה מעמיסה על הפוסט כמה בקשות שונות.'],
      ['בונים תמהיל במקום רצף של מבצעים', 'שלבו תוכן שמסביר, מדגים, עונה על שאלה, מציג תהליך ומזמין לפעולה. פיד שמכיל רק הצעות מכירה מתקשה לבנות אמון. אפשר לחזור על נושא חשוב בפורמט אחר במקום להמציא נושא חדש בכל יום.'],
      ['מתזמנים בסיס ומשאירים מקום למציאות', 'הכינו מראש את התוכן הקבוע של השבוע, אך השאירו חלון לעדכון, תגובה לאירוע או תוכן מהשטח. עברו על התצוגה השבועית לפני האישור כדי למנוע שני מסרים דומים באותו יום.'],
      ['מתאימים את התוכן לפורמט', 'פוסט מתאים להסבר שנשאר בפרופיל, סטורי מתאים לעדכון קצר ולשיחה ורילס מתאים להדגמה חזותית. אל תעתיקו את אותו נכס לכל פורמט בלי לבדוק יחס תמונה, אורך וקריאות במסך קטן.'],
      ['משפרים לפי התנהגות ולא לפי תחושת בטן', 'בדקו שמירות, שיתופים, תגובות, ביקורים בפרופיל ופניות בהתאם למטרה שהגדרתם. השוו תוכן בעל מטרה דומה לאורך כמה שבועות ורק אז שנו את התמהיל או את זמני הפרסום.'],
    ],
    sources: [SOURCES.instagram, SOURCES.facebookSchedule],
    related: '/instagram-scheduling',
    relatedLabel: 'לתזמון תוכן באינסטגרם',
  },
  'whatsapp-broadcast-guide': {
    category: 'WhatsApp',
    Icon: MessageCircle,
    title: 'קבוצת WhatsApp או רשימת תפוצה: מה מתאים לקמפיין שלכם?',
    description: 'ההבדלים בין שיחה קבוצתית להפצה אישית, ואיך לתכנן הודעה רלוונטית שאינה מציפה את הלקוחות.',
    time: '6 דקות',
    updated: '30 ביולי 2026',
    accent: 'whatsapp',
    sections: [
      ['קבוצה נועדה לשיחה משותפת', 'בקבוצה המשתתפים רואים את השיחה ויכולים להגיב לכולם. היא מתאימה לקהילה, למחזור לימוד, לעדכונים משותפים או למקום שבו השיחה בין המשתתפים היא חלק מהערך.'],
      ['הפצה מתאימה לעדכון אישי', 'כאשר המסר צריך להגיע לכל אדם בנפרד, רשימת תפוצה מתאימה יותר. היא יכולה לשמש לעדכון, תזכורת או הצעה, בתנאי שהנמען ביקש לקבל את ההודעות ויודע מי שולח אותן.'],
      ['הסכמה ורלוונטיות קודמות לכמות', 'הגדירו כיצד מצטרפים, איזה תוכן יישלח ובאיזו תדירות. שמרו קהלים לפי עניין במקום לשלוח כל הודעה לכל אנשי הקשר. אפשרות פשוטה להסרת הסכמה מחזקת אמון ומפחיתה תלונות.'],
      ['כותבים הודעה שאפשר להבין במהירות', 'פתחו בסיבה לפנייה, הציגו ערך אחד וסיימו בפעולה אחת. השתמשו בקישור ברור והימנעו מרצף ארוך של הודעות. לפני השליחה בדקו איך הטקסט והתמונה נראים בטלפון.'],
      ['מודדים תוצאה עסקית', 'הצלחה אינה מספר ההודעות שנשלחו. הגדירו אם אתם מודדים תשובה, לחיצה, הרשמה, פגישה או רכישה, והשתמשו בתוצאה כדי לשפר את הקהל, הנוסח והתזמון בפעם הבאה.'],
    ],
    sources: [SOURCES.whatsapp],
    related: '/whatsapp-campaigns',
    relatedLabel: 'לניהול קמפיינים ב-WhatsApp',
  },
  'ai-marketing-post': {
    category: 'AI ותוכן',
    Icon: Sparkles,
    title: 'איך ליצור פוסט שיווקי עם AI בלי לאבד את הקול של העסק',
    description: 'כך בונים בריף מדויק, מגדירים קהל וטון, בודקים עובדות והופכים טיוטת AI לתוכן ששייך באמת לעסק.',
    time: '8 דקות',
    updated: '30 ביולי 2026',
    accent: 'ai',
    sections: [
      ['נותנים הקשר לפני שמבקשים טקסט', 'בריף טוב כולל את ההצעה, הקהל, הבעיה, היתרון המוכח, הפלטפורמה והפעולה הרצויה. הוסיפו מגבלות חשובות ודוגמה קצרה לסגנון הקיים של העסק.'],
      ['מבקשים מבנה ולא קסם', 'בקשו כמה כיווני פתיחה, גוף קצר וקריאה לפעולה. עדיף לייצר שתי חלופות ממוקדות ולבחור ביניהן מאשר לבקש טקסט ארוך וכללי ולפרסם אותו כפי שהוא.'],
      ['עורכים את הטיוטה בקול אנושי', 'החליפו ביטויים שאינכם משתמשים בהם, הוסיפו פרט אמיתי מהעסק וקצרו חזרות. קראו את הפוסט בקול. אם הוא לא נשמע כמו שיחה שהייתם מנהלים עם לקוח, המשיכו לערוך.'],
      ['בודקים כל טענה ועובדה', 'כלי AI עלול לטעות. אמתו מחירים, תאריכים, נתונים, תנאים וקישורים. אל תפרסמו הבטחה שאי אפשר להוכיח ואל תעלו תוכן רגיש בלי בדיקה מקצועית מתאימה.'],
      ['שומרים תבנית של מה שעבד', 'אחרי הפרסום בדקו את התוצאה מול המטרה. שמרו את מבנה הבריף, הטון והקריאה לפעולה של תוכן מוצלח כתבנית, אבל עדכנו את הדוגמאות והערך בכל קמפיין.'],
    ],
    sources: [SOURCES.googleHelpful],
    related: '/ai-social-post-generator',
    relatedLabel: 'ליצירת פוסט עם Possbo AI',
  },
  'social-media-content-calendar': {
    category: 'תכנון ותזמון',
    Icon: CalendarDays,
    title: 'איך בונים לוח תוכן חודשי לרשתות חברתיות',
    description: 'שיטה פשוטה להפוך מטרות עסקיות ללוח שבועי וחודשי שמשלב תוכן, פלטפורמות, מועדים ואחריות.',
    time: '9 דקות',
    updated: '30 ביולי 2026',
    accent: 'calendar',
    sections: [
      ['מתחילים מאירועים ומטרות', 'סמנו השקות, מועדים, מבצעים ואירועים עסקיים. ליד כל אחד הגדירו תוצאה רצויה. כך הלוח נבנה סביב צרכים אמיתיים ולא סביב הצורך למלא משבצות.'],
      ['יוצרים עמודי תוכן קבועים', 'בחרו שלושה עד חמישה נושאים שהעסק יכול ללמד או להדגים לאורך זמן. לדוגמה: שאלות לקוחות, מאחורי הקלעים, מקרי שימוש, טעויות נפוצות והצעות מסחריות.'],
      ['מתאימים ערוץ לכל מסר', 'אותו רעיון יכול לקבל גרסה שונה בכל פלטפורמה. החליטו מראש היכן הוא מתפרסם, באיזה פורמט ומה הפעולה הרצויה. כך נמנעת העתקה עיוורת בין ערוצים.'],
      ['עובדים בשתי תצוגות', 'בתצוגה חודשית בודקים איזון, עומס וקצב. בתצוגה שבועית בודקים שעות, נכסים וחפיפות. מעבר קבוע בין השתיים עוזר לראות גם את האסטרטגיה וגם את הביצוע.'],
      ['קובעים זמן לבקרה', 'פעם בשבוע עברו על מה שפורסם, מה נדחה ומה דורש תגובה. פעם בחודש השוו בין סוגי תוכן ועדכנו את הלוח הבא לפי התוצאות ולא רק לפי ההרגל.'],
    ],
    sources: [SOURCES.facebookSchedule, SOURCES.googleHelpful],
    related: '/register',
    relatedLabel: 'לבניית יומן תוכן אחד לכל הערוצים',
  },
  'campaign-performance-metrics': {
    category: 'דוחות',
    Icon: BarChart3,
    title: 'אילו נתונים באמת חשובים בדוח קמפיין ברשתות חברתיות?',
    description: 'דרך ברורה לבחור מדדים לפי מטרה, להפריד בין חשיפה לתוצאה ולהפיק החלטה מעשית מהדוח.',
    time: '8 דקות',
    updated: '30 ביולי 2026',
    accent: 'reports',
    sections: [
      ['מתחילים בשאלה עסקית', 'לפני פתיחת הדוח שאלו מה רציתם להשיג: מודעות, מעורבות, פניות או מכירות. ללא מטרה גם מספר גדול נראה מרשים, אך לא ברור אם הוא מקדם את העסק.'],
      ['מבדילים בין חשיפה לפעולה', 'חשיפות וטווח הגעה מספרים כמה אנשים יכלו לראות את התוכן. תגובות, שמירות ושיתופים מעידים על עניין. קליקים, לידים ורכישות מודדים התקדמות עסקית. אל תחליפו קבוצה אחת באחרת.'],
      ['משווים דברים דומים', 'השוו קמפיינים בעלי מטרה, קהל, תקופה ותקציב דומים. פוסט הסבר אינו צריך להימדד בדיוק כמו הצעת מכירה. תעדו גם שינויי תוכן ותזמון כדי להבין מה השפיע.'],
      ['מחפשים יחס ולא רק מספר', 'בדקו את שיעור הפעולה מתוך החשיפה או הקליקים, ולא רק את הכמות הכוללת. היחס עוזר להשוות בין קמפיין גדול לקטן ומבליט היכן המסר או דף היעד דורשים שיפור.'],
      ['מסיימים בהחלטה אחת', 'דוח טוב צריך להוביל לפעולה: לשמור על פורמט, לחדד קהל, לשנות פתיחה, לבדוק זמן אחר או לעצור פעילות לא יעילה. רשמו את ההחלטה ליד הנתונים ובדקו אותה בקמפיין הבא.'],
    ],
    sources: [SOURCES.googleHelpful],
    related: '/register',
    relatedLabel: 'לריכוז הדוחות והקמפיינים במקום אחד',
  },
}

const articleEntries = Object.entries(ARTICLES)

function ResourceLayout({ children }) {
  return (
    <div className="resources-page">
      <nav>
        <Link to="/" className="resources-logo"><BrandLogo decorative /><b>ossbo</b></Link>
        <div><Link to="/">דף הבית</Link><Link to="/resources">כל המדריכים</Link><Link to="/login">כניסה</Link><Link to="/register">בואו נצא לדרך</Link></div>
      </nav>
      {children}
      <footer className="resources-footer">
        <div className="resources-footer-brand">
          <span className="resources-footer-lockup"><BrandLogo decorative /><b>ossbo</b></span>
          <span className="resources-footer-tagline">כל הזכויות שמורות ל-Possbo</span>
        </div>
        <nav className="resources-footer-links" aria-label="קישורים נוספים">
          <Link to="/facebook-groups-automation">Facebook</Link>
          <Link to="/instagram-scheduling">Instagram</Link>
          <Link to="/whatsapp-campaigns">WhatsApp</Link>
          <Link to="/ai-social-post-generator">AI</Link>
          <Link to="/resources">מדריכים</Link>
          <Link to="/privacy">פרטיות</Link>
          <Link to="/accessibility-statement">נגישות</Link>
          <Link to="/contact">יצירת קשר</Link>
        </nav>
        <small className="resources-footer-copyright">© {new Date().getFullYear()} Possbo</small>
      </footer>
    </div>
  )
}

function AiDisclosure() {
  return (
    <div className="resources-ai-disclosure">
      <Bot size={18} />
      <p><b>גילוי נאות:</b> המידע בעמוד זה נוסח באמצעות בוט AI עבור Possbo. העובדות נבדקו מול המקורות הרשמיים שמופיעים במאמר, אך פלטפורמות עשויות לשנות תכונות וכללים.</p>
    </div>
  )
}

export function ResourcesIndex() {
  const description = 'מדריכים מעשיים לפרסום, תזמון, יצירת תוכן ומדידה ב-Facebook, Instagram ו-WhatsApp, עם דוגמאות ותהליכי עבודה ברורים.'
  return (
    <ResourceLayout>
      <Seo title="מדריכים לשיווק ופרסום ברשתות חברתיות | Possbo" description={description} path="/resources" schema={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'מרכז הידע של Possbo', description }} />
      <main className="resources-index">
        <header>
          <span><BookOpen size={17} /> מרכז הידע של Possbo</span>
          <h1>פחות ניחושים.<br />יותר שיווק שעובד.</h1>
          <p>{description}</p>
          <div><CheckCircle2 /> תוכן מקורי ומעשי <CheckCircle2 /> מקורות רשמיים <CheckCircle2 /> מותאם לעסקים</div>
        </header>
        <section className="resources-grid">
          {articleEntries.map(([slug, article], index) => {
            const Icon = article.Icon
            return (
              <Link className={`resource-card resource-card-${article.accent} ${index === 0 ? 'featured' : ''}`} to={`/resources/${slug}`} key={slug}>
                <div className="resource-card-top"><i><Icon size={18} /></i><small><Clock3 size={14} /> {article.time}</small></div>
                <span>{article.category}</span>
                <h2>{article.title}</h2>
                <p>{article.description}</p>
                <b>לקריאת המדריך <ArrowLeft size={15} /></b>
              </Link>
            )
          })}
        </section>
        <AiDisclosure />
      </main>
    </ResourceLayout>
  )
}

export function ResourceArticle() {
  const { slug } = useParams()
  const article = ARTICLES[slug]
  if (!article) return <ResourceLayout><main className="resource-missing"><h1>המדריך לא נמצא</h1><Link to="/resources">חזרה למרכז הידע</Link></main></ResourceLayout>
  const path = `/resources/${slug}`
  const schema = {
    '@context': 'https://schema.org', '@type': 'Article', headline: article.title,
    description: article.description, inLanguage: 'he', dateModified: '2026-07-30',
    author: { '@type': 'Organization', name: 'Possbo' },
    publisher: { '@type': 'Organization', name: 'Possbo' },
    mainEntityOfPage: `https://possbo.com${path}`,
  }
  const relatedArticles = articleEntries.filter(([key]) => key !== slug).slice(0, 3)
  return (
    <ResourceLayout>
      <Seo title={`${article.title} | Possbo`} description={article.description} path={path} type="article" schema={schema} />
      <main className="resource-article">
        <header>
          <div className="resource-article-nav">
            <span>{article.category}</span>
            <Link to="/resources">כל המדריכים <ArrowLeft size={14} /></Link>
          </div>
          <h1>{article.title}</h1>
          <p>{article.description}</p>
          <div><small><Clock3 size={15} /> זמן קריאה: {article.time}</small><small>עודכן: {article.updated}</small></div>
        </header>
        <AiDisclosure />
        <div className="article-layout">
          <nav aria-label="תוכן המדריך">
            <b>במדריך הזה</b>
            {article.sections.map(([title], index) => <a href={`#part-${index + 1}`} key={title}><span>0{index + 1}</span>{title}</a>)}
          </nav>
          <article className="article-body">
            {article.sections.map(([title, text], index) => (
              <section id={`part-${index + 1}`} key={title}>
                <span>0{index + 1}</span><h2>{title}</h2><p>{text}</p>
              </section>
            ))}
            <section className="article-sources">
              <h2>מקורות והמשך קריאה</h2>
              <p>המאמר נכתב בניסוח מקורי. המקורות הבאים שימשו לאימות מידע ועשויים להתעדכן על ידי הפלטפורמות:</p>
              {article.sources.map(([label, url]) => <a href={url} target="_blank" rel="noreferrer" key={url}>{label} <ArrowLeft size={14} /></a>)}
            </section>
          </article>
        </div>
        <aside className="resource-cta"><span>רוצים להפוך את המדריך לתהליך עבודה?</span><h2>{article.relatedLabel}</h2><Link to={article.related}>לכל היכולות <ArrowLeft size={16} /></Link></aside>
        <section className="related-guides"><h2>מדריכים נוספים</h2><div>{relatedArticles.map(([key, item]) => <Link to={`/resources/${key}`} key={key}><small>{item.category}</small><b>{item.title}</b><span>לקריאה <ArrowLeft size={14} /></span></Link>)}</div></section>
      </main>
    </ResourceLayout>
  )
}
