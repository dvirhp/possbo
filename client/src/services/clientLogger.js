const LOG_ENDPOINT = '/api/client-logs'
const LOG_THROTTLE_MS = 5000

let lastLogAt = 0

function safeText(value, maxLength = 500) {
  if (!value) return ''
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/accessToken["']?\s*[:=]\s*["'][^"']+["']/gi, 'accessToken:"[REDACTED]"')
    .replace(/refreshToken["']?\s*[:=]\s*["'][^"']+["']/gi, 'refreshToken:"[REDACTED]"')
    .slice(0, maxLength)
}

function sendClientLog(payload) {
  const now = Date.now()
  if (now - lastLogAt < LOG_THROTTLE_MS) return
  lastLogAt = now

  const body = JSON.stringify({
    level: payload.level || 'error',
    event: safeText(payload.event || 'client_event', 120),
    message: safeText(payload.message),
    source: safeText(payload.source, 120),
    path: safeText(window.location.pathname, 180),
    statusCode: payload.statusCode,
    componentStack: safeText(payload.componentStack, 500),
  })

  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(LOG_ENDPOINT, new globalThis.Blob([body], { type: 'application/json' }))
    if (sent) return
  }

  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'include',
    keepalive: true,
  }).catch(() => {})
}

export function logClientError(event, error, extra = {}) {
  sendClientLog({
    level: 'error',
    event,
    message: error?.userMessage || error?.message || String(error || ''),
    source: extra.source,
    statusCode: extra.statusCode || error?.response?.status,
    componentStack: extra.componentStack,
  })
}

export function logClientWarning(event, message, extra = {}) {
  sendClientLog({
    level: 'warn',
    event,
    message,
    source: extra.source,
    statusCode: extra.statusCode,
  })
}
