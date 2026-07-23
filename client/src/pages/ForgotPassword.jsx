import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import OtpInput from '../components/OtpInput'
import '../styles/auth.css'

export default function ForgotPassword() {
  const [step, setStep] = useState(1) // 1=email, 2=code+new password
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSendCode = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('יש להזין אימייל')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await authAPI.forgotPassword({ email })
      setStep(2)
    } catch (err) {
      setError(err.userMessage || 'שגיאה בשליחת הקוד')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!code.trim()) {
      setError('יש להזין את הקוד שנשלח למייל')
      return
    }
    if (newPassword.length < 6) {
      setError('סיסמה חייבת להכיל לפחות 6 תווים')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('הסיסמאות לא תואמות')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await authAPI.resetPassword({ email, code, newPassword })
      if (res.data.success) {
        setSuccess(true)
        setTimeout(() => navigate('/login'), 2500)
      }
    } catch (err) {
      setError(err.userMessage || 'שגיאה באיפוס הסיסמה')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setLoading(true)
    setError(null)
    try {
      await authAPI.forgotPassword({ email })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <Link to="/login" className="auth-back-btn">←</Link>
        <div className="auth-header">
          <div className="auth-logo"><img src="/logo.svg" alt="Possbo" className="auth-logo-img auth-logo-wordmark" /></div>
          <h2>{step === 1 ? 'שכחת סיסמה?' : 'איפוס סיסמה'}</h2>
          <p>{step === 1 ? 'הזן את האימייל שלך ונשלח לך קוד' : `הזן את הקוד שנשלח ל-${email}`}</p>
        </div>

        {success ? (
          <div className="auth-form">
            <div className="auth-success-msg">
              ✓ הסיסמה אופסה בהצלחה! מעביר להתחברות...
            </div>
          </div>
        ) : step === 1 ? (
          <form className="auth-form" onSubmit={handleSendCode}>
            <input
              type="email"
              className="auth-input"
              placeholder="האימייל שנרשמת איתו"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              dir="ltr"
            />

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? '⏳ שולח...' : '📧 שלח קוד איפוס'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleResetPassword}>
            <OtpInput length={6} value={code} onChange={setCode} />
            <input
              type="password"
              className="auth-input"
              placeholder="סיסמה חדשה (לפחות 6 תווים)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              dir="ltr"
            />
            <input
              type="password"
              className="auth-input"
              placeholder="אימות סיסמה חדשה"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              dir="ltr"
            />

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit-btn" disabled={loading || code.length < 6}>
              {loading ? '⏳ מאפס...' : '🔑 אפס סיסמה'}
            </button>

            <div className="auth-footer" style={{ paddingBottom: 0 }}>
              <span>לא קיבלת? </span>
              <button type="button" className="auth-link-btn" onClick={handleResend} disabled={loading}>
                שלח שוב
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer">
          <span>נזכרת? </span>
          <Link to="/login">חזרה להתחברות</Link>
        </div>
      </div>
    </div>
  )
}
