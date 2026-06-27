import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import { useAppData } from '../context/DataProvider'
import OAuthButtons from '../components/OAuthButtons'
import Turnstile from '../components/Turnstile'
import '../styles/auth.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [captchaToken, setCaptchaToken] = useState(null)
  const navigate = useNavigate()
  const { checkAuth, setUser, user, authChecked } = useAppData()

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
        setUser(res.data.user)
        // Wait for state to propagate before navigating
        setTimeout(() => navigate('/dashboard'), 0)
      } else {
        await checkAuth()
        navigate('/dashboard')
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setError(msg)
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
        <Link to="/" className="auth-back-btn">←</Link>
        <div className="auth-header">
          <Link to="/" className="auth-logo">📌 PostIt</Link>
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
            {loading ? '⏳ מתחבר...' : '🔑 התחבר'}
          </button>
        </form>

        <div className="auth-divider"><span>או התחבר עם</span></div>

        <OAuthButtons
          mode="login"
          onSuccess={(result) => {
            if (result.user) setUser(result.user)
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
