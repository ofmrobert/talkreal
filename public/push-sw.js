/* Notification handling for the installed app. Loaded by the generated service worker. */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Talkreal', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One notification of each kind at a time: a new message does not hide the practice reminder.
      tag: data.tag || 'talkreal-reminder',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          // Take the open app to what the notification is about.
          if ('navigate' in client && url !== '/') client.navigate(url).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
