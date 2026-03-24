const CACHE_NAME = 'stockmanager-v1';
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
  const data = event.data?.json() || {};
  const title = data.title || 'StockManager';
  const isChatMessage = data.data?.type === 'chat_message';

  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-72.png',
    image: data.image || undefined,  // รูปใหญ่แสดงใน notification (Android)
    data: data.data || {},
    tag: data.tag || (data.data?.room_id ? `chat:${data.data.room_id}` : 'default'),
    renotify: true,
    vibrate: [200, 100, 200],
    // Actions — ปุ่มกดตอบกลับ (Android/Desktop)
    actions: isChatMessage
      ? [{ action: 'open', title: 'เปิดแชท' }]
      : [],
    // Timestamp — ให้ OS แสดงเวลาข้อความ
    timestamp: Date.now(),
    // Silent = false → เสียง + สั่น ตามปกติ (เด้ง banner บนมือถือ)
    silent: false,
  };

  // Skip notification if user has the chat room open already
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const targetUrl = data.data?.url || '';
      const isVisible = clients.some(
        (client) => client.visibilityState === 'visible' && targetUrl && client.url.includes(targetUrl)
      );
      if (isVisible) return; // User is already looking at this chat
      return self.registration.showNotification(title, options);
    })
  );
});

// Notification click handler (รวม action button "เปิดแชท")
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  // ทั้งกดที่ notification หรือกดปุ่ม "เปิดแชท" → เปิดหน้าเดียวกัน
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
