import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import { useAppData } from '../context/DataProvider'
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
    if (password.length < 6) {
      setError('סיסמה חייבת להכיל לפחות 6 תווים')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await authAPI.register(email, password, name, gender, phone)
      if (res.data?.user) {
        setUser(res.data.user)
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

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? '⏳ נרשם...' : '📝 הירשם'}
          </button>
        </form>

        <div className="auth-footer">
          <span>כבר יש לך חשבון? </span>
          <Link to="/login">התחבר</Link>
        </div>
      </div>
      )}
    </div>
  )
}
