import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { groupsService } from '../services/groupsService'
import locale from '../assets/i18n'
import '../styles/login.css'

export default function Login() {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [showInstruction, setShowInstruction] = useState(false)
  const navigate = useNavigate()

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      const res = await groupsService.bootstrapSession()
      if (res.data.success && res.data.sessionExists) {
        localStorage.setItem('fbSessionReady', 'true')
        navigate('/dashboard')
      } else {
        // Server returned that session is needed - show instruction
        setShowInstruction(true)
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      if (msg === 'FACEBOOK_SESSION_REQUIRED') {
        setShowInstruction(true)
      } else {
        setError(`${locale.errors.generic} ${msg}`)
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>📌 PostIt</h1>
          <p>חיפוש וצילום קבוצות פייסבוק</p>
        </div>

        <div className="login-content">
          {!showInstruction ? (
            <>
              <p className="login-description">
                לחץ על הכפתור. אחרי זה, בטרמינל, הרץ את הפקודה שתתקבל.
              </p>

              <button
                className="facebook-login-btn"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? '⏳ בודק סשן...' : '🔗 בדוק סשן פייסבוק'}
              </button>
            </>
          ) : (
            <div className="instruction-box">
              <h3>📋 צעדים:</h3>
              <ol>
                <li>בטרמינל בתיקיית server, הרץ:
                  <pre className="command">npm run bootstrap-session</pre>
                </li>
                <li>דפדפן יתפתח - התחבר לפייסבוק</li>
                <li>אחרי ההתחברות, חוזר לכאן ולחץ "בדוק סשן"</li>
              </ol>
              <button
                className="facebook-login-btn"
                onClick={handleConnect}
              >
                ✅ סיימתי - בדוק סשן
              </button>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
