import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import { useAppData } from '../context/DataProvider'
import OAuthButtons from '../components/OAuthButtons'
import Turnstile from '../components/Turnstile'
import BrandLogo from '../components/BrandLogo'
import '../styles/auth.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [captchaToken, setCaptchaToken] = useState(null)
  const navigate = useNavigate()
  const { checkAuth, loginSuccess, user, authChecked } = useAppData()

  // Wait for DataProvider's initial auth check
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
    if (!captchaToken) {
      setError('יש לאמת שאתה לא רובוט')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await authAPI.login(email, password, captchaToken)
      if (res.data?.user) {
        loginSuccess(res.data.user)
        navigate('/dashboard')
      } else {
        await checkAuth()
        navigate('/dashboard')
      }
    } catch (err) {
      if (!navigator.onLine || err.code === 'ERR_NETWORK') {
        setError('אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב.')
      } else {
        setError(err.userMessage || 'שגיאה בהתחברות. נסה שוב מאוחר יותר.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      {checkingAuth ? (
        <div className="auth-loading">
          <div className="auth-loading-mark">P</div>
        </div>
      ) : (
      <div className="auth-card">
        <div className="auth-toprow">
          <Link to="/" className="auth-toprow-logo"><BrandLogo className="auth-logo-img" /></Link>
          <Link to="/" className="auth-back-btn">←</Link>
        </div>
        <div className="auth-header">
          <h2>התחברות</h2>
          <p>התחבר לחשבון שלך</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="email"
            className="auth-input"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="auth-input"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="auth-forgot-link">
            <Link to="/forgot-password">שכחת סיסמה?</Link>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <Turnstile onVerify={setCaptchaToken} />

          <button type="submit" className="auth-submit-btn" disabled={loading || !captchaToken}>
            {loading ? 'מתחבר...' : 'התחבר'}
          </button>
        </form>

        <div className="auth-divider"><span>התחבר באמצעות</span></div>

        <OAuthButtons
          mode="login"
          onSuccess={(result) => {
            if (result.user) loginSuccess(result.user)
            setTimeout(() => navigate('/dashboard'), 0)
          }}
          onError={(msg) => setError(msg)}
        />

        <div className="auth-footer">
          <span>אין לך חשבון? </span>
          <Link to="/register">הירשם</Link>
        </div>
      </div>
      )}
    </div>
  )
}
