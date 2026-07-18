import { useState, useRef, useEffect } from 'react'
import '../styles/landing-chatbot.css'

const AGENT_NAME = 'פוסטי'

const TOPICS = [
  {
    id: 'what-is',
    label: '🤔 מה זה PostIt?',
    answer: `PostIt היא פלטפורמה לניהול ופרסום אוטומטי בקבוצות פייסבוק.\n\nבמקום לפרסם ידנית בכל קבוצה, אתה מחבר את החשבון, בוחר קבוצות, כותב פוסט אחד ומפרסם בכולן בלחיצה אחת. 🚀`
  },
  {
    id: 'features',
    label: '✨ מה אפשר לעשות?',
    answer: `הנה התכונות העיקריות:\n\n• 📝 פרסום בכל הקבוצות שלך בלחיצה אחת\n• ⏰ תזמון פוסטים לשעה ותאריך מדויקים\n• 📋 תבניות, שמור פוסטים חוזרים\n• 📊 דוחות ביצועים, מעקב הצלחות/כשלונות\n• 🔄 ניסיון חוזר אוטומטי בכשל\n• 👤 פרסום גם בפרופיל האישי\n• 📅 לוח שנה לניהול מתוזמנים`
  },
  {
    id: 'how-works',
    label: '⚙️ איך זה עובד?',
    answer: `תהליך פשוט ב-3 שלבים:\n\n1️⃣ נרשמים ומחברים את חשבון הפייסבוק\n2️⃣ המערכת מזהה את כל הקבוצות שלכם\n3️⃣ כותבים פוסט, בוחרים קבוצות ומפרסמים!\n\nאפשר גם לתזמן לשעה מסוימת או להשתמש בתבניות מוכנות.`
  },
  {
    id: 'advantages',
    label: '💪 למה PostIt?',
    answer: `• ⏱️ חוסך שעות של פרסום ידני\n• 🎯 פרסום ממוקד, בוחרים בדיוק לאיזה קבוצות\n• 🔒 אבטחה מתקדמת, הסיסמאות מוצפנות\n• 📱 עובד מכל מכשיר\n• 🇮🇱 ממשק עברי מלא\n• 🤖 אוטומציה חכמה, ניסיונות חוזרים, תזמונים\n• 📊 דוחות מפורטים על ביצועי הפרסום`
  },
  {
    id: 'pricing',
    label: '💰 כמה זה עולה?',
    answer: `כרגע PostIt בגרסת בטא פתוחה, חינם לחלוטין! 🎉\n\nהירשמו עכשיו ותיהנו מכל התכונות ללא עלות.\n\nבעתיד יהיו תוכניות שונות לפי נפח השימוש.`
  },
  {
    id: 'security',
    label: '🔐 מה עם אבטחה?',
    answer: `האבטחה שלנו ברמה הגבוהה ביותר:\n\n• 🔑 הצפנת AES-256-GCM לנתונים רגישים\n• 🍪 JWT tokens עם תפוגה\n• 🛡️ אין שמירת סיסמאות פייסבוק\n• 🔒 חיבור מאובטח בלבד (HTTPS)\n• 📋 עמידה בתקנות הגנת הפרטיות`
  },
  {
    id: 'start',
    label: '🚀 איך מתחילים?',
    answer: `פשוט מאוד:\n\n1. לחצו "הרשמה" בתפריט העליון\n2. הזינו אימייל וסיסמה\n3. חברו את חשבון הפייסבוק\n4. ותתחילו לפרסם!\n\nכל התהליך לוקח פחות מ-2 דקות ⚡`
  },
]

const WELCOME_MESSAGE = {
  from: 'bot',
  text: `שלום! אני ${AGENT_NAME} 👋\nאיך אפשר לעזור? בחרו נושא:`,
}

export default function LandingChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [showTopics, setShowTopics] = useState(true)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleTopic = (topic) => {
    setMessages(prev => [
      ...prev,
      { from: 'user', text: topic.label },
      { from: 'bot', text: topic.answer },
    ])
    setShowTopics(false)
    // Show "back to menu" after a short moment
    setTimeout(() => setShowTopics(true), 300)
  }

  const handleBack = () => {
    setMessages([WELCOME_MESSAGE])
    setShowTopics(true)
  }

  return (
    <>
      {!open && (
        <button className="lcb-fab" onClick={() => setOpen(true)} aria-label="צ׳אט עזרה">
          <img src="/bot-avatar.svg" alt="צ'אט" className="lcb-fab-img" />
        </button>
      )}

      {open && (
        <div className="lcb-panel" ref={panelRef}>
          <div className="lcb-header">
            <div className="lcb-header-info">
              <img src="/bot-avatar.svg" alt="פוסטי" className="lcb-avatar" />
              <span className="lcb-title">{AGENT_NAME}, עוזר PostIt</span>
            </div>
            <button className="lcb-close" onClick={() => setOpen(false)} aria-label="סגור">✕</button>
          </div>

          <div className="lcb-body">
            {messages.map((msg, i) => (
              <div key={i} className={`lcb-msg lcb-msg-${msg.from}`}>
                {msg.text.split('\n').map((line, j) => (
                  <span key={j}>{line}<br /></span>
                ))}
              </div>
            ))}

            {showTopics && (
              <div className="lcb-topics">
                {TOPICS.map(topic => (
                  <button key={topic.id} className="lcb-topic-btn" onClick={() => handleTopic(topic)}>
                    {topic.label}
                  </button>
                ))}
                {messages.length > 1 && (
                  <button className="lcb-topic-btn lcb-back-btn" onClick={handleBack}>
                    🔙 חזרה לתפריט
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
