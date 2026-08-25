const CACHE = 'possbo-shell-v1'
const SHELL = ['/offline.html', '/manifest.json', '/brand/possbo-favicon-dark-v5.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin || new URL(request.url).pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
    return
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && ['style', 'script', 'image', 'font'].includes(request.destination)) {
      const copy = response.clone()
      caches.open(CACHE).then(cache => cache.put(request, copy))
    }
    return response
  })))
})

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch { data = { body: event.data?.text() || '' } }
  event.waitUntil(self.registration.showNotification(data.title || 'Possbo', {
    body: data.body || '',
    icon: '/brand/possbo-favicon-dark-v5.png',
    badge: '/brand/possbo-favicon-dark-v5.png',
    data: { url: data.url || '/dashboard' },
    tag: data.tag || 'possbo-notification',
    renotify: Boolean(data.urgent),
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url.startsWith(self.location.origin))
    if (existing) { existing.navigate(target); return existing.focus() }
    return clients.openWindow(target)
  }))
})
