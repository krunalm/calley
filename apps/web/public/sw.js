// Calley Service Worker — Push Notifications
// This runs in a separate thread from the main app.

// ─── Push Event ─────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Calley', body: event.data.text() };
  }

  const { title, body, icon, url } = payload;

  const options = {
    body: body || '',
    icon: icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'calley-notification',
    renotify: true,
    data: { url: url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title || 'Calley', options));
});

// ─── Notification Click ─────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open a new tab
      return self.clients.openWindow(url);
    }),
  );
});
