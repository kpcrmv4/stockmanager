/**
 * Service Worker Push Event Handler for StockManager PWA
 *
 * This file handles push notification events independently.
 * It can be imported by the main service worker via importScripts('./sw-push.js')
 * or registered as a standalone service worker.
 */

// ─── Push Event ─────────────────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // If JSON parsing fails, treat the data as plain text
    payload = {
      title: 'StockManager',
      body: event.data ? event.data.text() : '',
    };
  }

  const title = payload.title || 'StockManager';

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/badge-72x72.png',
    image: payload.image || undefined,
    vibrate: [100, 50, 100],
    tag: payload.tag || payload.type || 'stockmanager-notification',
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: {
      url: payload.url || payload.data?.url || '/',
      type: payload.type || 'general',
      id: payload.id || null,
      timestamp: Date.now(),
    },
    actions: payload.actions || [],
  };

  // Remove undefined values to avoid issues
  if (!options.image) {
    delete options.image;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var notificationData = event.notification.data || {};
  var targetUrl = notificationData.url || '/';

  // Handle action button clicks
  if (event.action) {
    // Actions can define custom URLs via the notification payload
    // e.g. actions: [{ action: 'view', title: 'ดูรายละเอียด', url: '/items/123' }]
    var actions = event.notification.data?.actions || [];
    var matchedAction = actions.find(function (a) {
      return a.action === event.action;
    });
    if (matchedAction && matchedAction.url) {
      targetUrl = matchedAction.url;
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // Try to focus an existing window that matches the target URL
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          // Check if the client URL includes the target path
          if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }

        // If no matching window, try to focus any existing window and navigate
        for (var j = 0; j < clientList.length; j++) {
          var existingClient = clientList[j];
          if ('focus' in existingClient && 'navigate' in existingClient) {
            return existingClient.focus().then(function (focusedClient) {
              return focusedClient.navigate(targetUrl);
            });
          }
        }

        // No existing window found — open a new one
        return self.clients.openWindow(targetUrl);
      })
  );
});

// ─── Notification Close ─────────────────────────────────────────────────────────
self.addEventListener('notificationclose', function (event) {
  var notificationData = event.notification.data || {};

  // Optional: track dismissals for analytics
  // You can send a beacon or fetch to your analytics endpoint
  if (notificationData.id) {
    // Fire-and-forget tracking — do not block the event
    try {
      fetch('/api/notifications/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_id: notificationData.id,
          action: 'dismissed',
          timestamp: Date.now(),
        }),
      }).catch(function () {
        // Silently ignore tracking failures
      });
    } catch (e) {
      // Silently ignore
    }
  }
});
