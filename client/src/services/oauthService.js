import http from './http'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID
const LINKEDIN_CLIENT_ID = import.meta.env.VITE_LINKEDIN_CLIENT_ID
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID

// ─── Google ───────────────────────────────────────────────
export function loginWithGoogle(mode = 'login') {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google SDK not loaded'))
      return
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const res = await http.post('/api/oauth/google', {
            credential: response.credential,
            mode,
          })
          resolve(res.data)
        } catch (err) {
          reject(err)
        }
      },
    })
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: use button-style popup
        const btn = document.createElement('div')
        btn.id = 'g_id_onload_temp'
        btn.style.display = 'none'
        document.body.appendChild(btn)
        window.google.accounts.id.renderButton(btn, {
          type: 'icon',
          size: 'large',
        })
        setTimeout(() => {
          btn.querySelector('div[role="button"]')?.click()
          setTimeout(() => btn.remove(), 100)
        }, 100)
      }
    })
  })
}

// ─── Facebook ─────────────────────────────────────────────
function loadFacebookSDK() {
  return new Promise((resolve) => {
    if (window.FB) { resolve(); return }
    window.fbAsyncInit = () => {
      window.FB.init({ appId: FACEBOOK_APP_ID, cookie: true, xfbml: false, version: 'v18.0' })
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    document.body.appendChild(script)
  })
}

export function loginWithFacebook(mode = 'login') {
  return new Promise((resolve, reject) => {
    loadFacebookSDK().then(() => {
      window.FB.login((response) => {
        if (response.authResponse) {
          http.post('/api/oauth/facebook', {
            accessToken: response.authResponse.accessToken,
            mode,
          }).then(res => resolve(res.data)).catch(err => reject(err))
        } else {
          reject(new Error('Facebook login cancelled'))
        }
      }, { scope: 'email,public_profile' })
    }).catch(reject)
  })
}

// ─── GitHub ───────────────────────────────────────────────
export function loginWithGithub(mode = 'login') {
  return new Promise((resolve, reject) => {
    const redirectUri = `${window.location.origin}/oauth/github/callback`
    const state = JSON.stringify({ mode })
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${encodeURIComponent(state)}`
    
    const popup = window.open(url, 'github-oauth', 'width=600,height=700,left=200,top=100')
    if (!popup) {
      reject(new Error('GitHub popup blocked'))
      return
    }

    let timer
    
    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'github-oauth-callback') return
      clearInterval(timer)
      window.removeEventListener('message', handleMessage)
      
      try {
        const res = await http.post('/api/oauth/github', {
          code: event.data.code,
          mode,
        })
        resolve(res.data)
      } catch (err) {
        reject(err)
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    // Fallback if popup closes
    timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer)
        window.removeEventListener('message', handleMessage)
        reject(new Error('GitHub login cancelled'))
      }
    }, 500)
  })
}

// ─── LinkedIn ─────────────────────────────────────────────
export function loginWithLinkedin(mode = 'login') {
  return new Promise((resolve, reject) => {
    const redirectUri = `${window.location.origin}/oauth/linkedin/callback`
    const state = JSON.stringify({ mode })
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20profile%20email&state=${encodeURIComponent(state)}`
    
    const popup = window.open(url, 'linkedin-oauth', 'width=600,height=700,left=200,top=100')
    if (!popup) {
      reject(new Error('LinkedIn popup blocked'))
      return
    }

    let timer
    
    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'linkedin-oauth-callback') return
      clearInterval(timer)
      window.removeEventListener('message', handleMessage)
      
      try {
        const res = await http.post('/api/oauth/linkedin', {
          code: event.data.code,
          mode,
        })
        resolve(res.data)
      } catch (err) {
        reject(err)
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer)
        window.removeEventListener('message', handleMessage)
        reject(new Error('LinkedIn login cancelled'))
      }
    }, 500)
  })
}

// ─── Apple ────────────────────────────────────────────────
export function loginWithApple(mode = 'login') {
  return new Promise((resolve, reject) => {
    const redirectUri = `${window.location.origin}/oauth/apple/callback`
    const state = JSON.stringify({ mode })
    const url = `https://appleid.apple.com/auth/authorize?client_id=${APPLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code%20id_token&scope=name%20email&response_mode=fragment&state=${encodeURIComponent(state)}`

    const popup = window.open(url, 'apple-oauth', 'width=600,height=700,left=200,top=100')
    if (!popup) {
      reject(new Error('Apple popup blocked'))
      return
    }

    let timer

    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'apple-oauth-callback') return
      clearInterval(timer)
      window.removeEventListener('message', handleMessage)

      http.post('/api/oauth/apple', {
        code: event.data.code,
        id_token: event.data.id_token,
        mode,
      }).then(res => resolve(res.data)).catch(err => reject(err))
    }

    window.addEventListener('message', handleMessage)

    timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer)
        window.removeEventListener('message', handleMessage)
        reject(new Error('Apple login cancelled'))
      }
    }, 500)
  })
}
