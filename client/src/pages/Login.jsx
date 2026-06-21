import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import locale from '../assets/i18n'
import '../styles/login.css'

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [facebookAppId, setFacebookAppId] = useState('')
  const [facebookAppSecret, setFacebookAppSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  // Check if already logged in (try refresh token)
  useEffect(() => {
    authAPI.refresh()
      .then(() => navigate('/dashboard'))
      .catch(() => {}) // Not logged in - stay on login page
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (isRegister) {
        await authAPI.register(email, password, name, facebookAppId, facebookAppSecret)
      } else {
        await authAPI.login(email, password)
      }
      navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>📌 PostIt</h1>
          <p>{locale.login.subtitle}</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${!isRegister ? 'active' : ''}`}
            onClick={() => { setIsRegister(false); setError(null) }}
          >
            {locale.login.loginTab}
          </button>
          <button
            className={`login-tab ${isRegister ? 'active' : ''}`}
            onClick={() => { setIsRegister(true); setError(null) }}
          >
            {locale.login.registerTab}
          </button>
        </div>

        <form className="login-content" onSubmit={handleSubmit}>
          {isRegister && (
            <input
              type="text"
              className="login-input"
              placeholder={locale.login.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            className="login-input"
            placeholder={locale.login.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="login-input"
            placeholder={locale.login.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {isRegister && (
            <>
              <div className="login-section-label">{locale.login.facebookCredentialsLabel}</div>
              <input
                type="text"
                className="login-input"
                placeholder={locale.login.facebookAppIdPlaceholder}
                value={facebookAppId}
                onChange={(e) => setFacebookAppId(e.target.value)}
                required
              />
              <input
                type="password"
                className="login-input"
                placeholder={locale.login.facebookAppSecretPlaceholder}
                value={facebookAppSecret}
                onChange={(e) => setFacebookAppSecret(e.target.value)}
                required
              />
            </>
          )}
          <button
            type="submit"
            className="facebook-login-btn"
            disabled={loading}
          >
            {loading
              ? '⏳ ...'
              : isRegister
                ? locale.login.registerBtn
                : locale.login.loginBtn
            }
          </button>

          {error && <div className="login-error">{error}</div>}
        </form>
      </div>
    </div>
  )
}
