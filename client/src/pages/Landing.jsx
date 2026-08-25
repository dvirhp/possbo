import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, BookOpen, CalendarDays, Check, ChevronDown, CircleHelp, Clock3,
  Bot, CreditCard, Globe2, Grid2X2, Layers3, Menu, Moon, PencilLine, ShieldCheck, Zap,
  Maximize2, MousePointer2, Play, Sparkles, Sun, Users,
  X,
} from 'lucide-react'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import LandingChatBot from '../components/LandingChatBot'
import BrandLogo from '../components/BrandLogo'
import Seo from '../components/Seo'
import '../styles/landing.css'

function FacebookLogo({ size = 20, className = '', ...props }) {
  return (
    <svg className={`platform-logo ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M13.7 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5H17V3.6c-.8-.1-1.6-.2-2.4-.2-2.4 0-4.1 1.5-4.1 4.2v2.3H7.8V13h2.7v8h3.2Z" />
    </svg>
  )
}

function InstagramLogo({ size = 20, className = '', ...props }) {
  return (
    <svg className={`platform-logo ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="17.4" cy="6.7" r="1.15" fill="currentColor" />
    </svg>
  )
}

function WhatsAppLogo({ size = 20, className = '', ...props }) {
  return (
    <svg className={`platform-logo ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M20.5 11.7a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.4-4.4a8.4 8.4 0 1 1 15.6-4.4Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 7.7c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.7.8c-.2.2-.1.4 0 .6.7 1.3 1.7 2.3 3 2.9.3.1.5.2.7 0l.9-1.1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.5 0 .3-.1 1.3-.8 1.9-.6.6-1.5.8-2.2.6-1.1-.2-2.6-.8-4.3-2.3-1.4-1.2-2.4-2.7-2.7-3.8-.4-1.1-.1-2.5.7-3.3Z" fill="currentColor" />
    </svg>
  )
}

const getLandingSchema = () => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://possbo.com/#organization',
      name: 'Possbo',
      url: 'https://possbo.com/',
      logo: 'https://possbo.com/brand/possbo-favicon-light-v5.png',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Possbo',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'he',
      description: 'מערכת ליצירה, תזמון, הפצה ומדידה של קמפיינים בפייסבוק, אינסטגרם ווואטסאפ.',
      featureList: [
        'פרסום בקבוצות ובפרופיל Facebook',
        'פרסום פוסטים, סטורי ורילס ב-Instagram',
        'שליחה לקבוצות ורשימות תפוצה ב-WhatsApp',
        'יצירת תוכן באמצעות AI',
        'תזמון קמפיינים ודוחות ביצועים',
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
    {
      '@type': 'VideoObject',
      name: 'יצירת קמפיין רב-ערוצי ב-Possbo',
      description: 'הדגמה מלאה של יצירת תוכן עם AI, בחירת פלטפורמות ותזמון קמפיין.',
      thumbnailUrl: 'https://possbo.com/landing/possbo-create-real.webp',
      contentUrl: 'https://possbo.com/landing/video/possbo-full-campaign-demo.webm',
      uploadDate: '2026-07-29',
      duration: 'PT1M9S',
    },
  ],
})

const FAQ = [
  ['אילו פלטפורמות אפשר לחבר ולנהל?', 'Possbo מרכזת במקום אחד את Facebook, Instagram ו-WhatsApp. לכל פלטפורמה בוחרים את היעדים המתאימים לה, למשל קבוצות ופרופיל בפייסבוק, פוסטים, סטוריז ורילס באינסטגרם, וקבוצות או רשימות תפוצה בוואטסאפ. לאחר החיבור הראשוני אין צורך לעבור בין מערכות כדי לנהל כל קמפיין.'],
  ['האם אפשר לתזמן פרסומים וקמפיינים חוזרים?', 'כן. אפשר לפרסם מיד, לקבוע מועד חד-פעמי או ליצור סדרת פרסומים חוזרת לפי ימים, שעות וטווח תאריכים. הלוח השבועי והחודשי מרכזים את כל המועדים ומציגים בבירור מה מתוזמן, מה כבר פורסם ומה דורש טיפול.'],
  ['איך עוקבים אחרי תוצאות הפרסום?', 'הדשבורד והדוחות מרכזים את היסטוריית הפרסומים ואת מצבם, כולל פרסומים שהושלמו, ממתינים או נכשלו. בהתאם לנתונים הזמינים מהפלטפורמה המחוברת ניתן לראות גם מדדי חשיפה ומעורבות, להשוות בין קמפיינים ולזהות אילו תכנים עובדים טוב יותר.'],
  ['אפשר לשמור קמפיין או תוכן לשימוש חוזר?', 'כן. אפשר לשמור כתבניות קמפיינים, נוסחים ומבני תוכן שחוזרים בעסק. בפעם הבאה בוחרים תבנית קיימת, מעדכנים רק את הפרטים הרלוונטיים ומפרסמים או מתזמנים מחדש, בלי להתחיל את כל התהליך מאפס.'],
  ['איך יצירת התוכן באמצעות AI עובדת?', 'מתחילים מבריף קצר שכולל את מטרת הקמפיין, הקהל והמסר הרצוי. Possbo AI מציעה נוסח שאפשר לערוך, לדייק ולהתאים לערוץ הפרסום. השליטה נשארת אצלכם: בודקים את התוצאה, משנים לפי הצורך ורק אז בוחרים היכן ומתי לפרסם.'],
  ['האם אפשר לפרסם תוכן שונה בכל פלטפורמה?', 'כן. ניתן להתחיל מקמפיין אחד ולהתאים לכל ערוץ את הנוסח, המדיה, הפורמט ומועד הפרסום שלו. כך שומרים על מסר אחיד, אבל עדיין מתאימים את התוכן לאופן שבו אנשים צורכים אותו בפייסבוק, באינסטגרם ובוואטסאפ.'],
  ['אפשר לנהל את הקמפיינים גם מהטלפון?', 'כן. האתר מותאם למובייל, ובנוסף אפשר לבצע פעולות נבחרות דרך Possbo ב-WhatsApp, למשל להתחיל קמפיין, להשתמש בתבנית קיימת ולבדוק סטטוס. כך ניתן להמשיך לנהל את הפעילות גם כשלא נמצאים ליד מחשב.'],
  ['מה קורה אם פרסום לא מצליח?', 'הסטטוס של כל פרסום מופיע בדשבורד ובלוח התוכן, כך שאפשר לזהות במהירות פרסום שנכשל או עדיין ממתין. נכנסים לפרטי הפרסום כדי להבין באיזה ערוץ או יעד נוצרה הבעיה ולטפל בה מבלי לאבד את שאר הקמפיין.'],
  ['האם אפשר לראות את כל הפרסומים ביומן אחד?', 'כן. היומן מאחד את הפרסומים מכל הפלטפורמות ומציג ליד כל פרסום את הערוץ, השעה והסטטוס שלו. אפשר לעבור בין תצוגה שבועית לחודשית, לפתוח יום מסוים ולראות את פרטי הקמפיינים המתוכננים בו.'],
  ['האם צריך לחבר את החשבונות בכל פעם מחדש?', 'לא. את החשבונות והפלטפורמות מחברים בתהליך ההגדרה הראשוני, ולאחר מכן הם זמינים לבחירה בקמפיינים הבאים. אם חיבור מסוים פג או דורש הרשאה מחודשת, המערכת תציג זאת כדי שתוכלו לחדש אותו בצורה מסודרת.'],
]

const AI_LANDING_EXAMPLES = [
  {
    title: '🏠 השכרת דירה בהרצליה',
    type: 'נדל״ן להשכרה',
    topic: 'יחידת דיור מעוצבת עם חצר פרטית',
    audience: 'יחידים שמחפשים דירה שקטה ואיכותית בהרצליה',
    tone: 'מקצועי',
    cta: 'שלחו הודעה בוואטסאפ',
    result: `✨ להשכרה | יחידת דיור מעוצבת עם חצר פרטית | הרצליה

באחת הסמטאות השקטות בהרצליה מחכה לכם יחידת דיור מוארת, משופצת ומרוהטת ומוכנה לכניסה.

🏡 כ-40 מ״ר | קומת קרקע | חצר פרטית
❄️ מזגן | 🚗 חניה בשפע
💰 5,200 ₪ לחודש

📱 לפרטים שלחו הודעה בוואטסאפ`,
  },
  {
    title: '🎓 קורס שיווק דיגיטלי',
    type: 'מכירת קורס',
    topic: 'קורס אונליין מעשי לשיווק בפייסבוק',
    audience: 'בעלי עסקים קטנים שרוצים ללמוד לשווק לבד',
    tone: 'דחוף / FOMO',
    cta: 'הירשמו עכשיו',
    result: `⏰ נשארו מקומות אחרונים!

רוצים להפסיק לנחש מה עובד בפייסבוק ולהתחיל לייצר תוצאות?

📚 8 מפגשים מעשיים אונליין
🎯 ליווי אישי ותרגול אמיתי
🎓 יותר מ-500 בוגרים

🔥 30% הנחה לנרשמים הראשונים
לחצו להרשמה והבטיחו את המקום שלכם 👇`,
  },
  {
    title: '🐕 אילוף כלבים פרטי',
    type: 'קידום שירות',
    topic: 'חבילת אילוף חיובי בבית הלקוח',
    audience: 'בעלי כלבים עם בעיות התנהגות',
    tone: 'קליל וידידותי',
    cta: 'קבעו פגישת היכרות',
    result: `הכלב קופץ על אורחים או מושך בטיול? 🐶

אפשר לשנות את זה בנעימות ובשיטה חיובית.

✅ 5 מפגשים אישיים אצלכם בבית
✅ כלים פרקטיים שמתאימים לשגרה שלכם
✅ תוצאות כבר מהמפגש הראשון

🎁 פגישת היכרות ראשונה ללא עלות
שלחו הודעה ונצא לדרך יחד.`,
  },
  {
    title: '🛍️ קוסמטיקה טבעית',
    type: 'מכירת מוצר',
    topic: 'סרום טבעי להענקת לחות וזוהר',
    audience: 'נשים שמחפשות טיפוח טבעי ואיכותי',
    tone: 'מעורר השראה',
    cta: 'הזמינו באתר',
    result: `הגיע הזמן לתת לעור שלך לזהור ✨

Pure Glow הוא סרום היאלורוני טבעי שמעניק לחות עמוקה ומראה רענן.

🌿 רכיבים טבעיים בלבד
🐰 ללא ניסויים בבעלי חיים
🇮🇱 מיוצר בישראל

🔥 השבוע: מבצע 1+1
המלאי מוגבל. הזמיני עכשיו באתר.`,
  },
]



function RealProductTour() {
  const videoRef = useRef(null)
  const [showVideoControls, setShowVideoControls] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    const observer = new window.IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    }, { threshold: [0, 0.45, 0.8] })
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  const handleVideoClick = () => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    setShowVideoControls(true)
  }

  return (
    <div className="real-tour real-tour-video">
      <div className="real-tour-screen">
        <video
          ref={videoRef}
          controls={showVideoControls}
          muted
          loop
          playsInline
          preload="metadata"
          onClick={handleVideoClick}
          poster="/landing/possbo-create-real.webp"
          aria-label="סרטון הדגמה מלא של יצירת קמפיין ב-Possbo"
        >
          <source src="/landing/video/possbo-full-campaign-demo.webm?v=6" type="video/webm" />
        </video>
        <span className="real-tour-video-status"><i /> הדגמה מתוך המערכת</span>
      </div>
      <div className="real-tour-chapters" aria-label="שלבי ההדגמה">
        {['בריף לקמפיין', 'יצירת תוכן ב-AI', 'מדיה ועיצוב', 'בחירת פלטפורמות', 'תזמון וסיכום'].map((label, index) => (
          <span key={label}><i>{index + 1}</i>{label}</span>
        ))}
      </div>
    </div>
  )
}

function WhatsAppControlDemo() {
  const [stage, setStage] = useState(0)
  const [activeCapability, setActiveCapability] = useState(0)
  const chatFlowRef = useRef(null)
  const capabilities = [
    ['✦', 'צור קמפיין', 'יצירה מודרכת מתחילתה ועד הפרסום'],
    ['▦', 'צור טמפלייט', 'שמירת תוכן ויעדים לשימוש חוזר'],
    ['◫', 'הקמפיינים שלי', 'צפייה וניהול של קמפיינים'],
    ['◉', 'סטטוס', 'הצלחות, תזמונים ופרסומים שנכשלו'],
    ['?', 'הדרכות ועזרה', 'הסבר קצר לכל פעולה במערכת'],
    ['↗', 'תמיכה', 'מעבר מהיר לשיחה עם הצוות'],
  ]
  const campaignFlow = [
    { user: 'צור קמפיין', bot: 'מעולה, ניצור קמפיין חדש. מה שם הקמפיין?', reply: 'מבצעי סוף הקיץ' },
    { bot: 'מה נרצה לפרסם?', reply: '20% הנחה על כל קולקציית הקיץ, עד יום חמישי בלבד ☀️' },
    { bot: 'אפשר לצרף תמונה או להמשיך בלי מדיה.', reply: 'summer-campaign.jpg', media: true },
    { bot: 'באילו ערוצים ויעדים לפרסם?', reply: 'Facebook, Instagram ו-WhatsApp', platforms: true },
    { bot: 'מתי לפרסם את הקמפיין?', reply: 'היום בשעה 18:30' },
    { bot: 'הכול מוכן: 3 ערוצים, 5 יעדים, היום ב-18:30.', reply: 'אישור ותזמון', success: true },
  ]
  const additionalFlows = [
    [
      { user: 'צור טמפלייט', bot: 'בשמחה. מה שם הטמפלייט החדש?', reply: 'עדכון שבועי' },
      { bot: 'שלחו את התוכן הקבוע שנרצה לשמור.', reply: 'השבוע בעסק: חדשות, טיפים ועדכונים חשובים.' },
      { bot: 'לאילו ערוצים ויעדים הטמפלייט מיועד?', reply: 'Facebook ו-WhatsApp', platforms: true },
      { bot: 'הטמפלייט מוכן. התזמון ייבחר בכל שימוש.', reply: 'שמירת הטמפלייט', success: true, successText: 'הטמפלייט נשמר בהצלחה' },
    ],
    [
      { user: 'הקמפיינים שלי', bot: 'הנה הקמפיינים האחרונים בחשבון:', reply: 'מבצעי סוף הקיץ - מתוזמן ל-18:30' },
      { bot: 'עדכון שבועי - פורסם בהצלחה ב-3 ערוצים.', reply: 'הצג פרטי קמפיין' },
      { bot: 'אפשר לצפות בתוכן, ביעדים ובסטטוס של כל קמפיין.', reply: 'חזרה לתפריט', success: true, successText: 'הקמפיינים מסונכרנים עם המערכת' },
    ],
    [
      { user: 'סטטוס', bot: 'עבור איזו תקופה להציג סטטוס?', reply: '7 ימים אחרונים' },
      { bot: 'השבוע פורסמו 12 יעדים בהצלחה, 3 פרסומים מתוזמנים ויעד אחד דורש בדיקה.', reply: 'הצג את היעד שדורש בדיקה' },
      { bot: 'Instagram לא פורסם. מומלץ לבדוק את החיבור והמדיה.', reply: 'הבנתי', success: true, successText: 'תמונת המצב מעודכנת' },
    ],
    [
      { user: 'הדרכות ועזרה', bot: 'מרכז ההדרכות של Possbo - באיזה נושא לעזור?', reply: 'תזמון פרסומים' },
      { bot: 'אפשר לפרסם מיד, לבחור תאריך עתידי או להגדיר תזמון חוזר.', reply: 'איך משנים מועד?' },
      { bot: 'פותחים את הקמפיין ביומן, בוחרים מועד חדש ושומרים.', reply: 'תודה, הבנתי', success: true, successText: 'אפשר לבחור נושא נוסף בכל רגע' },
    ],
    [
      { user: 'תמיכה', bot: 'נשמח לעזור. באיזה נושא הפנייה?', reply: 'חיבור חשבון Instagram' },
      { bot: 'כתבו בקצרה מה קורה או צרפו צילום מסך.', reply: 'החשבון מחובר אבל הפרסום נכשל.' },
      { bot: 'הפנייה הועברה לצוות עם פרטי החשבון והשיחה.', reply: 'שליחת הפנייה', success: true, successText: 'הפנייה נפתחה בהצלחה' },
    ],
  ]
  const activeFlow = activeCapability === 0 ? campaignFlow : additionalFlows[activeCapability - 1]

  useEffect(() => {
    if (stage >= activeFlow.length) return undefined
    const timer = window.setTimeout(() => setStage(current => current + 1), stage === 0 ? 3000 : 2400)
    return () => window.clearTimeout(timer)
  }, [stage, activeCapability, activeFlow.length])

  useEffect(() => {
    const chat = chatFlowRef.current
    if (!chat) return
    window.requestAnimationFrame(() => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }))
  }, [stage])

  return (
    <div className="wa-bot-showcase">
      <aside className="wa-capabilities">
        <header>
          <span><Bot size={17} /></span>
          <div><strong>מה תרצו לעשות?</strong><small>כל Possbo גם מתוך WhatsApp</small></div>
        </header>
        <div>
          {capabilities.map(([icon, title, description], index) => (
            <button key={title} className={index === activeCapability ? 'selected' : ''} onClick={() => {
              setActiveCapability(index)
              setStage(1)
            }}>
              <i>{icon}</i><span><strong>{title}</strong><small>{description}</small></span>
              <ArrowLeft size={14} />
            </button>
          ))}
        </div>
        <footer><span /> מחובר ומסונכרן עם החשבון שלך</footer>
      </aside>

      <div className="wa-campaign-demo">
        <div className="wa-campaign-progress">
          <span><i style={{ width: `${Math.max(8, (stage / activeFlow.length) * 100)}%` }} /></span>
          <small>{stage < activeFlow.length ? `שלב ${Math.max(1, stage + 1)} מתוך ${activeFlow.length}` : 'הפעולה הושלמה'}</small>
        </div>
        <div className="wa-device">
          <div className="wa-device-status"><span>9:41</span><span>● ◒ ▰</span></div>
          <div className="wa-phone-head">
            <span className="wa-contact-avatar"><img src="/brand/possbo-favicon-light-v5.png" alt="" /></span>
            <span className="wa-contact-copy"><strong>Possbo</strong><small>מחובר עכשיו</small></span>
            <WhatsAppLogo size={22} />
          </div>
          <div ref={chatFlowRef} className={`wa-chat wa-chat-flow stage-${stage}`}>
            <div className="wa-chat-date">היום</div>
            <div className="wa-bubble incoming wa-welcome">
              <span className="wa-bot-name"><Sparkles size={13} /> Possbo Assistant</span>
              היי דביר 👋 מה תרצה לעשות?
              <span className="wa-menu-summary">קמפיין חדש · טמפלייט · סטטוס · הדרכות</span>
              <small>10:24</small>
            </div>
            {activeFlow.slice(0, stage).map((item, index) => (
              <div className="wa-flow-exchange" key={index}>
                {item.user && <div className="wa-bubble outgoing">{item.user}<small>10:24 ✓✓</small></div>}
                <div className={`wa-bubble incoming ${item.success ? 'is-success' : ''}`}>
                  {item.bot}
                  {item.platforms && (
                    <span className="wa-platform-pills">
                      <i><FacebookLogo size={14} /> Facebook</i>
                      <i><InstagramLogo size={14} /> Instagram</i>
                      <i><WhatsAppLogo size={14} /> WhatsApp</i>
                    </span>
                  )}
                  <small>10:24</small>
                </div>
                <div className={`wa-bubble outgoing ${item.media ? 'wa-media-reply' : ''}`}>
                  {item.media && <span className="wa-media-thumb"><img src="/brand/possbo-favicon-light-v5.png" alt="" /></span>}
                  {item.reply}
                  {item.success && <span className="wa-confirm-check"><Check size={14} /> {item.successText || 'הקמפיין תוזמן בהצלחה'}</span>}
                  <small>10:25 ✓✓</small>
                </div>
              </div>
            ))}
          </div>
          <div className="wa-compose">
            <span>{stage >= activeFlow.length ? 'הפעולה הושלמה ✓' : 'כתיבת הודעה...'}</span>
            <button aria-label="שליחה"><ArrowLeft size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroDashboard({ theme }) {
  return (
    <div className="hero-product-scene">
      <svg className="hero-connections" viewBox="0 0 800 540" fill="none" aria-hidden="true">
        <path d="M664 68C748 119 755 208 702 258C648 309 661 381 744 417" />
        <path d="M627 34C768 65 798 183 739 248C680 314 705 402 787 442" />
      </svg>
      <div className="network-badge network-instagram"><InstagramLogo size={24} /></div>
      <div className="network-badge network-facebook"><FacebookLogo size={27} /></div>
      <div className="network-badge network-whatsapp"><WhatsAppLogo size={25} /></div>

      <div className="hero-dashboard hero-dashboard-real">
        <img
          src={theme === 'dark'
            ? '/landing/possbo-dashboard-real.webp'
            : '/landing/possbo-dashboard-real-light-v4.png'}
          alt="דשבורד Possbo המציג קמפיינים, תזמון ונתוני פעילות"
        />
      </div>
      <img className="hero-robot" src="/brand/possbo-robot-mascot-v1.png" alt="" />
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { user, authChecked } = useAppData()
  const { theme, toggleTheme } = useTheme()
  const [isNavScrolled, setIsNavScrolled] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [activeNav, setActiveNav] = useState(window.location.hash || '#capabilities')
  const [openFaq, setOpenFaq] = useState(0)
  const [showAllFaqs, setShowAllFaqs] = useState(false)
  const [showAiExamples, setShowAiExamples] = useState(false)
  const [activeAiExample, setActiveAiExample] = useState(null)
  const [aiVideoCelebrating, setAiVideoCelebrating] = useState(false)

  useEffect(() => {
    if (authChecked && user) navigate('/dashboard')
  }, [authChecked, user, navigate])

  useEffect(() => {
    const handleScroll = () => setIsNavScrolled(window.scrollY > 32)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!isMobileNavOpen) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setIsMobileNavOpen(false)
    }
    document.body.classList.add('landing-menu-open')
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.classList.remove('landing-menu-open')
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isMobileNavOpen])

  useEffect(() => {
    const observer = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible')
      })
    }, { threshold: 0.12 })
    document.querySelectorAll('.landing-reveal').forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  const scrollToDemo = () => document.getElementById('product-demo')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="landing-page">
      <Seo
        title="Possbo | קמפיין אחד לפייסבוק, אינסטגרם ווואטסאפ"
        description="יוצרים תוכן עם AI, מפרסמים בקבוצות ובפרופיל Facebook, בפוסט, סטורי ורילס ב-Instagram ובקבוצות ותפוצות WhatsApp, ומתזמנים ומודדים הכול ממקום אחד."
        schema={getLandingSchema()}
      />
      <nav className={`landing-nav ${isNavScrolled ? 'landing-nav-scrolled' : ''}`}>
        <Link to="/" className="nav-logo" aria-label="Possbo">
          <BrandLogo className="nav-logo-img" decorative />
          <span className="nav-logo-wordmark">ossbo</span>
        </Link>
        <div className="landing-nav-links">
          {[
            ['#capabilities', 'יכולות'],
            ['#scheduling', 'תזמון'],
            ['#ai-content', 'יצירת תוכן'],
            ['#product-demo', 'הדגמה'],
            ['#pricing', 'מחירים'],
            ['#how-it-works', 'איך זה עובד'],
            ['#faq', 'שאלות'],
          ].map(([href, label]) => (
            <a className={activeNav === href ? 'active' : ''} href={href} key={href} onClick={() => setActiveNav(href)}>{label}</a>
          ))}
          <Link to="/resources">מדריכים</Link>
        </div>
        <div className="nav-buttons">
          <button className="nav-theme-toggle" onClick={toggleTheme} aria-label="החלפת מצב תצוגה">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link to="/login" className="nav-btn nav-btn-login">כניסה</Link>
          <Link to="/register" className="nav-btn nav-btn-register">בואו נצא לדרך <ArrowLeft size={15} /></Link>
          <button className="mobile-nav-trigger" type="button" onClick={() => setIsMobileNavOpen(true)} aria-label="פתיחת תפריט" aria-expanded={isMobileNavOpen}>
            <Menu size={22} />
          </button>
        </div>
      </nav>

      <div className={`mobile-nav-layer ${isMobileNavOpen ? 'open' : ''}`} aria-hidden={!isMobileNavOpen}>
        <button className="mobile-nav-backdrop" type="button" onClick={() => setIsMobileNavOpen(false)} aria-label="סגירת תפריט" />
        <aside className="mobile-nav-drawer" aria-label="ניווט בדף">
          <div className="mobile-nav-head">
            <Link to="/" className="nav-logo" onClick={() => setIsMobileNavOpen(false)}>
              <BrandLogo className="nav-logo-img" decorative />
              <span className="nav-logo-wordmark">ossbo</span>
            </Link>
            <button type="button" onClick={() => setIsMobileNavOpen(false)} aria-label="סגירת תפריט"><X size={20} /></button>
          </div>
          <p>לאן תרצו להגיע?</p>
          <div className="mobile-nav-links">
            {[
              ['#capabilities', Grid2X2, 'כל היכולות', 'כל ערוצי הפרסום במקום אחד'],
              ['#scheduling', CalendarDays, 'תזמון ויומן', 'מתכננים את כל הפרסומים'],
              ['#ai-content', Sparkles, 'יצירת תוכן עם AI', 'מכינים תוכן מבריף קצר'],
              ['#product-demo', Play, 'הדגמת המערכת', 'רואים איך קמפיין נבנה'],
              ['#whatsapp-management', WhatsAppLogo, 'ניהול דרך WhatsApp', 'עובדים גם ישירות מהטלפון'],
              ['#pricing', CreditCard, 'מחירים', 'מסלול אחד ברור וכל הכלים בפנים'],
              ['#how-it-works', Layers3, 'איך זה עובד', 'מההרשמה ועד לניתוח'],
              ['#reports', BarChart3, 'דוחות וביצועים', 'סיכום פעילות וקמפיינים'],
              ['#faq', CircleHelp, 'שאלות נפוצות', 'תשובות לכל מה שחשוב'],
            ].map(([href, Icon, title, description]) => (
              <a className={activeNav === href ? 'active' : ''} href={href} key={href} onClick={() => {
                setActiveNav(href)
                setIsMobileNavOpen(false)
              }}>
                <i><Icon size={18} /></i>
                <span><b>{title}</b><small>{description}</small></span>
                <ArrowLeft size={15} />
              </a>
            ))}
            <Link to="/resources" onClick={() => setIsMobileNavOpen(false)}>
              <i><BookOpen size={18} /></i>
              <span><b>מדריכים</b><small>ידע מעשי לשיווק, תוכן ותזמון</small></span>
              <ArrowLeft size={15} />
            </Link>
          </div>
          <div className="mobile-nav-actions">
            <button type="button" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}</button>
            <Link to="/login">כניסה</Link>
            <Link to="/register">בואו נצא לדרך <ArrowLeft size={15} /></Link>
          </div>
        </aside>
      </div>

      <main>
        <section id="top" className="landing-hero">
          <div className="hero-ambient" />
          <div className="hero-copy">
            <div className="hero-badge"><Sparkles size={14} /> תוכן חכם. תזמון מושלם. תוצאות אמיתיות.</div>
            <h1>מפרסמים חכם.<br /><span>מגיעים לכל מקום.</span></h1>
            <p>Possbo היא הפלטפורמה המתקדמת לניהול ושיווק ברשתות החברתיות. צרו תוכן עם AI, תזמנו פוסטים וחסכו שעות יקרות בכל יום. Facebook, Instagram ו-WhatsApp, הכל במקום אחד.</p>
            <div className="hero-cta">
              <Link to="/register" className="cta-primary">התחילו עכשיו בחינם <ArrowLeft size={18} /></Link>
              <button className="cta-demo" onClick={scrollToDemo}><span><Play size={14} fill="currentColor" /></span> צפו בסרטון הדגמה</button>
            </div>
            <div className="hero-trust">
              <span><Check size={14} /> אין צורך בכרטיס אשראי</span>
              <span><Check size={14} /> התקנה מהירה</span>
              <span><Check size={14} /> בטוח ומאובטח</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-visual-glow" />
            <HeroDashboard theme={theme} />
          </div>
          <div className="hero-benefits">
            {[
              [Grid2X2, 'תבניות מוכנות', 'מאות תבניות מעוצבות'],
              [Globe2, 'כל הפלטפורמות', 'Facebook, Instagram, WhatsApp'],
              [Clock3, 'תזמון מתקדם', 'תזמון מדויק לכל פלטפורמה'],
              [Sparkles, 'יצירת תוכן עם AI', 'פוסטים שממירים יותר'],
              [Bot, 'בוט WhatsApp חכם', 'נהל קמפיינים מכל מקום'],
            ].map(([Icon, title, text]) => (
              <div key={title}><i><Icon size={18} /></i><span><b>{title}</b><small>{text}</small></span></div>
            ))}
          </div>
          <div className="scroll-cue"><MousePointer2 size={15} /> גללו כדי לגלות</div>
        </section>

        <section id="scheduling" className="scheduling-showcase">
          <div className="scheduling-copy landing-reveal">
            <span className="section-kicker"><CalendarDays size={14} /> כל הפרסומים מול העיניים</span>
            <h2>מתכננים פעם אחת. <em>Possbo מפרסמת בזמן.</em></h2>
            <p>בוחרים מתי לפרסם בכל פלטפורמה ורואים את כל התוכנית בלוח אחד ברור: מה מתוכנן, מה כבר פורסם ומה דורש תשומת לב.</p>
          </div>
          <div className="scheduling-visual landing-reveal" aria-hidden="true">
            <img
              src={theme === 'dark'
                ? '/brand/possbo-scheduling-calendar-clear-dark-v2.png'
                : '/brand/possbo-scheduling-calendar-clear-v2.png'}
              alt=""
            />
            <div className="schedule-title-overlay"><CalendarDays /> <strong>לוח תוכן</strong></div>
            <div className="schedule-platforms-overlay">
              <span><i className="schedule-fb"><FacebookLogo /></i> Facebook</span>
              <span><i className="schedule-ig"><InstagramLogo /></i> Instagram</span>
              <span><i className="schedule-wa"><WhatsAppLogo /></i> WhatsApp</span>
            </div>
            <div className="schedule-details-overlay">
              <span><Globe2 /> <b>Instagram</b></span>
              <span><Clock3 /> <b>08:00</b></span>
              <span><CalendarDays /> <b>15 במאי 2024</b></span>
              <span><i /> <b>מתוזמן</b></span>
            </div>
          </div>
          <div className="scheduling-points landing-reveal">
            <div><i><Clock3 /></i><b>מיידי, חד-פעמי או חוזר<small>פרסמו עכשיו, במועד מדויק או בשגרה קבועה.</small></b></div>
            <div><i><Globe2 /></i><b>תזמון נפרד לכל ערוץ<small>זמן שונה ל-Facebook, Instagram ו-WhatsApp.</small></b></div>
            <div><i><CalendarDays /></i><b>ימים וכמה שעות ביום<small>טווח תאריכים, ימים קבועים ומספר שעות.</small></b></div>
            <div><i><Grid2X2 /></i><b>לוח שבועי או רשימה<small>שתי תצוגות וסינון לפי טווח רצוי.</small></b></div>
            <div><i><Check /></i><b>סטטוס ברור לכל פרסום<small>פורסם, ממתין או נכשל. הכול מיד מול העיניים.</small></b></div>
          </div>
        </section>

        <section id="capabilities" className="unified-capabilities">
          <div className="section-heading landing-reveal">
            <span>כל היכולות, במקום אחד</span>
            <h2>כל כלי עושה עבודה ברורה.<br />ביחד הם מנהלים את כל השיווק.</h2>
            <p>בחרו את הערוצים והכלים שמתאימים לעסק שלכם. Possbo מחברת ביניהם לקמפיין אחד, יומן אחד ותמונה אחת ברורה.</p>
          </div>
          <div className="unified-capabilities-grid">
            {[
              [FacebookLogo, 'Facebook', 'פרסום אוטומטי לקבוצות ולפרופיל', 'מפרסמים פוסט אחד לקבוצות נבחרות, לפרופיל האישי וליעדים עסקיים, מיד או בזמן שקבעתם.', ['בחירת קבוצות מדויקת', 'פרסום לפרופיל', 'תזמון חד-פעמי או חוזר'], '/facebook-groups-automation', 'facebook'],
              [InstagramLogo, 'Instagram', 'פוסט, סטורי ורילס בתזמון מדויק', 'מתאימים את המדיה, הפורמט ומועד הפרסום לכל סוג תוכן ושולחים לחשבון המחובר בלי לבנות קמפיין נוסף.', ['פוסטים בפיד', 'סטוריז ורילס', 'תזמון לכל פרסום'], '/instagram-scheduling', 'instagram'],
              [WhatsAppLogo, 'WhatsApp', 'קבוצות ורשימות תפוצה', 'שולחים תוכן לקבוצות ולקהלים שמורים, עם תזמון וניהול יעדים כחלק מאותו לוח עבודה.', ['קבוצות WhatsApp', 'רשימות תפוצה', 'שליחה מתוזמנת'], '/whatsapp-campaigns', 'whatsapp'],
              [Sparkles, 'Possbo AI', 'תוכן מוכן מבריף קצר', 'הופכים רעיון קצר לנוסח מלא שאפשר לערוך, לדייק ולהתאים לכל פלטפורמה ולקהל שלה.', ['רעיונות ונוסחים', 'התאמה לפלטפורמה', 'יצירת תמונות'], '/ai-social-post-generator', 'ai'],
              [Layers3, 'תבניות ואוטומציה', 'שומרים פעם אחת ומשתמשים שוב', 'שומרים מבנים ותכנים שעובדים, בונים שגרות פרסום ומנהלים את הכול בלוח חודשי ושבועי.', ['תבניות לשימוש חוזר', 'קמפיינים מחזוריים', 'יומן וסטטוס לכל פרסום'], '/register', 'templates'],
              [Bot, 'Possbo ב-WhatsApp', 'מנהלים את העבודה גם מהטלפון', 'יוצרים קמפיינים, משתמשים בתבניות ובודקים סטטוס בשיחה פשוטה, גם כשלא נמצאים ליד המחשב.', ['יצירת קמפיין בשיחה', 'בדיקת סטטוסים', 'עבודה מהנייד'], '/whatsapp-campaigns', 'bot'],
            ].map(([Icon, eyebrow, title, description, bullets, href, tone], index) => (
              <article className={`unified-capability landing-reveal unified-${tone}`} key={eyebrow} style={{ '--reveal-delay': `${index * 55}ms` }}>
                <div className="unified-capability-icon"><Icon /></div>
                <div className="unified-capability-copy">
                  <small>{eyebrow}</small>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <ul>{bullets.map(item => <li key={item}><Check size={14} />{item}</li>)}</ul>
                </div>
                <Link to={href}>לכל היכולות <ArrowLeft size={15} /></Link>
              </article>
            ))}
          </div>
          <Link className="unified-capabilities-cta" to="/register">מתחילים לנהל הכול במקום אחד <ArrowLeft size={17} /></Link>
        </section>

        <section id="ai-content" className="ai-creation-showcase">
          <div className="ai-creation-copy landing-reveal">
            <span className="section-kicker"><Sparkles size={14} /> חדש ב-Possbo</span>
            <h2>מבריף קצר לפוסט מוכן <em>בעזרת AI</em></h2>
            <p>ספרו בקצרה מה אתם רוצים לפרסם, בחרו את הסגנון והפלטפורמות ותקבלו פוסט מלא, מוכן לעריכה ולפרסום.</p>
            <div className="ai-benefit-grid">
              <div><i><PencilLine /></i><b>עריכה מלאה<small>שנו את הנוסח והתאימו אותו בקלות.</small></b></div>
              <div><i><Sparkles /></i><b>AI מתקדם<small>תוכן מדויק, מושך ומשכנע.</small></b></div>
              <div><i><Zap /></i><b>מהיר וחכם<small>מפחית שעות עבודה לכמה דקות.</small></b></div>
              <div><i><Bot /></i><b>מותאם לכל פלטפורמה<small>נוסח נכון לכל רשת ולכל קהל.</small></b></div>
            </div>
            <div className="ai-creation-actions">
              <button className="ai-examples-trigger" onClick={() => {
                setActiveAiExample(null)
                setShowAiExamples(true)
              }}>
                <Sparkles size={17} /> ראו דוגמאות אמיתיות
              </button>
            </div>
          </div>
          <div className="ai-video-wrap landing-reveal">
            <div className="ai-video-toolbar" aria-hidden="true">
              <span className="ai-video-toolbar-dots"><i /><i /><i /></span>
              <span>Possbo AI</span>
            </div>
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="הדגמת יצירת פוסט בעזרת AI ב-Possbo"
              onTimeUpdate={event => {
                const { currentTime, duration } = event.currentTarget
                setAiVideoCelebrating(Number.isFinite(duration) && currentTime > 1 && duration - currentTime < 2.8)
              }}
            >
              <source src="/landing/video/possbo-ai-post-demo.webm" type="video/webm" />
            </video>
            <button
              type="button"
              className="ai-video-expand"
              aria-label="הגדלת סרטון ההדגמה למסך מלא"
              onClick={event => {
                const video = event.currentTarget.parentElement?.querySelector('video')
                if (video?.requestFullscreen) video.requestFullscreen()
                else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen()
              }}
            >
              <Maximize2 size={17} /> הגדלת ההדגמה
            </button>
            <div className="ai-video-status"><i /> הדגמה מתוך המערכת</div>
            <div className={`ai-video-robot ${aiVideoCelebrating ? 'is-celebrating' : ''}`} aria-hidden="true">
              <img className="ai-robot-watching" src="/brand/possbo-robot-mascot-v1.png" alt="" />
              <img className="ai-robot-celebrating" src="/brand/possbo-robot-celebrate-v1.png" alt="" />
              <span>הפוסט מוכן! 🎉</span>
            </div>
          </div>
        </section>

        {showAiExamples && (
          <div className="landing-ai-modal" role="dialog" aria-modal="true" aria-labelledby="landing-ai-modal-title" onClick={() => setShowAiExamples(false)}>
            <div className={`landing-ai-modal-card ${activeAiExample ? 'showing-example' : ''}`} onClick={event => event.stopPropagation()}>
              <header>
                <div>
                  <span><Sparkles size={15} /> דוגמאות מה-AI של Possbo</span>
                  <h2 id="landing-ai-modal-title">{activeAiExample ? activeAiExample.title : 'בחרו דוגמה להצגה'}</h2>
                </div>
                <div className="landing-ai-modal-actions">
                  {activeAiExample && <button className="ai-examples-back" onClick={() => setActiveAiExample(null)}><ArrowLeft size={16} /> חזרה לדוגמאות</button>}
                  <button onClick={() => setShowAiExamples(false)} aria-label="סגירת חלון הדוגמאות"><X /></button>
                </div>
              </header>
              {activeAiExample ? (
                <div className="ai-selected-example ai-modal-example">
                  <div className="ai-live-brief">
                    <span>הבריף שנבחר</span>
                    <h3>{activeAiExample.title}</h3>
                    <dl>
                      <div><dt>סוג</dt><dd>{activeAiExample.type}</dd></div>
                      <div><dt>מה מפרסמים?</dt><dd>{activeAiExample.topic}</dd></div>
                      <div><dt>קהל</dt><dd>{activeAiExample.audience}</dd></div>
                      <div><dt>טון</dt><dd>{activeAiExample.tone}</dd></div>
                      <div><dt>CTA</dt><dd>{activeAiExample.cta}</dd></div>
                    </dl>
                  </div>
                  <div className="ai-live-result">
                    <div><span><Sparkles size={16} /> תוצאת AI</span><small>דוגמה להמחשה</small></div>
                    <pre>{activeAiExample.result}</pre>
                    <footer><span><ShieldCheck size={14} /> מוכן לעריכה</span><span><Check size={14} /> מותאם לפרסום</span></footer>
                  </div>
                </div>
              ) : (
                <div className="landing-ai-example-list">
                  {AI_LANDING_EXAMPLES.map(example => (
                    <button key={example.title} onClick={() => setActiveAiExample(example)}>
                      <b>{example.title}</b><small>{example.topic}</small><span>הציגו תוצאת AI <ArrowLeft size={14} /></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <section id="product-demo" className="demo-section landing-reveal">
          <div className="section-heading">
            <span>הדגמה קצרה של המערכת</span>
            <h2>כך קמפיין נבנה ב-Possbo</h2>
            <p>צפו בתהליך פשוט וברור, מהכנת התוכן ועד לבחירת הערוצים והתזמון.</p>
          </div>
          <RealProductTour />
        </section>

        <section id="whatsapp-management" className="whatsapp-control-section">
          <div className="whatsapp-control-copy landing-reveal">
            <span className="section-kicker">יכולת שאין למערכות אחרות</span>
            <h2>מנהלים את השיווק<br />ישירות מתוך WhatsApp.</h2>
            <p>הצ׳אטבוט של Possbo הוא לא רק תמיכה. הוא ממשק ניהול מלא שמאפשר לעבוד גם כשאתם לא ליד המחשב.</p>
            <ul>
              <li><Check /> יצירת קמפיין חדש לכל הפלטפורמות</li>
              <li><Check /> יצירה ושמירה של טמפלייטים</li>
              <li><Check /> בדיקת סטטוס ותוצאות של קמפיינים</li>
              <li><Check /> ניהול נוח בשיחה טבעית מהטלפון</li>
            </ul>
          </div>
          <div className="landing-reveal"><WhatsAppControlDemo /></div>
        </section>

        <section id="pricing" className="landing-pricing">
          <div className="pricing-heading landing-reveal">
            <span className="section-kicker"><CreditCard size={14} /> מחיר פשוט וברור</span>
            <h2>מסלול אחד. כל כלי השיווק בפנים.</h2>
            <p>בלי מסלולים מבלבלים ובלי לבחור בין יכולות. מקבלים סביבת עבודה מלאה ליצירה, פרסום, תזמון ומעקב.</p>
          </div>

          <div className="pricing-shell landing-reveal">
            <article className="pricing-plan">
              <div className="pricing-plan-top">
                <div>
                  <span>המסלול המלא</span>
                  <h3>מסלול מקצועי</h3>
                </div>
                <i>הכל במקום אחד</i>
              </div>
              <p>מתאים לעסקים שרוצים לנהל את הפעילות השיווקית באופן קבוע ממערכת אחת.</p>
              <div className="pricing-price">
                <strong>300</strong>
                <span>₪<small>/ חודש</small></span>
              </div>
              <Link to="/register">בואו נצא לדרך <ArrowLeft size={17} /></Link>
            </article>

            <div className="pricing-includes">
              <span>מה כלול במסלול?</span>
              <h3>כל מה שצריך כדי לעבוד בצורה מסודרת</h3>
              <ul>
                {[
                  'פרסום אוטומטי בקבוצות פייסבוק',
                  'תזמון פוסטים מראש',
                  'ניהול קבוצות וערוצי פרסום',
                  'דוחות וסטטיסטיקות לקמפיינים',
                  'יצירת תוכן בעזרת AI',
                  'תבניות מוכנות לשימוש חוזר',
                ].map((feature) => <li key={feature}><i><Check size={14} /></i>{feature}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="journey-section">
          <div className="journey-heading landing-reveal">
            <span className="section-kicker">מההרשמה ועד לצמיחה</span>
            <h2>תהליך פשוט שמחבר את כל השיווק.</h2>
            <p>מתחילים פעם אחת, עובדים באופן שוטף ולומדים מכל קמפיין מה כדאי לעשות בהמשך.</p>
          </div>
          <div className="journey-steps">
            {[
              ['01', 'נרשמים ופותחים סביבת עבודה', 'יוצרים חשבון, מגדירים את העסק ומקבלים מקום אחד שמרכז את כל הקמפיינים והערוצים.'],
              ['02', 'מחברים את הפלטפורמות פעם אחת', 'מחברים Facebook, Instagram ו-WhatsApp באופן חד-פעמי ובוחרים את הקבוצות, החשבונות והקהלים.'],
              ['03', 'יוצרים קמפיינים ומכינים תוכן', 'כותבים לבד או בעזרת AI, מעלים תמונות וסרטונים ומתאימים את התוכן לכל פלטפורמה.'],
              ['04', 'מפרסמים עכשיו או מתזמנים', 'שולחים קמפיין מיד, קובעים מועד עתידי או בונים תזמון חוזר שממשיך לעבוד באופן אוטומטי.'],
              ['05', 'עוקבים אחרי כל פרסום', 'רואים בלוח החודשי והשבועי מה פורסם, מה מתוזמן ומה דורש תשומת לב, בלי לחפש בין מערכות.'],
              ['06', 'מנתחים ביצועים ומזהים הזדמנויות', 'משווים קמפיינים לפי חשיפה ומעורבות, מזהים פניות, קהלים ולידים פוטנציאליים ומשפרים את הקמפיין הבא.'],
            ].map(([number, title, text]) => (
              <article className="journey-step landing-reveal" key={number}>
                <b>{number}</b>
                <div><h3>{title}</h3><p>{text}</p></div>
              </article>
            ))}
          </div>
          <Link className="journey-cta landing-reveal" to="/register">מתחילים בשלב הראשון <ArrowLeft size={17} /></Link>
        </section>

        <section id="reports" className="reports-showcase">
          <div className="reports-heading landing-reveal">
            <span className="section-kicker"><BarChart3 size={14} /> דוחות שמספרים את הסיפור המלא</span>
            <h2>רואים את התמונה הגדולה.<br />ויודעים איפה להשתפר.</h2>
            <p>סיכום הפעילות והביצועים של כל קמפיין מוצגים בצורה ברורה, כדי שאפשר יהיה להבין מה עבד ולקבל החלטות טובות יותר.</p>
          </div>

          <div className="analytics-screens landing-reveal">
            <article className="analytics-screen analytics-overview">
              <header className="analytics-screen-head">
                <div><i><Grid2X2 /></i><span><b>סיכום פעילות</b><small>תמונת מצב מכל הערוצים</small></span></div>
                <span className="sample-data-badge">נתוני הדגמה</span>
              </header>
              <div className="analytics-summary-grid">
                <div><span><BarChart3 /></span><small>קמפיינים פעילים</small><strong>12</strong><em>3 חדשים החודש</em></div>
                <div><span><MousePointer2 /></span><small>חשיפה כוללת</small><strong>48,760</strong><em>עלייה של 14%</em></div>
                <div><span><Users /></span><small>פניות חדשות</small><strong>286</strong><em>62 השבוע</em></div>
              </div>
              <div className="analytics-activity">
                <div className="analytics-card-title"><span><b>פעילות לאורך החודש</b><small>חשיפה לפי שבוע</small></span><i><span /> חשיפה</i></div>
                <div className="overview-bars">
                  {[42, 57, 48, 72, 64, 83, 75, 92].map((height, index) => <i key={index} style={{ '--bar-height': `${height}%` }} />)}
                </div>
                <div className="overview-axis"><span>שבוע 1</span><span>שבוע 2</span><span>שבוע 3</span><span>שבוע 4</span></div>
              </div>
              <div className="analytics-channels">
                <span><i className="channel-logo facebook"><FacebookLogo /></i><b>Facebook<small>42% מהפעילות</small></b></span>
                <span><i className="channel-logo instagram"><InstagramLogo /></i><b>Instagram<small>36% מהפעילות</small></b></span>
                <span><i className="channel-logo whatsapp"><WhatsAppLogo /></i><b>WhatsApp<small>22% מהפעילות</small></b></span>
              </div>
            </article>

            <article className="analytics-screen analytics-campaigns">
              <header className="analytics-screen-head">
                <div><i><BarChart3 /></i><span><b>ביצועי קמפיינים</b><small>השוואה בין קמפיינים</small></span></div>
                <span className="analytics-period">30 ימים אחרונים <ChevronDown /></span>
              </header>
              <div className="campaign-report-chart">
                <div className="analytics-card-title"><span><b>חשיפה ומעורבות</b><small>מגמה יומית</small></span><em>+18.4%</em></div>
                <svg viewBox="0 0 620 180" preserveAspectRatio="none" aria-hidden="true">
                  <defs><linearGradient id="campaignChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d5dfc" stopOpacity=".34" /><stop offset="1" stopColor="#6d5dfc" stopOpacity="0" /></linearGradient></defs>
                  <path className="campaign-chart-area" d="M0 154 C55 146 78 112 126 124 S206 145 248 94 S329 112 370 72 S449 92 492 49 S566 61 620 20 L620 180 L0 180Z" />
                  <path className="campaign-chart-line" d="M0 154 C55 146 78 112 126 124 S206 145 248 94 S329 112 370 72 S449 92 492 49 S566 61 620 20" />
                </svg>
              </div>
              <div className="campaign-report-list">
                <div className="campaign-report-row campaign-report-labels"><span>קמפיין</span><span>ערוץ</span><span>חשיפה</span><span>מעורבות</span></div>
                <div className="campaign-report-row"><span><i className="report-dot purple" />קולקציית הקיץ</span><span><InstagramLogo /> Instagram</span><b>18,420</b><em>7.8%</em></div>
                <div className="campaign-report-row"><span><i className="report-dot blue" />מבצע סוף שבוע</span><span><FacebookLogo /> Facebook</span><b>12,680</b><em>6.2%</em></div>
                <div className="campaign-report-row"><span><i className="report-dot green" />לקוחות חוזרים</span><span><WhatsAppLogo /> WhatsApp</span><b>8,940</b><em>9.1%</em></div>
              </div>
            </article>
          </div>

          <div className="reports-note landing-reveal"><i>i</i> המספרים, שמות הקמפיינים והמדדים המוצגים באזור זה הם נתוני דוגמה להמחשת יכולות המערכת.</div>
        </section>

        <section id="faq" className="faq-section">
          <div className="section-heading landing-reveal"><span>שאלות נפוצות</span><h2>כל מה שחשוב לדעת</h2></div>
          <div className="faq-list landing-reveal">
            {FAQ.slice(0, showAllFaqs ? 10 : 4).map(([question, answer], index) => (
              <article className={openFaq === index ? 'open' : ''} key={question}>
                <button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}>
                  {question}<ChevronDown size={18} />
                </button>
                <div><p>{answer}</p></div>
              </article>
            ))}
          </div>
          <button
            className="faq-show-more landing-reveal"
            type="button"
            aria-expanded={showAllFaqs}
            onClick={() => {
              setShowAllFaqs(value => !value)
              if (showAllFaqs && openFaq > 3) setOpenFaq(-1)
            }}
          >
            {showAllFaqs ? 'הצג פחות' : 'הצג עוד 6 שאלות'}
            <ChevronDown size={17} />
          </button>
        </section>

        <section className="final-cta landing-reveal">
          <div className="final-cta-copy">
            <span className="final-cta-kicker"><BrandLogo decorative /> מוכנים לקמפיין הבא?</span>
            <h2>כל השיווק שלכם.<br />מסודר במקום אחד.</h2>
            <p>חברו את הערוצים, הכינו את התוכן ותזמנו את הקמפיין הבא בתהליך אחד פשוט וברור.</p>
            <div className="final-cta-actions">
              <Link className="final-cta-primary" to="/register">בואו נצא לדרך <ArrowLeft size={17} /></Link>
              <Link className="final-cta-secondary" to="/login">כבר יש לי חשבון</Link>
            </div>
          </div>
          <div className="final-cta-summary">
            <div><i><Layers3 /></i><span><b>קמפיין אחד</b><small>לכל הערוצים והקהלים</small></span></div>
            <div><i><CalendarDays /></i><span><b>תזמון ברור</b><small>מיידי, עתידי או חוזר</small></span></div>
            <div><i><BarChart3 /></i><span><b>תמונה מלאה</b><small>מעקב ודוחות במקום אחד</small></span></div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-brand">
          <span className="footer-brand-lockup"><BrandLogo decorative /><b>ossbo</b></span>
          <span className="footer-tagline">כל הזכויות שמורות ל-Possbo</span>
        </div>
        <nav className="footer-links" aria-label="קישורים נוספים">
          <Link to="/facebook-groups-automation">Facebook</Link>
          <Link to="/instagram-scheduling">Instagram</Link>
          <Link to="/whatsapp-campaigns">WhatsApp</Link>
          <Link to="/ai-social-post-generator">AI</Link>
          <Link to="/resources">מדריכים</Link>
          <Link to="/privacy">פרטיות</Link>
          <Link to="/accessibility-statement">נגישות</Link>
          <Link to="/contact">יצירת קשר</Link>
        </nav>
        <small className="footer-copyright">© {new Date().getFullYear()} Possbo</small>
      </footer>
      <LandingChatBot />
    </div>
  )
}
