import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, Clock3 } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import Seo from '../components/Seo'
import '../styles/resources.css'

const ARTICLES = {
  'publish-to-facebook-groups': {
    title: 'איך לפרסם פוסט במספר קבוצות Facebook בצורה מסודרת',
    description: 'מדריך לבחירת קבוצות, התאמת תוכן, תזמון ומעקב אחר פרסום במספר קבוצות Facebook בלי לאבד שליטה.',
    time: '7 דקות',
    sections: [
      ['למה פרסום ידני הופך מהר לבעיה', 'ככל שמספר הקבוצות גדל, קשה לזכור איפה כבר פורסם, מתי מותר לפרסם שוב ואיזה נוסח קיבל תגובות. תהליך מסודר מתחיל ברשימת יעדים קבועה ובהיסטוריה אחת לכל הקמפיין.'],
      ['בוחרים קבוצות לפי התאמה ולא רק לפי גודל', 'קבוצה גדולה אינה בהכרח קבוצה יעילה. בדקו את נושא הקבוצה, האזור הגאוגרפי, כללי הפרסום ורמת הפעילות. חלקו קבוצות לקהלים ושמרו את הבחירה כתבנית.'],
      ['מתאימים את הפוסט לקהילה', 'כתבו כותרת ברורה, פסקאות קצרות וקריאה אחת לפעולה. הימנעו מהפצה אגרסיבית של נוסח זהה בפרק זמן קצר והקפידו על כללי כל קבוצה.'],
      ['מתזמנים ושומרים תיעוד', 'קבעו מועדים הגיוניים, שמרו קישור לכל פרסום ובדקו אילו קבוצות יצרו תגובות ושיתופים. הנתונים האלה צריכים להשפיע על הקמפיין הבא.'],
    ],
    related: '/facebook-groups-automation',
    relatedLabel: 'לפרסום אוטומטי בקבוצות Facebook',
  },
  'whatsapp-broadcast-guide': {
    title: 'קבוצת WhatsApp או רשימת תפוצה: מה מתאים לקמפיין שלכם?',
    description: 'ההבדלים בין קבוצות ורשימות תפוצה ב-WhatsApp, מתי להשתמש בכל אפשרות ואיך לתכנן שליחה מועילה ולא מציפה.',
    time: '6 דקות',
    sections: [
      ['קבוצה יוצרת שיחה משותפת', 'בקבוצה המשתתפים רואים זה את זה ויכולים להגיב לכולם. היא מתאימה לקהילה, עדכונים משותפים ושיח מתמשך.'],
      ['רשימת תפוצה מתאימה לעדכון אישי', 'הודעת תפוצה נשלחת לכל נמען בנפרד ומתאימה לעדכונים, מבצעים ותוכן שהתגובה עליו צריכה להגיע ישירות לעסק.'],
      ['התאמה, הסכמה ותדירות', 'שלחו רק לקהל רלוונטי ובהסכמה, הסבירו מה מקבלים ושמרו על תדירות סבירה. הודעה טובה קצרה, שימושית ומכילה פעולה ברורה אחת.'],
      ['מודדים מעבר לשליחה', 'הגדירו מראש מהי הצלחה: תגובה, כניסה לקישור, הרשמה או רכישה. נהלו את היעדים והתזמון כחלק מהקמפיין ולא כרשימת מספרים מנותקת.'],
    ],
    related: '/whatsapp-campaigns',
    relatedLabel: 'לניהול קמפיינים ב-WhatsApp',
  },
  'ai-marketing-post': {
    title: 'איך ליצור פוסט שיווקי עם AI בלי לאבד את הקול של העסק',
    description: 'כך בונים בריף נכון ל-AI, מגדירים קהל וטון, עורכים את התוצאה והופכים אותה לפוסט שיווקי אמין.',
    time: '8 דקות',
    sections: [
      ['AI טוב מתחיל בבריף טוב', 'ציינו מה מציעים, למי, מה היתרון האמיתי ומה הקורא צריך לעשות. ככל שהקלט ממוקד יותר, התוצאה תהיה פחות כללית.'],
      ['מגדירים טון ולא רק נושא', 'בחרו אם התוכן מקצועי, ישיר, חברי או מעורר השראה. הוסיפו דוגמאות למילים שבהן העסק משתמש ולמילים שעדיף להימנע מהן.'],
      ['עורכים עובדות והבטחות', 'בדקו מחירים, תאריכים, מספרים וקישורים. הסירו הבטחות מוגזמות והתאימו את אורך הפוסט לפלטפורמה ולקהל.'],
      ['שומרים את מה שעבד', 'כאשר מוצאים מבנה מוצלח, שמרו אותו כתבנית. כך הקמפיין הבא מתחיל מבסיס עקבי ועדיין נשאר מותאם למטרה החדשה.'],
    ],
    related: '/ai-social-post-generator',
    relatedLabel: 'ליצירת פוסט מלא עם Possbo AI',
  },
}

