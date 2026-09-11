/**
 * Mobile Push & System Notification Service
 * Handles Service Worker notifications, mobile lockscreen alerts,
 * background notifications when app is closed, vibration patterns, and permissions.
 */

import { db } from '../firebase';
// @ts-ignore
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface NotificationPreferences {
  enabled: boolean;
  chatMessages: boolean;
  groupMessages: boolean;
  urgentAlerts: boolean;
  shiftSwaps: boolean;
  vibration: boolean;
  sound: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  chatMessages: true,
  groupMessages: true,
  urgentAlerts: true,
  shiftSwaps: true,
  vibration: true,
  sound: true,
};

const PREFS_STORAGE_KEY = 'smart_employee_notification_preferences';
const DEFAULT_ICON = '/app-icon-3d.png';
const DEFAULT_BADGE = '/app-icon-3d.png';

// Sound Chimes
export const playNotificationChime = (type: 'normal' | 'alert' | 'chat' = 'normal') => {
  try {
    const prefs = getNotificationPreferences();
    if (!prefs.sound) return;

    let src = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
    if (type === 'alert') {
      src = 'https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3';
    } else if (type === 'chat') {
      src = 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3';
    }

    const audio = new Audio(src);
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  } catch (e) {
    // Audio autoplay restrictions ignored
  }
};

// Check if browser/mobile supports notifications
export const isNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
};

// Check if device is iOS
export const isIOSDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
};

// Check if app is running in Standalone PWA mode
export const isStandalonePWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
};

// Current permission state
export const getNotificationPermission = (): NotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
};

// Read saved preferences
export const getNotificationPreferences = (): NotificationPreferences => {
  try {
    const saved = localStorage.getItem(PREFS_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
    }
  } catch (e) {}
  return DEFAULT_PREFERENCES;
};

// Save preferences
export const saveNotificationPreferences = (prefs: Partial<NotificationPreferences>): NotificationPreferences => {
  const current = getNotificationPreferences();
  const updated = { ...current, ...prefs };
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
};

// Request permission with mobile guidance
export const requestMobileNotificationPermission = async (): Promise<{
  granted: boolean;
  permission: NotificationPermission;
  error?: string;
}> => {
  if (!isNotificationSupported()) {
    return {
      granted: false,
      permission: 'denied',
      error: isIOSDevice() && !isStandalonePWA()
        ? 'على أجهزة آيفون، يلزم إضافة التطبيق إلى الشاشة الرئيسية (Add to Home Screen) أولاً لتفعيل إشعارات الجوال.'
        : 'المتصفح لا يدعم إشعارات النظام.'
    };
  }

  try {
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';

    if (granted) {
      saveNotificationPreferences({ enabled: true });

      // Ensure service worker is registered and ready
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          console.log('[NotificationService] Service Worker ready for notifications:', reg.scope);
        } catch (swErr) {
          console.warn('[NotificationService] SW ready check warning:', swErr);
        }
      }
    }

    return { granted, permission };
  } catch (err: any) {
    console.error('[NotificationService] Error requesting notification permission:', err);
    return { granted: false, permission: getNotificationPermission(), error: err?.message };
  }
};

export interface MobileNotificationOptions {
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  url?: string;
  type?: 'normal' | 'alert' | 'chat';
  requireInteraction?: boolean;
  openChat?: boolean;
  groupId?: string | null;
  senderId?: string | null;
  actions?: Array<{ action: string; title: string }>;
  vibrate?: number[];
  silent?: boolean;
}

