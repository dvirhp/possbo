import api from './http'

function decodeKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function getPushSubscription() {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('PUSH_UNSUPPORTED')
  const permission = await window.Notification.requestPermission()
  if (permission !== 'granted') throw new Error('PUSH_PERMISSION_DENIED')
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const publicKey = (await api.get('/push/public-key')).data.publicKey
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) })
  await api.post('/push/subscribe', subscription.toJSON())
  return subscription
}

export async function disablePush() {
  const subscription = await getPushSubscription()
  if (!subscription) return
  await api.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } })
  await subscription.unsubscribe()
}

export const sendTestPush = () => api.post('/push/test')
