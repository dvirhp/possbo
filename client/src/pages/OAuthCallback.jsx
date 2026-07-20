import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function OAuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('מעבד...')

  useEffect(() => {
    const path = window.location.pathname
    let provider = 'github'
    if (path.includes('linkedin')) provider = 'linkedin'
    else if (path.includes('apple')) provider = 'apple'
    else if (path.includes('instagram')) provider = 'instagram'

    if (provider === 'apple') {
      const hash = window.location.hash.substring(1)
      const fragParams = new URLSearchParams(hash)
      const code = fragParams.get('code')
      const id_token = fragParams.get('id_token')
      if (window.opener) {
        window.opener.postMessage({
          type: 'apple-oauth-callback',
          code,
          id_token,
        }, window.location.origin)
        window.close()
      }
      return
    }

    if (provider === 'instagram') {
      // Instagram flow: server already exchanged the code and saved the token
      // We just need to notify the opener window
      const success = params.get('success') === 'true'
      const username = params.get('username')
      const error = params.get('error')
      console.log('[OAuthCallback] Instagram:', { success, username, error, hasOpener: !!window.opener })

      if (window.opener) {
        window.opener.postMessage({
          type: 'instagram-oauth-callback',
          success,
          username,
          error,
        }, window.location.origin)
        console.log('[OAuthCallback] postMessage sent to opener, origin:', window.location.origin)
        setStatus(success ? 'הצלחה! סוגר חלון...' : 'שגיאה: ' + (error || 'unknown'))
        setTimeout(() => window.close(), 500)
      } else {
        // No opener — close this window or redirect
        if (success) {
          setStatus('Instagram חובר בהצלחה! ניתן לסגור חלון זה.')
          // Try to close, if can't — show message
          setTimeout(() => window.close(), 1000)
        } else {
          setStatus('שגיאה: ' + (error || 'unknown'))
        }
      }
      return
    }

    // GitHub / LinkedIn flow (uses code + postMessage)
    let code = params.get('code')
    if (code && code.endsWith('#_')) {
      code = code.slice(0, -2)
    }

    const error = params.get('error')
    if (error) {
      setStatus('ההרשאה נדחתה')
      if (window.opener) {
        window.opener.postMessage({
          type: `${provider}-oauth-callback`,
          error,
          errorDescription: params.get('error_description'),
        }, window.location.origin)
        setTimeout(() => window.close(), 1000)
      }
      return
    }

    if (code && window.opener) {
      window.opener.postMessage({
        type: `${provider}-oauth-callback`,
        code,
      }, window.location.origin)
      setStatus('הצלחה! סוגר חלון...')
      setTimeout(() => window.close(), 500)
    }
  }, [params, navigate])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#16181d', color: '#e8ecf0', flexDirection: 'column', gap: '1rem' }}>
      <div className="spinner" style={{ width: 40, height: 40, border: '3px solid #333', borderTopColor: '#6c5ce7', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p>{status}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
