'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePushSubscription } from '@/hooks/use-push-subscription';

/**
 * แสดงสถานะ push notification ใน header ของห้องแชท
 * ออกแบบให้ใช้กับ header สีเข้ม (text-white) + grouped button style
 */
export function ChatNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe } =
    usePushSubscription();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTooltip]);

  if (!isSupported) return null;

  // Already subscribed
  if (isSubscribed) {
    return (
      <div className="relative" ref={tooltipRef}>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-300 transition-all hover:bg-white/10 sm:h-9 sm:w-9"
          title="เปิดแจ้งเตือนแล้ว"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellRing className="h-4 w-4" />
        </button>
        {showTooltip && (
          <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <div className="mb-1 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="font-semibold text-gray-800 dark:text-gray-200">เปิดแจ้งเตือนแล้ว</span>
            </div>
            <p className="text-gray-500 dark:text-gray-400">จะได้รับแจ้งเตือนแม้ปิดหน้าจอ</p>
          </div>
        )}
      </div>
    );
  }

  // Permission denied
  if (permission === 'denied') {
    return (
      <div className="relative" ref={tooltipRef}>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-300 transition-all hover:bg-white/10 sm:h-9 sm:w-9"
          title="แจ้งเตือนถูกบล็อก"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellOff className="h-4 w-4" />
        </button>
        {showTooltip && (
          <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-800">
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
        'flex h-8 w-8 items-center justify-center rounded-lg text-amber-300 transition-all hover:bg-white/10 sm:h-9 sm:w-9',
        isLoading && 'animate-pulse opacity-60',
      )}
      title="เปิดการแจ้งเตือน"
    >
      <Bell className="h-4 w-4" />
    </button>
  );
}
