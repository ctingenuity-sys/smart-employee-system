// Service Worker Background Push & Notification Handler for Smart Employee System
// Supports Background Push Notifications, Lockscreen Alerts, Delayed Test Notifications, and Notification Click Actions

const DEFAULT_ICON = '/app-icon-3d.png';
const DEFAULT_BADGE = '/app-icon-3d.png';

// 1. Listen for Background Web Push Events (FCM / Web Push API)
self.addEventListener('push', function(event) {
  console.log('[SW] Push notification received:', event);

  let payload = {
    title: 'نظام الموظفين الذكي',
    body: 'لديك إشعار أو رسالة جديدة في النظام',
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag: 'app-notification-' + Date.now(),
    url: '/',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = Object.assign(payload, json);
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    image: payload.image,
    vibrate: payload.vibrate || [200, 100, 200, 100, 200],
    tag: payload.tag || 'general-notification',
    renotify: true,
    requireInteraction: !!payload.requireInteraction,
    silent: false,
    data: {
      url: payload.url || '/',
      dateOfArrival: Date.now(),
      primaryKey: payload.tag || '1',
      openChat: payload.openChat || false,
      groupId: payload.groupId || null,
      senderId: payload.senderId || null,
      customData: payload.data || {}
    },
    actions: payload.actions || [
      { action: 'open', title: 'عرض الآن 👁️' },
      { action: 'dismiss', title: 'إغلاق ✕' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// 2. Handle Tapping/Clicking on Notifications (Lockscreen / Notification Bar)
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked action:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || '/';

  // If notification was for chat, append hash parameter
  if (notifData.openChat) {
    targetUrl = targetUrl.includes('#') ? targetUrl : (targetUrl + '#chat');
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it and tell it which chat/tab to open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: notifData,
            targetUrl: targetUrl
          });
          return client.focus();
        }
      }

      // If no window is open (app is closed), open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 3. Listen for Messages from Foreground Client (Direct Show, Test, or Delayed Notification)
self.addEventListener('message', function(event) {
  if (!event.data) return;

  // Immediate Show Notification
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const title = event.data.title || 'نظام الموظفين الذكي';
    const opts = Object.assign({
      icon: DEFAULT_ICON,
      badge: DEFAULT_BADGE,
      vibrate: [200, 100, 200, 100, 200],
      renotify: true,
      silent: false
    }, event.data.options || {});

    self.registration.showNotification(title, opts);
  }

  // Delayed Test Notification (Allows testing when employee locks the phone screen!)
  if (event.data.type === 'SCHEDULE_DELAYED_NOTIFICATION') {
    const delay = event.data.delay || 5000;
    const title = event.data.title || '🔔 تجربة وصول الإشعار والشاشة مقفلة!';
    const opts = Object.assign({
      icon: DEFAULT_ICON,
      badge: DEFAULT_BADGE,
      body: 'تم استلام الإشعار بنجاح حتى عندما يكون التطبيق مقفلاً في الخلفية! 🎉',
      vibrate: [300, 150, 300, 150, 400],
      tag: 'test-delayed-' + Date.now(),
      renotify: true,
      silent: false,
      actions: [
        { action: 'open', title: 'فتح التطبيق 📱' },
        { action: 'dismiss', title: 'تم التجربة بنجاح 👍' }
      ]
    }, event.data.options || {});

    setTimeout(function() {
      self.registration.showNotification(title, opts);
    }, delay);
  }
});

// 4. Background Sync Events (where supported by browser)
self.addEventListener('sync', function(event) {
  console.log('[SW] Background sync triggered:', event.tag);
});

self.addEventListener('periodicsync', function(event) {
  console.log('[SW] Periodic background sync triggered:', event.tag);
});
