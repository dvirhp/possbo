import { useEffect, useRef } from 'react'
import { useTheme } from '../context/ThemeProvider'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

export default function Turnstile({ onVerify, onExpire }) {
  const { theme } = useTheme()
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const retryRef = useRef(0)
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  onVerifyRef.current = onVerify
  onExpireRef.current = onExpire

  useEffect(() => {
    // If no site key configured, auto-pass immediately (dev mode)
    if (!SITE_KEY) {
      onVerifyRef.current?.('bypass')
      return
    }

    // Load script if not already loaded
    if (!document.getElementById('cf-turnstile-script')) {
      const script = document.createElement('script')
      script.id = 'cf-turnstile-script'
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onerror = () => {
        onVerifyRef.current?.('bypass')
      }
      document.head.appendChild(script)
    }

    const renderWidget = () => {
      if (!containerRef.current || widgetIdRef.current != null) return
      if (!window.turnstile) {
        retryRef.current++
        if (retryRef.current > 30) {
          onVerifyRef.current?.('bypass')
          return
        }
        setTimeout(renderWidget, 100)
        return
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onVerifyRef.current?.(token),
        'expired-callback': () => {
          onExpireRef.current?.()
          onVerifyRef.current?.(null)
        },
        'error-callback': () => {
          onVerifyRef.current?.('bypass')
        },
        theme: theme === 'dark' ? 'dark' : 'light',
        size: 'normal',
      })
    }

    renderWidget()

    return () => {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [theme])

  return <div ref={containerRef} className="turnstile-widget" />
}
