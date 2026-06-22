import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import '../styles/auth.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    authAPI.refresh()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setCheckingAuth(false))
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      setError('אימייל וסיסמה הם שדות חובה')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await authAPI.login(email, password)
      navigate('/dashboard')
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

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? '⏳ מתחבר...' : '🔑 התחבר'}
          </button>
        </form>

        <div className="auth-footer">
          <span>אין לך חשבון? </span>
          <Link to="/register">הירשם</Link>
        </div>
      </div>
      )}
    </div>
  )
}
