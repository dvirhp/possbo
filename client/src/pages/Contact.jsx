import { useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import http, { getAccessToken } from '../services/http'
import '../styles/auth.css'

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
}

export default function Contact() {
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleLogoClick = () => {
    navigate(getAccessToken() ? '/dashboard' : '/')
  }

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('יש למלא שם, אימייל ותוכן הודעה.')
      return
    }

    setSending(true)
    try {
      await http.post('/contact', form)
      setSent(true)
      setForm(INITIAL_FORM)
    } catch (err) {
      setError(err.userMessage || 'לא הצלחנו לשלוח את הפנייה כרגע. נסו שוב בעוד רגע.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="privacy-page contact-page">
        <div className="privacy-topbar">
          <BrandLogo className="privacy-logo-img" onClick={handleLogoClick} style={{ cursor: 'pointer' }} />
          <h1 className="privacy-topbar-title">צור קשר</h1>
          <button onClick={() => navigate(-1)} className="privacy-back-btn" aria-label="חזור">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>

        <div className="privacy-content">
          <section className="privacy-section contact-intro">
            <div className="contact-intro-icon" aria-hidden="true">
              <Mail size={22} strokeWidth={1.9} />
            </div>
            <h2>נשמח לשמוע ממך</h2>
            <p>אפשר לשלוח לנו שאלה, בקשה, תקלה או כל דבר שקשור ל-Possbo. הפנייה תישלח ישירות למייל התמיכה שלנו.</p>
            <div className="privacy-contact">
              <a href="mailto:possbonoweasyway@gmail.com">possbonoweasyway@gmail.com</a>
            </div>
          </section>

          <section className="privacy-section">
            <h2>פרטי הפנייה</h2>
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="contact-field">
                <label htmlFor="contact-name">שם מלא *</label>
                <input
                  id="contact-name"
                  value={form.name}
                  onChange={event => updateField('name', event.target.value)}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="contact-field">
                <label htmlFor="contact-email">אימייל *</label>
                <input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={event => updateField('email', event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="contact-field">
                <label htmlFor="contact-phone">טלפון</label>
                <input
                  id="contact-phone"
                  type="tel"
                  value={form.phone}
                  onChange={event => updateField('phone', event.target.value)}
                  autoComplete="tel"
                />
              </div>

              <div className="contact-field">
                <label htmlFor="contact-subject">נושא</label>
                <input
                  id="contact-subject"
                  value={form.subject}
                  onChange={event => updateField('subject', event.target.value)}
                />
              </div>

              <div className="contact-field contact-field-full">
                <label htmlFor="contact-message">תוכן ההודעה *</label>
                <textarea
                  id="contact-message"
                  value={form.message}
                  onChange={event => updateField('message', event.target.value)}
                  rows={7}
                  required
                />
              </div>

              <div className="contact-form-status" aria-live="polite">
                {error && <p className="contact-error">{error}</p>}
                {sent && <p className="contact-success">הפנייה נשלחה בהצלחה. נחזור אליך בהקדם.</p>}
              </div>

              <button className="contact-submit" type="submit" disabled={sending}>
                <Send size={18} strokeWidth={1.9} aria-hidden="true" />
                <span>{sending ? 'שולח...' : 'שליחת פנייה'}</span>
              </button>
            </form>
          </section>
        </div>

        <div className="privacy-footer">
          <p>© {new Date().getFullYear()} Possbo. כל הזכויות שמורות.</p>
        </div>
      </div>
    </div>
  )
}
