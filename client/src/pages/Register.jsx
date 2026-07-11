import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import { useAppData } from '../context/DataProvider'
import OAuthButtons from '../components/OAuthButtons'
import Turnstile from '../components/Turnstile'
import '../styles/auth.css'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  // Verification step
  const [verificationStep, setVerificationStep] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [resending, setResending] = useState(false)
  const [captchaToken, setCaptchaToken] = useState(null)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const navigate = useNavigate()
  const { checkAuth, setUser, user, authChecked } = useAppData()

  useEffect(() => {
    if (!authChecked) return
    if (user) {
      navigate('/dashboard', { replace: true })
    } else {
      setCheckingAuth(false)
    }
  }, [authChecked, user, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      setError('אימייל וסיסמה הם שדות חובה')
      return
    }
    if (password.length < 6) {
      setError('סיסמה חייבת להכיל לפחות 6 תווים')
      return
    }
    if (!captchaToken) {
      setError('יש לאמת שאתה לא רובוט')
      return
    }
    if (!agreedToTerms) {
      setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await authAPI.register(email, password, name, gender, phone, captchaToken)
      if (res.data?.requiresVerification) {
        setVerificationStep(true)
      } else if (res.data?.user) {
        setUser(res.data.user)
        setTimeout(() => navigate('/dashboard'), 0)
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!verificationCode.trim()) {
      setError('יש להזין את הקוד שנשלח')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await authAPI.verifyEmail({ email, code: verificationCode })
      if (res.data?.user) {
        setUser(res.data.user)
        setTimeout(() => navigate('/dashboard'), 0)
      } else {
        await checkAuth()
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setError(null)
    try {
      await authAPI.resendCode({ email })
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשליחה חוזרת')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="auth-container">
      {checkingAuth ? (
        <div className="auth-loading">
          <div className="auth-loading-mark">P</div>
        </div>
      ) : verificationStep ? (
        <div className="auth-card">
          <button className="auth-back-btn" onClick={() => setVerificationStep(false)}>←</button>
          <div className="auth-header">
            <div className="auth-logo"><img src="/logo.svg" alt="PostIt" className="auth-logo-img" /> PostIt</div>
            <h2>אימות אימייל</h2>
            <p>שלחנו קוד בן 6 ספרות ל-<strong>{email}</strong></p>
          </div>

          <form className="auth-form" onSubmit={handleVerify}>
            <input
              type="text"
              className="auth-input auth-code-input"
              placeholder="הזן קוד אימות"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoFocus
              dir="ltr"
              style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '6px' }}
            />

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit-btn" disabled={loading || verificationCode.length < 6}>
              {loading ? '⏳ מאמת...' : '✓ אמת והירשם'}
            </button>
          </form>

          <div className="auth-footer">
            <span>לא קיבלת? </span>
            <button className="auth-link-btn" onClick={handleResend} disabled={resending}>
              {resending ? 'שולח...' : 'שלח שוב'}
            </button>
          </div>
        </div>
      ) : (
      <div className="auth-card">
        <Link to="/" className="auth-back-btn">←</Link>
        <div className="auth-header">
          <Link to="/" className="auth-logo"><img src="/logo.svg" alt="PostIt" className="auth-logo-img" /> PostIt</Link>
          <h2>הרשמה</h2>
          <p>צור חשבון חדש והתחל לפרסם</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="auth-input"
            placeholder="שם מלא"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="email"
            className="auth-input"
            placeholder="אימייל *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="auth-input"
            placeholder="סיסמה (לפחות 6 תווים) *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="tel"
            className="auth-input"
            placeholder="מספר טלפון"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div className="auth-select-wrapper">
            <select
              className="auth-input auth-select"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">מין (אופציונלי)</option>
              <option value="male">זכר</option>
              <option value="female">נקבה</option>
            </select>
          </div>

          <label className={`auth-terms-checkbox ${!agreedToTerms && error?.includes('תנאי') ? 'auth-terms-error' : ''}`}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
            />
            <span>אני מסכים/ה ל<Link to="/privacy" target="_blank">תנאי השימוש ומדיניות הפרטיות</Link></span>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <Turnstile onVerify={setCaptchaToken} />

          <button type="submit" className="auth-submit-btn" disabled={loading || !captchaToken || !agreedToTerms}>
            {loading ? '⏳ שולח קוד...' : '📝 הירשם'}
          </button>
        </form>

        <div className="auth-divider"><span>או הירשם עם</span></div>

        <OAuthButtons
          mode="register"
          onSuccess={(result) => {
            if (result.user) setUser(result.user)
            setTimeout(() => navigate('/dashboard'), 0)
          }}
          onError={(msg) => setError(msg)}
        />

        <p className="auth-oauth-terms">
          בהרשמה דרך אחת הפלטפורמות, הנך מאשר/ת את <Link to="/privacy" target="_blank">תנאי השימוש ומדיניות הפרטיות</Link>
        </p>

        <div className="auth-footer">
          <span>כבר יש לך חשבון? </span>
          <Link to="/login">התחבר</Link>
        </div>
      </div>
      )}
    </div>
  )
}