// Core function to send notification to phone (works in background & lockscreen)
export const sendMobileNotification = async (
  title: string,
  options: MobileNotificationOptions
): Promise<boolean> => {
  const prefs = getNotificationPreferences();

  // Filter based on preference category
  if (!prefs.enabled) return false;
  if (options.type === 'chat' && !prefs.chatMessages) return false;
  if (options.type === 'alert' && !prefs.urgentAlerts) return false;

  // Sound chime
  if (!options.silent && prefs.sound) {
    playNotificationChime(options.type || 'normal');
  }

  // Vibration on mobile
  if (prefs.vibration && typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      const pattern = options.vibrate || (options.type === 'alert' ? [300, 100, 300, 100, 400] : [200, 100, 200, 100, 200]);
      navigator.vibrate(pattern);
    } catch (e) {}
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const tag = options.tag || 'smart-emp-' + Date.now();
  const notificationOptions: any = {
    body: options.body,
    icon: options.icon || DEFAULT_ICON,
    badge: options.badge || DEFAULT_BADGE,
    image: options.image,
    vibrate: prefs.vibration ? (options.vibrate || [200, 100, 200, 100, 200]) : undefined,
    tag: tag,
    renotify: true,
    requireInteraction: options.type === 'alert' || !!options.requireInteraction,
    silent: !!options.silent,
    data: {
      url: options.url || '/',
      dateOfArrival: Date.now(),
      openChat: !!options.openChat,
      groupId: options.groupId || null,
      senderId: options.senderId || null,
      type: options.type || 'normal'
    },
    actions: options.actions || [
      { action: 'open', title: options.openChat ? 'فتح المحادثة 💬' : 'عرض التفاصيل 👁️' },
      { action: 'dismiss', title: 'إغلاق ✕' }
    ]
  };

  let shown = false;

  // Method A: Primary & Mobile Mandatory — Service Worker Registration
  // (Calling `new Notification()` on Android throws TypeError: Illegal constructor)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, notificationOptions);
        shown = true;
      }
    } catch (swErr) {
      console.warn('[NotificationService] ServiceWorker showNotification failed, trying fallback:', swErr);
    }
  }

  // Method B: Send message to SW controller if active
  if (!shown && navigator.serviceWorker?.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        options: notificationOptions
      });
      shown = true;
    } catch (msgErr) {
      console.warn('[NotificationService] postMessage to SW failed:', msgErr);
    }
  }

  // Method C: Desktop fallback using new Notification()
  if (!shown) {
    try {
      new Notification(title, notificationOptions);
      shown = true;
    } catch (notifErr) {
      // Caught if on Android or restricted environment
      console.warn('[NotificationService] Direct Notification constructor unsupported:', notifErr);
    }
  }

  return shown;
};

// Schedule delayed notification for phone lockscreen testing
// Allows user to press button, lock their screen, and test notification delivery
export const scheduleDelayedNotification = async (
  delaySeconds: number = 5,
  title: string = '🔔 تجربة وصول الإشعار والشاشة مقفلة!',
  body: string = 'تم استلام الإشعار بنجاح حتى عندما يكون التطبيق مقفلاً في الخلفية! 🎉'
): Promise<boolean> => {
  if (Notification.permission !== 'granted') {
    const res = await requestMobileNotificationPermission();
    if (!res.granted) return false;
  }

  const delayMs = Math.max(1000, delaySeconds * 1000);

  // Send message to Service Worker so timer runs in worker thread
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({
          type: 'SCHEDULE_DELAYED_NOTIFICATION',
          delay: delayMs,
          title,
          options: {
            body,
            icon: DEFAULT_ICON,
            badge: DEFAULT_BADGE,
            vibrate: [300, 150, 300, 150, 400],
            tag: 'test-delayed-' + Date.now(),
            requireInteraction: true
          }
        });
        return true;
      }
    } catch (e) {}
  }

  // Fallback setTimeout in client
  setTimeout(() => {
    sendMobileNotification(title, {
      body,
      type: 'normal',
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 400]
    });
  }, delayMs);

  return true;
};

// Register & Save Push Subscription to Firestore (For server-to-device push)
export const syncUserPushSubscription = async (userId: string, departmentId?: string) => {
  if (!userId || !isNotificationSupported()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('pushManager' in reg)) return;

    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const subJson = sub.toJSON();
      await setDoc(doc(db, 'user_push_subscriptions', userId), {
        userId,
        departmentId: departmentId || null,
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log('[NotificationService] Push subscription synced to Firestore');
    }
  } catch (err) {
    console.warn('[NotificationService] Could not sync push subscription:', err);
  }
};
