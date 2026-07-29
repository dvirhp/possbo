import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, CalendarDays, Camera, Check, ChevronDown, Clock3,
  Layers3, MessageCircle, Moon, ThumbsUp,
  MousePointer2, Pause, Play, Send, Sparkles, Sun, Users, WandSparkles,
} from 'lucide-react'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import LandingChatBot from '../components/LandingChatBot'
import BrandLogo from '../components/BrandLogo'
import Seo from '../components/Seo'
import '../styles/landing.css'

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

const FEATURES = [
  {
    icon: Send,
    eyebrow: 'פרסום רב־ערוצי',
    title: 'קמפיין אחד. כל הערוצים.',
    text: 'מפרסמים לפייסבוק, אינסטגרם ווואטסאפ מאותו מסך — לקבוצות, לפרופיל, לסטורי, לרילס ולרשימות תפוצה.',
    className: 'feature-wide feature-publish',
  },
  {
    icon: CalendarDays,
    eyebrow: 'אוטומציה',
    title: 'מתזמנים פעם אחת',
    text: 'פרסום מיידי, חד־פעמי או מחזורי, עם יומן שמרכז את כל מה שעומד לצאת.',
    className: 'feature-schedule',
  },
  {
    icon: WandSparkles,
    eyebrow: 'יצירה חכמה',
    title: 'AI שעוזר לכתוב',
    text: 'מייצרים רעיונות ונוסחים, משפרים את המסר ושומרים תבניות לשימוש חוזר.',
    className: 'feature-ai',
  },
  {
    icon: BarChart3,
    eyebrow: 'מדידה',
    title: 'מבינים מה באמת עובד',
    text: 'לייקים, תגובות, חשיפה, צפיות וביצועים לפי פוסט, קבוצה, קמפיין ופלטפורמה.',
    className: 'feature-wide feature-analytics',
  },
  {
    icon: MessageCircle,
    eyebrow: 'ניהול מתוך WhatsApp',
    title: 'העסק ממשיך לזוז גם מהטלפון',
    text: 'יוצרים קמפיין, שומרים טמפלייט, בודקים סטטוס ומנהלים פרסומים דרך הצ׳אטבוט בוואטסאפ.',
    className: 'feature-whatsapp',
  },
  {
    icon: Layers3,
    eyebrow: 'גמישות מלאה',
    title: 'כל סוג פרסום שצריך',
    text: 'תמונות וסרטונים, מיקום, פרסום אנונימי, פייסבוק אישי, קבוצות, פוסט, סטורי, רילס ותפוצות.',
    className: 'feature-options',
  },
]

const FAQ = [
  ['אילו פלטפורמות אפשר לנהל?', 'Possbo מרכזת פרסום וניהול עבור Facebook, Instagram ו־WhatsApp, עם אפשרויות יעד מותאמות לכל פלטפורמה.'],
  ['אפשר לתזמן קמפיינים חוזרים?', 'כן. אפשר לבחור ימים, שעות וטווח תאריכים, ולראות את כל הפרסומים העתידיים ביומן אחד.'],
  ['איך רואים את תוצאות הפרסום?', 'הדשבורד והדוחות מציגים היסטוריית פרסומים, הצלחות וכשלונות, חשיפה ומדדי מעורבות שניתנים לסנכרון.'],
  ['אפשר לשמור תוכן לשימוש חוזר?', 'כן. ספריית התבניות מאפשרת לשמור קמפיינים, נוסחים ומבנים שחוזרים אצלך בעסק.'],
]

