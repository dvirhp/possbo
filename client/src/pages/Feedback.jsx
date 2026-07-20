import { useState } from 'react'
import { MessageSquareHeart } from 'lucide-react'
import http from '../services/http.js'
import '../styles/feedback.css'

const FEATURE_OPTIONS = [
  'חיפוש', 'משרות מומלצות', 'עדכונים', 'עדכוני זמן אמת',
  'טלגרם', 'וואטסאפ', 'חיפוש חברות', 'חיפושים שמורים',
  'מסך ניהול הגשות', 'סוכן קורות החיים', 'הגשות אוטומטיות',
  'ממליצים', 'שדרוג קורות חיים',
]

const QUESTIONS = [
  { key: 'favorite', label: 'מה הכי אהבת?' },
  { key: 'leastFavorite', label: 'מה הכי פחות אהבת?' },
  { key: 'searchFeedback', label: 'מה דעתך על החיפוש? מה עובד טוב בחיפוש ומה לא?' },
  { key: 'jobScreenFeedback', label: 'מסך משרה – מה היית רוצה לשנות או לשפר?' },
  { key: 'missingFree', label: 'מה חסר לך היום בגרסה החינמית?' },
  { key: 'upgradeTrigger', label: 'מה היה גורם לך לשדרג למנוי פרימיום?' },
]

export default function Feedback() {
  const [selectedFeatures, setSelectedFeatures] = useState([])
  const [answers, setAnswers] = useState({})
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const toggleFeature = (f) => {
    setSelectedFeatures(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    )
  }

  const handleSubmit = async () => {
    setSending(true)
    setError('')
    try {
      await http.post('/feedback', {
        features: selectedFeatures,
        answers,
        prompt,
      })
      setSent(true)
    } catch {
      setError('שגיאה בשליחה, נסו שוב.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="feedback-page">
        <div className="feedback-success">
          <div className="feedback-success-icon">💜</div>
          <h2>תודה על הפידבק!</h2>
          <p>אנחנו קוראים ומיישמים כל מילה.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="feedback-page">
      <div className="feedback-header">
        <MessageSquareHeart size={24} />
        <h1>פידבק</h1>
      </div>
      <p className="feedback-subtitle">
        קצת ארוך, אבל אנחנו קוראים ומיישמים כל מילה.<br />
        אפשר לענות רק על מה שרלוונטי לך :)
      </p>

      {/* Feature chips */}
      <div className="feedback-section">
        <h3 className="feedback-question">באילו פיצ׳רים של המערכת יצא לך להשתמש?</h3>
        <div className="feedback-chips">
          {FEATURE_OPTIONS.map(f => (
            <button
              key={f}
              className={`feedback-chip ${selectedFeatures.includes(f) ? 'active' : ''}`}
              onClick={() => toggleFeature(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Text questions */}
      {QUESTIONS.map(q => (
        <div key={q.key} className="feedback-section">
          <h3 className="feedback-question">{q.label}</h3>
          <textarea
            className="feedback-textarea"
            placeholder="כתבו כאן..."
            value={answers[q.key] || ''}
            onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
          />
        </div>
      ))}

      {/* Prompt section */}
      <div className="feedback-section">
        <h3 className="feedback-question">יש לך פרומפט? הוא יהפוך לפיצ׳ר</h3>
        <p className="feedback-hint">הפרומפטים הטובים יהיו אצלנו as-is.</p>
        <textarea
          className="feedback-textarea feedback-textarea-lg"
          placeholder="פרומפט מפורט שמסביר בדיוק מה השינוי שהיית רוצה שיקרה, ואנחנו נריץ אותו עם Claude Code והוא ייכנס למערכת"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
      </div>

      {error && <p className="feedback-error">{error}</p>}

      <div className="feedback-submit-wrap">
        <button
          className="feedback-submit-btn"
          onClick={handleSubmit}
          disabled={sending}
        >
          {sending ? 'שולח...' : 'שליחה'}
        </button>
      </div>
    </div>
  )
}
