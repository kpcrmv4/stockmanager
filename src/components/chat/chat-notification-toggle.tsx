'use client';

import { useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePushSubscription } from '@/hooks/use-push-subscription';

/**
 * แสดงสถานะ push notification ใน header ของห้องแชท
 * ออกแบบให้ใช้กับ header สีเข้ม (text-white)
 */
export function ChatNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe } =
    usePushSubscription();
  const [showTooltip, setShowTooltip] = useState(false);

  if (!isSupported) return null;

  // Already subscribed
  if (isSubscribed) {
    return (
      <div className="relative">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-300 hover:bg-white/10"
          title="เปิดแจ้งเตือนแล้ว"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellRing className="h-4.5 w-4.5" />
        </button>
        {showTooltip && (
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-gray-200 bg-white p-2.5 text-xs text-gray-600 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            การแจ้งเตือนเปิดอยู่ — จะได้รับแจ้งเตือนแม้ปิดหน้าจอ
          </div>
        )}
      </div>
    );
  }

  // Permission denied
  if (permission === 'denied') {
    return (
      <div className="relative">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-red-300 hover:bg-white/10"
          title="แจ้งเตือนถูกบล็อก"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellOff className="h-4.5 w-4.5" />
        </button>
        {showTooltip && (
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-800">
            <p className="font-semibold text-red-600 dark:text-red-400">
              แจ้งเตือนถูกบล็อก
            </p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              กรุณาเปิดการแจ้งเตือนในตั้งค่าเบราว์เซอร์ แล้วโหลดหน้าใหม่
            </p>
          </div>
        )}
      </div>
    );
  }

  // Not yet subscribed
  const handleSubscribe = async () => {
    try {
      await subscribe();
    } catch {
      // subscribe() already logs the error
    }
  };

  return (
    <button
      onClick={handleSubscribe}
      disabled={isLoading}
      className={cn(
        'flex h-9 items-center gap-1 rounded-full px-2 text-amber-300 transition-colors hover:bg-white/10',
        isLoading && 'animate-pulse opacity-60',
      )}
      title="เปิดการแจ้งเตือน"
    >
      <Bell className="h-4.5 w-4.5" />
    </button>
  );
}