function ProductDemo() {
  const [step, setStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  useEffect(() => {
    if (!isPlaying) return undefined
    const timer = window.setInterval(() => setStep(current => (current + 1) % 3), 2800)
    return () => window.clearInterval(timer)
  }, [isPlaying])

  const selectStep = (nextStep) => {
    setStep(nextStep)
    setIsPlaying(false)
  }

  return (
    <div className="product-demo" aria-label="הדגמה של תהליך יצירת קמפיין">
      <div className="demo-window-bar">
        <div className="demo-dots"><i /><i /><i /></div>
        <span>Possbo Workspace</span>
        <span className="demo-live"><i /> פעיל</span>
      </div>
      <div className="demo-shell">
        <aside className="demo-sidebar">
          <div className="demo-brand"><BrandLogo decorative /><b>ossbo</b></div>
          {[Layers3, Users, CalendarDays, BarChart3].map((Icon, index) => (
            <span key={index} className={index === step ? 'active' : ''}><Icon size={16} /></span>
          ))}
        </aside>
        <div className="demo-content">
          <div className="demo-heading">
            <div><small>קמפיין חדש</small><strong>מעלים תוכן לכל מקום</strong></div>
            <span>טיוטה נשמרה</span>
          </div>
          <div className="demo-progress">
            {['תוכן', 'יעדים', 'תזמון'].map((label, index) => (
              <button key={label} className={step === index ? 'active' : ''} onClick={() => selectStep(index)}>
                <i>{index < step ? <Check size={12} /> : index + 1}</i>{label}
              </button>
            ))}
          </div>
          <div className="demo-stage" key={step} onClick={() => selectStep((step + 1) % 3)}>
            <span className={`demo-cursor demo-cursor-${step}`}><MousePointer2 size={22} fill="currentColor" /><i /></span>
            {step === 0 && (
              <>
                <div className="demo-editor">
                  <div className="demo-editor-top"><Sparkles size={15} /> כתיבה חכמה עם AI</div>
                  <span className="demo-line long" /><span className="demo-line" /><span className="demo-line short" />
                  <div className="demo-media"><Play size={22} fill="currentColor" /></div>
                </div>
                <div className="demo-preview">
                  <small>תצוגה מקדימה</small>
                  <div className="demo-post-user"><i /> <span /></div>
                  <div className="demo-post-image" />
                </div>
              </>
            )}
            {step === 1 && (
              <div className="demo-targets">
                <small>לאן לפרסם?</small>
                {[
                  [ThumbsUp, 'Facebook', '12 קבוצות + פרופיל'],
                  [Camera, 'Instagram', 'פיד + סטורי'],
                  [MessageCircle, 'WhatsApp', '4 קבוצות + רשימה'],
                ].map(([Icon, name, detail], index) => (
                  <div key={name} style={{ '--delay': `${index * 90}ms` }}>
                    <span className={`target-icon target-${index}`}><Icon size={18} /></span>
                    <b>{name}<small>{detail}</small></b>
                    <i><Check size={13} /></i>
                  </div>
                ))}
              </div>
            )}
            {step === 2 && (
              <div className="demo-calendar">
                <small>מתי לפרסם?</small>
                <div className="demo-time-options">
                  <span>עכשיו</span><span className="active">תזמון</span><span>מחזורי</span>
                </div>
                <div className="demo-calendar-grid">
                  {Array.from({ length: 21 }, (_, index) => <i key={index} className={[6, 10, 15].includes(index) ? 'selected' : ''}>{index + 1}</i>)}
                </div>
                <div className="demo-schedule-confirm"><Clock3 size={15} /> יום רביעי · 19:30 <Check size={15} /></div>
              </div>
            )}
          </div>
          <div className="demo-player">
            <button onClick={() => setIsPlaying(current => !current)} aria-label={isPlaying ? 'עצירת ההדגמה' : 'הפעלת ההדגמה'}>
              {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            </button>
            <div className="demo-player-track"><i key={`${step}-${isPlaying}`} className={isPlaying ? 'playing' : ''} /></div>
            <span>{step === 0 ? 'יוצרים תוכן' : step === 1 ? 'בוחרים ערוצים וקבוצות' : 'קובעים מועד לפרסום'}</span>
            <small>00:0{step + 1} / 00:08</small>
          </div>
        </div>
      </div>
    </div>
  )
}

const REAL_TOUR = [
  {
    image: '/landing/possbo-create-real.webp',
    title: 'יוצרים קמפיין אמיתי מתוך Possbo',
    text: 'כתיבת תוכן, יצירה מלאה עם AI, מדיה, מיקום, אנונימיות ותצוגה מקדימה לכל פלטפורמה.',
  },
  {
    image: '/landing/possbo-dashboard-real.webp',
    title: 'כל הפעילות מרוכזת בדשבורד אחד',
    text: 'קמפיינים, קבוצות, יומן, פרסומים מובילים ופעולות מהירות — בדיוק כפי שהם נראים במערכת.',
  },
  {
    image: '/landing/possbo-stats-real.webp',
    title: 'רואים תוצאות ולא רק פרסומים',
    text: 'מדדי ביצוע, חשיפה, לייקים, תגובות ושיתופים עם פילוח לפי פלטפורמה וטווח זמן.',
  },
]

function RealProductTour() {
  return (
    <div className="real-tour real-tour-video">
      <div className="real-tour-video-head">
        <div>
          <span className="real-tour-live"><i /> הדגמה אמיתית מתוך Possbo</span>
          <h3>מרעיון לקמפיין רב־ערוצי — בפחות משתי דקות</h3>
        </div>
        <span className="real-tour-safe">ללא פרסום בפועל</span>
      </div>
      <div className="real-tour-screen">
        <video
          controls
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          poster="/landing/possbo-create-real.webp"
          aria-label="סרטון הדגמה מלא של יצירת קמפיין ב-Possbo"
        >
          <source src="/landing/video/possbo-full-campaign-demo.webm" type="video/webm" />
        </video>
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
  const [command, setCommand] = useState(0)
  const commands = [
    ['קמפיין חדש', 'מעולה! נתחיל ביצירת קמפיין חדש. לאילו פלטפורמות תרצה לפרסם?', 'Facebook · Instagram · WhatsApp'],
    ['מה סטטוס הקמפיינים?', 'יש לך 3 קמפיינים פעילים: 24 פרסומים הצליחו ו־2 מתוזמנים להערב.', 'הצג פירוט קמפיינים'],
    ['שמור כתבנית', 'הקמפיין נשמר כטמפלייט וזמין מעכשיו לשימוש חוזר מכל מכשיר.', 'פתח את הטמפלייט'],
  ]
  const active = commands[command]
  return (
    <div className="wa-control-demo">
      <div className="wa-phone-head"><span><MessageCircle size={18} /> Possbo</span><small>מחובר</small></div>
      <div className="wa-chat">
        <div className="wa-bubble outgoing" key={`out-${command}`}>{active[0]}<small>✓✓</small></div>
        <div className="wa-bubble incoming" key={`in-${command}`}>
          {active[1]}<button>{active[2]}</button><small>עכשיו</small>
        </div>
      </div>
      <div className="wa-command-tabs">
        {commands.map(([label], index) => <button key={label} className={command === index ? 'active' : ''} onClick={() => setCommand(index)}>{label}</button>)}
      </div>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { user, authChecked } = useAppData()
  const { theme, toggleTheme } = useTheme()
  const [isNavScrolled, setIsNavScrolled] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)

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
        description="יוצרים תוכן עם AI, מפרסמים בקבוצות ובפרופיל Facebook, בפוסט, סטורי ורילס ב-Instagram ובקבוצות ותפוצות WhatsApp — ומתזמנים ומודדים הכול ממקום אחד."
        schema={getLandingSchema()}
      />
      <nav className={`landing-nav ${isNavScrolled ? 'landing-nav-scrolled' : ''}`}>
        <Link to="/" className="nav-logo" aria-label="Possbo">
          <BrandLogo className="nav-logo-img" decorative />
          <span className="nav-logo-wordmark">ossbo</span>
        </Link>
        <div className="landing-nav-links">
          <a href="#capabilities">יכולות</a>
          <a href="#how-it-works">איך זה עובד</a>
          <a href="#reports">דוחות</a>
          <Link to="/resources">מדריכים</Link>
        </div>
        <div className="nav-buttons">
          <button className="nav-theme-toggle" onClick={toggleTheme} aria-label="החלפת מצב תצוגה">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link to="/login" className="nav-btn nav-btn-login">כניסה</Link>
          <Link to="/register" className="nav-btn nav-btn-register">פתיחת חשבון <ArrowLeft size={15} /></Link>
        </div>
      </nav>

      <main>
        <section className="landing-hero">
          <div className="hero-ambient" />
          <div className="hero-copy">
            <div className="hero-badge"><Sparkles size={14} /> קמפיין אחד. שלוש פלטפורמות. שליטה מלאה.</div>
            <h1>יוצרים פעם אחת.<br /><span>מגיעים לכל מקום.</span></h1>
            <p>Possbo הופכת רעיון לקמפיין מלא: תוכן עם AI, פרסום בקבוצות ובפרופיל Facebook, פוסט, סטורי ורילס ב־Instagram, וקבוצות ותפוצות WhatsApp — עם תזמון ודוחות ממערכת אחת.</p>
            <div className="hero-cta">
              <Link to="/register" className="cta-primary">יצירת קמפיין ראשון <ArrowLeft size={18} /></Link>
              <button className="cta-demo" onClick={scrollToDemo}><span><Play size={14} fill="currentColor" /></span> צפו בתהליך המלא</button>
            </div>
            <div className="hero-trust">
              <span><Check size={14} /> חיבור חד־פעמי</span>
              <span><Check size={14} /> ממשק מלא בעברית</span>
              <span><Check size={14} /> בלי לעבור בין מערכות</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <img src="/brand/possbo-hero-automation-v1.webp" alt="" />
            <div className="hero-orbit orbit-one"><ThumbsUp size={18} /></div>
            <div className="hero-orbit orbit-two"><Camera size={18} /></div>
            <div className="hero-orbit orbit-three"><MessageCircle size={18} /></div>
          </div>
          <div className="scroll-cue"><MousePointer2 size={15} /> גללו כדי לגלות</div>
        </section>

        <section className="platform-strip landing-reveal">
          <span>פלטפורמה אחת שמחברת בין</span>
          <div><b><ThumbsUp /> Facebook</b><i /><b><Camera /> Instagram</b><i /><b><MessageCircle /> WhatsApp</b></div>
        </section>

        <section className="proof-strip landing-reveal" aria-label="יכולות מרכזיות">
          <div><strong>3</strong><span>פלטפורמות<br />בקמפיין אחד</span></div>
          <div><strong>6+</strong><span>סוגי יעד<br />ופורמטים</span></div>
          <div><strong>AI</strong><span>מתדריך קצר<br />לפוסט שלם</span></div>
          <div><strong>24/7</strong><span>ניהול קמפיינים<br />דרך WhatsApp</span></div>
        </section>

        <section id="product-demo" className="demo-section landing-reveal">
          <div className="section-heading">
            <span>רואים את כל התהליך</span>
            <h2>שלושה צעדים בין רעיון לקמפיין באוויר</h2>
            <p>ממשק אחד שמוריד את העומס מהעבודה היומיומית ומשאיר את כל ההחלטות החשובות מול העיניים.</p>
          </div>
          <RealProductTour />
        </section>

        <section id="capabilities" className="capabilities-section">
          <div className="section-heading landing-reveal">
            <span>כל מה שצריך כדי לזוז מהר</span>
            <h2>פחות תפעול. יותר נוכחות.</h2>
            <p>Possbo מחברת את בניית התוכן, ההפצה והלמידה למהלך עבודה רציף אחד.</p>
          </div>
          <div className="features-bento">
            {FEATURES.map(({ icon: Icon, eyebrow, title, text, className }, index) => (
              <article className={`feature-card landing-reveal ${className}`} key={title} style={{ '--reveal-delay': `${index * 70}ms` }}>
                <div className="feature-card-icon"><Icon size={22} /></div>
                <small>{eyebrow}</small>
                <h3>{title}</h3>
                <p>{text}</p>
                {className.includes('publish') && <div className="publish-flow"><span>תוכן</span><i /><b>FB</b><b>IG</b><b>WA</b></div>}
                {className.includes('analytics') && <div className="mini-chart">{[38, 54, 47, 72, 64, 91, 82].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div>}
              </article>
            ))}
          </div>
        </section>

        <section className="solutions-section">
          <div className="section-heading landing-reveal">
            <span>פתרון מדויק לכל ערוץ</span>
            <h2>מתחילים מהמקום שהכי חשוב לעסק שלך</h2>
            <p>כל ערוץ מקבל תהליך עבודה, פורמטים ותזמון שמתאימים לו — וכולם חוזרים לאותו קמפיין ולדוח אחד.</p>
          </div>
          <div className="solution-links">
            <Link className="landing-reveal" to="/facebook-groups-automation"><ThumbsUp /><small>Facebook</small><h3>פרסום אוטומטי לקבוצות ולפרופיל</h3><span>לכל היכולות <ArrowLeft /></span></Link>
            <Link className="landing-reveal" to="/instagram-scheduling"><Camera /><small>Instagram</small><h3>פוסט, סטורי ורילס בתזמון מדויק</h3><span>לכל היכולות <ArrowLeft /></span></Link>
            <Link className="landing-reveal" to="/whatsapp-campaigns"><MessageCircle /><small>WhatsApp</small><h3>קבוצות, תפוצות וניהול מהצ׳אט</h3><span>לכל היכולות <ArrowLeft /></span></Link>
            <Link className="landing-reveal" to="/ai-social-post-generator"><WandSparkles /><small>Possbo AI</small><h3>מבריף קצר לקמפיין כתוב ומוכן</h3><span>לכל היכולות <ArrowLeft /></span></Link>
          </div>
        </section>

        <section id="how-it-works" className="workflow-section">
          <div className="workflow-copy landing-reveal">
            <span className="section-kicker">זרימת עבודה שנבנתה לעסקים</span>
            <h2>מהרעיון ועד הדוח,<br />בלי לאבד את ההקשר.</h2>
            <p>כל פעולה ממשיכה את הקודמת: היעדים מחוברים, התוכן נשמר, התזמון ברור והתוצאות חוזרות לאותו קמפיין.</p>
            <Link to="/register">לפתיחת סביבת העבודה <ArrowLeft size={17} /></Link>
          </div>
          <div className="workflow-steps">
            {[
              ['01', 'מחברים את הקהלים', 'מסנכרנים קבוצות ויעדים בפייסבוק ובוואטסאפ ומחברים את חשבון האינסטגרם.'],
              ['02', 'יוצרים קמפיין', 'כותבים לבד או עם AI, מעלים מדיה ובוחרים בדיוק לאן כל גרסה תפורסם.'],
              ['03', 'נותנים לאוטומציה לעבוד', 'מפרסמים עכשיו או בונים לוח זמנים חד־פעמי ומחזורי.'],
              ['04', 'לומדים ומשפרים', 'עוקבים אחר היסטוריה, חשיפה ומעורבות ומבינים מה כדאי לעשות שוב.'],
            ].map(([number, title, text]) => (
              <article className="landing-reveal" key={number}>
                <b>{number}</b><div><h3>{title}</h3><p>{text}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section id="reports" className="reports-showcase">
          <div className="reports-panel landing-reveal">
            <div className="reports-panel-head"><span>ביצועי קמפיינים</span><small>30 ימים אחרונים</small></div>
            <div className="report-kpis">
              <div><small>חשיפה</small><strong>84.2K</strong><i>+18%</i></div>
              <div><small>פרסומים</small><strong>128</strong><i>96% הצלחה</i></div>
              <div><small>אינטראקציות</small><strong>4,891</strong><i>+24%</i></div>
            </div>
            <div className="report-chart">
              <svg viewBox="0 0 700 190" preserveAspectRatio="none">
                <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity=".4" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs>
                <path className="chart-area" d="M0 160 C80 150,90 100,150 118 S250 145,300 85 S390 115,440 60 S540 100,600 42 S660 55,700 20 L700 190 L0 190Z" />
                <path className="chart-line" d="M0 160 C80 150,90 100,150 118 S250 145,300 85 S390 115,440 60 S540 100,600 42 S660 55,700 20" />
              </svg>
            </div>
          </div>
          <div className="reports-copy landing-reveal">
            <span className="section-kicker">נתונים שאפשר לפעול לפיהם</span>
            <h2>לא רק לפרסם.<br />לדעת מה קרה אחר כך.</h2>
            <p>מקבלים תמונה ברורה של הפעילות בכל הערוצים — עם היסטוריית פרסומים, סטטוסים, חשיפה ומדדי מעורבות.</p>
            <ul>
              <li><Check /> פילוח לפי Facebook, Instagram ו־WhatsApp</li>
              <li><Check /> סנכרון לייקים, תגובות ומדדי ביצוע</li>
              <li><Check /> דוחות לפי קמפיין, קבוצה וטווח תאריכים</li>
            </ul>
          </div>
        </section>

        <section className="whatsapp-control-section">
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

        <section className="faq-section">
          <div className="section-heading landing-reveal"><span>שאלות נפוצות</span><h2>כל מה שחשוב לדעת</h2></div>
          <div className="faq-list landing-reveal">
            {FAQ.map(([question, answer], index) => (
              <article className={openFaq === index ? 'open' : ''} key={question}>
                <button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}>
                  {question}<ChevronDown size={18} />
                </button>
                <div><p>{answer}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta landing-reveal">
          <div className="final-cta-glow" />
          <BrandLogo decorative />
          <span>הגיע הזמן לעבוד אחרת</span>
          <h2>הקמפיין הבא שלך<br />לא צריך להתחיל מאפס.</h2>
          <p>יוצרים את התוכן, בוחרים את הקהלים ונותנים ל־Possbo לנהל את ההפצה, התזמון והמעקב.</p>
          <Link to="/register">יצירת קמפיין ראשון <ArrowLeft size={18} /></Link>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-brand"><BrandLogo decorative /><b>ossbo</b><span>ניהול תוכן חכם, בעברית.</span></div>
        <div><Link to="/facebook-groups-automation">Facebook</Link><Link to="/instagram-scheduling">Instagram</Link><Link to="/whatsapp-campaigns">WhatsApp</Link><Link to="/ai-social-post-generator">AI</Link><Link to="/resources">מדריכים</Link><Link to="/privacy">פרטיות</Link><Link to="/accessibility-statement">נגישות</Link><Link to="/contact">יצירת קשר</Link></div>
        <small>© {new Date().getFullYear()} Possbo</small>
      </footer>
      <LandingChatBot />
    </div>
  )
}
