import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import BackButton from '../components/BackButton'
import '../styles/auth.css'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('')
  const [facebookAppId, setFacebookAppId] = useState('')
  const [facebookAppSecret, setFacebookAppSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

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
    if (!facebookAppId || !facebookAppSecret) {
      setError('יש להזין Facebook App ID ו-App Secret')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await authAPI.register(email, password, name, facebookAppId, facebookAppSecret, gender, phone)
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
      <div className="auth-card">
        <div className="auth-header">
          <BackButton />
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

          <div className="auth-section-divider">
            <span>פרטי פייסבוק</span>
          </div>

          <input
            type="text"
            className="auth-input"
            placeholder="Facebook App ID *"
            value={facebookAppId}
            onChange={(e) => setFacebookAppId(e.target.value)}
            required
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Facebook App Secret *"
            value={facebookAppSecret}
            onChange={(e) => setFacebookAppSecret(e.target.value)}
            required
          />

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
    </div>
  )
}
