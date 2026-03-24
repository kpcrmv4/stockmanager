'use client';

import { useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePushSubscription } from '@/hooks/use-push-subscription';

/**
 * แสดงสถานะ push notification ใน header ของห้องแชท
 * - ถ้ายังไม่ได้ subscribe → ปุ่มกดเปิด
 * - ถ้า subscribe แล้ว → แสดงไอคอนเขียว
 * - ถ้า permission denied → แสดงข้อความแนะนำ
 */
export function ChatNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe } =
    usePushSubscription();
  const [showTooltip, setShowTooltip] = useState(false);

  if (!isSupported) return null;

  // Already subscribed — green bell icon
  if (isSubscribed) {
    return (
      <div className="relative">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald-500 dark:text-emerald-400"
          title="เปิดแจ้งเตือนแล้ว"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellRing className="h-5 w-5" />
        </button>
        {showTooltip && (
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            การแจ้งเตือนเปิดอยู่ — จะได้รับแจ้งเตือนแม้ปิดหน้าจอ
          </div>
        )}
      </div>
    );
  }

  // Permission denied — show warning icon
  if (permission === 'denied') {
    return (
      <div className="relative">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-red-400 dark:text-red-500"
          title="แจ้งเตือนถูกบล็อก"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellOff className="h-5 w-5" />
        </button>
        {showTooltip && (
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
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

  // Not yet subscribed — prompt to enable
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
        'flex h-9 items-center gap-1 rounded-lg px-2 text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20',
        isLoading && 'animate-pulse opacity-60',
      )}
      title="เปิดการแจ้งเตือน"
    >
      <Bell className="h-4.5 w-4.5" />
      <span className="text-xs font-medium">เปิดแจ้งเตือน</span>
    </button>
  );
}
