import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function OAuthCallback() {
  const [params] = useSearchParams()

  useEffect(() => {
    const path = window.location.pathname
    let provider = 'github'
    if (path.includes('linkedin')) provider = 'linkedin'
    else if (path.includes('apple')) provider = 'apple'

    if (provider === 'apple') {
      // Apple uses fragment response_mode
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
    } else {
      const code = params.get('code')
      if (code && window.opener) {
        window.opener.postMessage({
          type: `${provider}-oauth-callback`,
          code,
        }, window.location.origin)
        window.close()
      }
    }
  }, [params])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#16181d', color: '#e8ecf0' }}>
      <p>מעבד... ניתן לסגור חלון זה</p>
    </div>
  )
}