function ResourceLayout({ children }) {
  return (
    <div className="resources-page">
      <nav><Link to="/" className="resources-logo"><BrandLogo decorative /><b>ossbo</b></Link><div><Link to="/resources">מרכז הידע</Link><Link to="/login">כניסה</Link><Link to="/register">פתיחת חשבון</Link></div></nav>
      {children}
      <footer><Link to="/">Possbo</Link><Link to="/resources">כל המדריכים</Link><Link to="/contact">יצירת קשר</Link></footer>
    </div>
  )
}

export function ResourcesIndex() {
  const description = 'מדריכים מעשיים לפרסום, תזמון ומדידה ב-Facebook, Instagram ו-WhatsApp וליצירת תוכן שיווקי באמצעות AI.'
  return (
    <ResourceLayout>
      <Seo title="מדריכים לשיווק ופרסום ברשתות חברתיות | Possbo" description={description} path="/resources" schema={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'מרכז הידע של Possbo', description }} />
      <main className="resources-index">
        <header><span><BookOpen /> מרכז הידע של Possbo</span><h1>עובדים חכם יותר<br />בכל ערוץ.</h1><p>{description}</p></header>
        <section>{Object.entries(ARTICLES).map(([slug, article]) => <Link to={`/resources/${slug}`} key={slug}><small><Clock3 /> {article.time}</small><h2>{article.title}</h2><p>{article.description}</p><span>לקריאת המדריך <ArrowLeft /></span></Link>)}</section>
      </main>
    </ResourceLayout>
  )
}

export function ResourceArticle() {
  const { slug } = useParams()
  const article = ARTICLES[slug]
  if (!article) return <ResourceLayout><main className="resource-article"><h1>המדריך לא נמצא</h1><Link to="/resources">חזרה למרכז הידע</Link></main></ResourceLayout>
  const path = `/resources/${slug}`
  const schema = { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.description, inLanguage: 'he', author: { '@type': 'Organization', name: 'Possbo' }, publisher: { '@type': 'Organization', name: 'Possbo' }, mainEntityOfPage: `https://possbo.com${path}` }
  return (
    <ResourceLayout>
      <Seo title={`${article.title} | Possbo`} description={article.description} path={path} type="article" schema={schema} />
      <main className="resource-article">
        <header><Link to="/resources">מרכז הידע</Link><small><Clock3 /> זמן קריאה: {article.time}</small><h1>{article.title}</h1><p>{article.description}</p></header>
        <div className="article-body">{article.sections.map(([title, text], index) => <section key={title}><span>0{index + 1}</span><div><h2>{title}</h2><p>{text}</p></div></section>)}</div>
        <aside><span>רוצים להפוך את המדריך לתהליך עבודה?</span><h2>{article.relatedLabel}</h2><Link to={article.related}>לכל היכולות <ArrowLeft /></Link></aside>
      </main>
    </ResourceLayout>
  )
}
