import { BookOpen } from 'lucide-react'
import '../styles/guides.css'

export default function Guides() {
  return (
    <div className="guides-page">
      <div className="guides-header">
        <BookOpen size={24} />
        <h1>מדריכים</h1>
      </div>
      <div className="guides-empty">
        <div className="guides-empty-icon">📚</div>
        <h2>בקרוב כאן יהיו מדריכים</h2>
        <p>אנחנו עובדים על מדריכים מפורטים שיעזרו לך להפיק את המקסימום מ-Possbo</p>
      </div>
    </div>
  )
}
