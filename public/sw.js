const CACHE_NAME = 'stockmanager-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Install — cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API and auth routes
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push Notification handler
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    // Fallback if JSON parse fails
    data = { title: 'StockManager', body: event.data?.text() || 'มีข้อความใหม่' };
  }

  const title = data.title || 'StockManager';
  const isChatMessage = data.data?.type === 'chat_message';

  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    image: data.image || undefined,
    data: data.data || {},
    tag: data.tag || (data.data?.room_id ? `chat:${data.data.room_id}` : 'default'),
    renotify: true,
    vibrate: [200, 100, 200],
    actions: isChatMessage
      ? [{ action: 'open', title: 'เปิดแชท' }]
      : [],
    timestamp: Date.now(),
    silent: false,
    requireInteraction: false,
  };

  // Show notification — only skip if user is actively viewing THIS specific chat room
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const targetUrl = data.data?.url || '';
        // Only suppress if user is on the EXACT chat room page AND window is visible
        const isViewingThisRoom = targetUrl && clients.some(
          (client) => client.visibilityState === 'visible' && client.url.endsWith(targetUrl)
        );
        if (isViewingThisRoom) return;
        return self.registration.showNotification(title, options);
      })
      .catch(() => {
        // Fallback — always show notification if matchAll fails
        return self.registration.showNotification(title, options);
      })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Try to focus any existing window and navigate
      for (const client of clients) {
        if ('focus' in client && 'navigate' in client) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      // Open new window
      return self.clients.openWindow(targetUrl);
    })
  );
});
