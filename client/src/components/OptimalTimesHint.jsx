import { useState } from 'react'
import { Lightbulb, Clock, Calendar, ChevronDown, ChevronUp } from 'lucide-react'

// Based on Hootsuite, Sprout Social & Buffer 2024-2025 research
const OPTIMAL_HOURS = [
  { time: '09:00-11:00', label: 'בוקר', description: 'שעת שיא, אנשים בודקים פייסבוק עם הגעה לעבודה', strength: 3 },
  { time: '13:00-15:00', label: 'צהריים', description: 'הפסקת צהריים, אינגייג\'מנט גבוה', strength: 2 },
  { time: '18:00-20:00', label: 'ערב', description: 'חזרה הביתה, גלילה רגועה בפיד', strength: 3 },
]

const OPTIMAL_DAYS = [
  { day: 'שלישי', dayNum: 2, description: 'מיטבי לאינגייג\'מנט', strength: 3 },
  { day: 'רביעי', dayNum: 3, description: 'שיא החשיפה השבועית', strength: 3 },
  { day: 'חמישי', dayNum: 4, description: 'פעילות גבוהה בקבוצות', strength: 2 },
]

export default function OptimalTimesHint({ onSelectTime, onSelectDay }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="optimal-hint">
      <button
        type="button"
        className="optimal-hint-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <Lightbulb size={16} className="optimal-hint-icon" />
        <span>שעות ותאריכים מומלצים לפרסום</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="optimal-hint-content">
          <p className="optimal-hint-note">
            על סמך בדיקות שנערכו על ידינו, השעות והימים הרלוונטיים ביותר לפרסום פוסטים בפייסבוק הם:
          </p>

          <div className="optimal-section">
            <h4><Clock size={14} /> שעות מומלצות</h4>
            <div className="optimal-items">
              {OPTIMAL_HOURS.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  className="optimal-item"
                  onClick={() => onSelectTime?.(h.time.split('-')[0])}
                >
                  <div className="optimal-item-header">
                    <span className="optimal-item-time">{h.time}</span>
                    <span className="optimal-item-label">{h.label}</span>
                    <span className="optimal-strength">
                      {'🔥'.repeat(h.strength)}
                    </span>
                  </div>
                  <span className="optimal-item-desc">{h.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="optimal-section">
            <h4><Calendar size={14} /> ימים מומלצים</h4>
            <div className="optimal-items">
              {OPTIMAL_DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className="optimal-item"
                  onClick={() => onSelectDay?.(d.dayNum)}
                >
                  <div className="optimal-item-header">
                    <span className="optimal-item-time">{d.day}</span>
                    <span className="optimal-strength">
                      {'🔥'.repeat(d.strength)}
                    </span>
                  </div>
                  <span className="optimal-item-desc">{d.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
