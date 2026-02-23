'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePushSubscriptionReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

/**
 * Convert a URL-safe base64 string to a Uint8Array.
 * Used to convert the VAPID public key for the PushManager.subscribe() call.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Get a human-readable device name for the push subscription record.
 */
function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS Device';
  if (/Android/.test(ua)) return 'Android Device';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux PC';
  return 'Unknown Device';
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Check browser support and existing subscription on mount
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setIsSupported(supported);

    if (!supported) return;

    setPermission(Notification.permission);

    async function checkExistingSubscription() {
      try {
        const registration = await navigator.serviceWorker.ready;
        registrationRef.current = registration;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch {
        // Service worker not ready or push not available
        setIsSubscribed(false);
      }
    }

    checkExistingSubscription();

    // Re-check permission when the page regains focus (user may have changed it in browser settings)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        setPermission(Notification.permission);
        checkExistingSubscription();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported || isLoading) return;

    setIsLoading(true);

    try {
      // 1. Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        throw new Error(
          result === 'denied'
            ? 'NOTIFICATION_DENIED'
            : 'NOTIFICATION_DISMISSED',
        );
      }

      // 2. Get the service worker registration
      const registration = registrationRef.current ?? (await navigator.serviceWorker.ready);
      registrationRef.current = registration;

      // 3. Fetch the VAPID public key from the server
      const vapidResponse = await fetch('/api/notifications/vapid-key');
      if (!vapidResponse.ok) {
        throw new Error('Failed to fetch VAPID public key');
      }
      const { publicKey } = await vapidResponse.json();

      // 4. Convert the VAPID key and subscribe via PushManager
      const applicationServerKey = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // 5. Send the subscription to the server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          device_name: getDeviceName(),
        }),
      });

      if (!response.ok) {
        // If server-side storage fails, unsubscribe from push to stay in sync
        await subscription.unsubscribe();
        throw new Error('Failed to save subscription on server');
      }

      setIsSubscribed(true);
    } catch (error) {
      console.error('[usePushSubscription] subscribe error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return;

    setIsLoading(true);

    try {
      const registration = registrationRef.current ?? (await navigator.serviceWorker.ready);
      registrationRef.current = registration;

      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // 1. Unsubscribe from push on the browser side
        await subscription.unsubscribe();

        // 2. Tell the server to remove the subscription
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error('[usePushSubscription] unsubscribe error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  };
}
