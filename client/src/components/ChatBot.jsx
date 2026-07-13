import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, ChevronLeft } from 'lucide-react'
import '../styles/chatbot.css'

const AGENT_NAME = 'פוסטי'
const SUPPORT_EMAIL = 'support@postit-app.co.il'

// Knowledge base - organized by topic with nested categories
const TOPICS = [
  {
    id: 'welcome',
    label: 'איך אפשר לעזור?',
    options: [
      { id: 'getting-started', label: '🚀 התחלה מהירה' },
      { id: 'features', label: '✨ תכונות המערכת' },
      { id: 'troubleshoot', label: '🔧 פתרון בעיות' },
      { id: 'contact', label: '📧 צור קשר' },
    ]
  },
  {
    id: 'getting-started',
    label: 'התחלה מהירה',
    answer: `בחר נושא:`,
    options: [
      { id: 'publish', label: '🚀 איך לפרסם פוסט' },
      { id: 'groups', label: '👥 ניהול קבוצות' },
      { id: 'pages', label: '📄 הסבר על דפי האתר' },
      { id: 'welcome', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'features',
    label: 'תכונות המערכת',
    answer: `בחר תכונה:`,
    options: [
      { id: 'campaigns', label: '📋 קמפיינים' },
      { id: 'templates', label: '📝 טמפלייטים' },
      { id: 'schedule', label: '⏰ תזמון פרסומים' },
      { id: 'profile', label: '👤 פרסום בפרופיל' },
      { id: 'reports', label: '📊 דוחות וסיכומים' },
      { id: 'settings', label: '⚙️ הגדרות' },
      { id: 'welcome', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'pages',
    label: 'דפי האתר',
    answer: `הנה סקירה של דפי האתר הראשיים:

🏠 **דשבורד** — מרכז הפיקוד שלך. סיכום קמפיינים, סטטיסטיקות, לוח שנה, וקבוצות.

👥 **קבוצות** — ניהול כל הקבוצות שלך בפייסבוק.

📋 **קמפיינים** — כל הפוסטים שפרסמת או תזמנת.

📅 **יומן** — לוח שנה עם כל הפרסומים המתוזמנים.

📊 **סטטיסטיקות** — נתוני חשיפה ומעורבות.

📝 **טמפלייטים** — תבניות מוכנות לפרסום מהיר.

📈 **דוחות** — סיכום עם אפשרות ייצוא PDF.`,
    options: [
      { id: 'getting-started', label: '🔙 חזרה' },
      { id: 'publish', label: '🚀 איך לפרסם' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'publish',
    label: 'איך לפרסם פוסט',
    answer: `ככה מפרסמים פוסט:

1️⃣ **תוכן** — כתוב טקסט, הוסף תמונה, כותרת, ומיקום.

2️⃣ **קבוצות** — בחר לאילו קבוצות לפרסם (או פרופיל אישי).

3️⃣ **תזמון** — פרסם עכשיו, תזמן, או הגדר חוזר.

4️⃣ **סיכום** — בדוק ולחץ "פרסם".

💡 **טיפ:** השתמש בטמפלייט מוכן לחיסכון בזמן!`,
    options: [
      { id: 'schedule', label: '⏰ עוד על תזמון' },
      { id: 'templates', label: '📝 טמפלייטים' },
      { id: 'getting-started', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'campaigns',
    label: 'קמפיינים',
    answer: `**קמפיין** = פוסט שפרסמת או תזמנת.

כולל: תוכן, תמונות, רשימת קבוצות, וסטטוס.

**היתרונות:**
✅ ניהול מרוכז של כל הפרסומים
✅ מעקב הצלחה/כשלון בכל קבוצה
✅ תזמון חוזר
✅ היסטוריה מלאה

ב**טאב קמפיינים** בדשבורד — סנן לפי סטטוס וצפה בפרטים.`,
    options: [
      { id: 'publish', label: '🚀 איך ליצור קמפיין' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'groups',
    label: 'ניהול קבוצות',
    answer: `**ניהול קבוצות:**

🔄 **סנכרון** — "סנכרן מפייסבוק" למשיכת כל הקבוצות.

🔍 **חיפוש** — סנן לפי שם, גודל, או קטגוריה.

⭐ **מועדפים** — סמן קבוצות לגישה מהירה.

📊 **סטטיסטיקות** — כמות חברים ושיעור הצלחה.`,
    options: [
      { id: 'troubleshoot', label: '🔧 בעיות בסנכרון' },
      { id: 'getting-started', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'templates',
    label: 'טמפלייטים',
    answer: `**טמפלייטים** = תבניות מוכנות לפרסום מהיר.

**ליצור:** טמפלייטים > חדש > מלא תוכן > שמור.

**להשתמש:** ביצירת פוסט > "טען טמפלייט" > בחר > פרסם.

💡 צור טמפלייטים לפוסטים שחוזרים על עצמם!`,
    options: [
      { id: 'publish', label: '🚀 איך לפרסם' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'reports',
    label: 'דוחות וסיכומים',
    answer: `**עמוד הדוחות:**

📊 כרטיסי KPI — פרסומים, הצלחות, קבוצות פעילות.

📋 יומן פעילות — טבלה עם סטטוס. לחיצה = פרטים.

📅 פרסומים מתוזמנים — מה עומד לצאת.

🖨️ ייצוא PDF — דוח מעוצב להורדה.

💡 סנן לפי תקופה או בחר טווח תאריכים מותאם אישית.`,
    options: [
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'schedule',
    label: 'תזמון פרסומים',
    answer: `**3 מצבי תזמון:**

⚡ **מיידי** — פורסם מיד.
📅 **מתוזמן** — תאריך ושעה ספציפיים.
🔄 **חוזר** — ימים בשבוע + שעה קבועה.

💡 **שעות מומלצות:**
• 🌅 09:00-11:00
• 🌞 13:00-15:00
• 🌙 18:00-20:00

📊 ימים מומלצים: שלישי, רביעי, חמישי.`,
    options: [
      { id: 'campaigns', label: '📋 קמפיינים' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'profile',
    label: 'פרסום בפרופיל',
    answer: `**פרסום בפרופיל האישי:**

**איך:** ביצירת פוסט — הפעל "פרסם בפרופיל האישי".

**אפשרויות:**
• פרופיל בלבד
• פרופיל + קבוצות
• תזמון

💡 הפוסט יפורסם כאילו כתבת אותו ידנית!`,
    options: [
      { id: 'publish', label: '🚀 עוד על פרסום' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'settings',
    label: 'הגדרות',
    answer: `**הגדרות חשבון:**

👤 **פרופיל** — שם, תמונה, פרטי התחברות.
🔔 **התראות** — פעמון בתפריט הצד.
🔗 **פייסבוק** — חיבור מאובטח.
📱 **וואטסאפ** — מספר אוטומטי לפוסטים.
🎨 **ערכת נושא** — שמש/ירח בתפריט.`,
    options: [
      { id: 'features', label: '🔙 חזרה' },
      { id: 'troubleshoot', label: '🔧 פתרון בעיות' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'troubleshoot',
    label: 'פתרון בעיות',
    answer: `**בעיות נפוצות:**

❌ **פרסום נכשל** — בדוק חיבור פייסבוק, התנתק/התחבר מחדש.

🔄 **סנכרון לא עובד** — התנתק מפייסבוק והתחבר שוב.

⏰ **תזמון לא יצא** — ודא שהשרת פעיל וחיבור FB תקין.

🖼️ **תמונה לא עולה** — JPG/PNG, עד 10MB.`,
    options: [
      { id: 'welcome', label: '🔙 חזרה לתפריט' },
      { id: 'settings', label: '⚙️ הגדרות' },
      { id: 'contact', label: '📧 עדיין לא נפתר?' },
    ]
  },
  {
    id: 'contact',
    label: 'צור קשר',
    answer: `לא מצאת תשובה? 😊

שלח לנו מייל ונחזור אליך בהקדם:

📧 **${SUPPORT_EMAIL}**

או לחץ על הכפתור למטה לפתיחת מייל חדש.`,
    options: [
      { id: 'send-email', label: '📧 שלח מייל עכשיו' },
      { id: 'welcome', label: '🔙 חזרה לתפריט' },
    ]
  },
]

export default function ChatBot() {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem('chatbot-open') === 'true' } catch { return false }
  })
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('chatbot-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [currentTopic, setCurrentTopic] = useState(() => {
    try { return sessionStorage.getItem('chatbot-topic') || null } catch { return null }
  })
  const messagesEndRef = useRef(null)

  // Persist state to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem('chatbot-open', open ? 'true' : 'false') } catch {}
  }, [open])

  useEffect(() => {
    try { sessionStorage.setItem('chatbot-messages', JSON.stringify(messages)) } catch {}
  }, [messages])

  useEffect(() => {
    try { if (currentTopic) sessionStorage.setItem('chatbot-topic', currentTopic) } catch {}
  }, [currentTopic])

  useEffect(() => {
    if (open && messages.length === 0) {
      // Initial greeting
      setMessages([{
        type: 'bot',
        text: `שלום! 👋 אני **${AGENT_NAME}**, הסוכן החכם שלך.\nאיך אפשר לעזור לך היום?`,
        options: TOPICS.find(t => t.id === 'welcome')?.options || []
      }])
      setCurrentTopic('welcome')
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Scroll to bottom when reopening the chat
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 50)
    }
  }, [open])

  const handleOptionClick = (option) => {
    // Add user message
    setMessages(prev => [...prev, { type: 'user', text: option.label }])

    // Special action: open email
    if (option.id === 'send-email') {
      window.open(`mailto:${SUPPORT_EMAIL}?subject=פנייה מ-PostIt&body=שלום, אשמח לעזרה ב...`, '_blank')
      setTimeout(() => {
        setMessages(prev => [...prev, {
          type: 'bot',
          text: `נפתח חלון מייל חדש! 📧\nנחזור אליך בהקדם האפשרי.`,
          options: [{ id: 'welcome', label: '🔙 חזרה לתפריט' }]
        }])
      }, 400)
      return
    }

    // Find topic
    const topic = TOPICS.find(t => t.id === option.id)
    if (!topic) return

    setCurrentTopic(topic.id)

    // Simulate typing delay
    setTimeout(() => {
      if (topic.answer) {
        setMessages(prev => [...prev, {
          type: 'bot',
          text: topic.answer,
          options: topic.options || []
        }])
      } else if (topic.options) {
        setMessages(prev => [...prev, {
          type: 'bot',
          text: `${topic.label} — בחר נושא:`,
          options: topic.options
        }])
      }
    }, 400)
  }

  const handleReset = () => {
    setMessages([{
      type: 'bot',
      text: `שלום שוב! 👋 איך אפשר לעזור?`,
      options: TOPICS.find(t => t.id === 'welcome')?.options || []
    }])
    setCurrentTopic('welcome')
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button className="chatbot-fab" onClick={() => setOpen(true)} title="צ'אט עזרה">
          <MessageCircle size={22} />
          <span className="chatbot-fab-pulse" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="chatbot-panel">
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <div className="chatbot-avatar">
                <Bot size={20} />
              </div>
              <div className="chatbot-header-text">
                <span className="chatbot-name">{AGENT_NAME}</span>
                <span className="chatbot-status">● מחובר</span>
              </div>
            </div>
            <button className="chatbot-close" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chatbot-msg chatbot-msg-${msg.type}`}>
                {msg.type === 'bot' && (
                  <div className="chatbot-msg-avatar">
                    <Bot size={14} />
                  </div>
                )}
                <div className="chatbot-msg-bubble">
                  <div className="chatbot-msg-text" dangerouslySetInnerHTML={{
                    __html: formatBotText(msg.text)
                  }} />
                  {msg.options?.length > 0 && (
                    <div className="chatbot-options">
                      {msg.options.map((opt) => (
                        <button
                          key={opt.id}
                          className="chatbot-option-btn"
                          onClick={() => handleOptionClick(opt)}
                        >
                          {opt.label}
                          <ChevronLeft size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chatbot-footer">
            <button className="chatbot-reset-btn" onClick={handleReset}>
              🔄 התחל מחדש
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function formatBotText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}
