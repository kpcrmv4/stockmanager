'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePushSubscription } from '@/hooks/use-push-subscription';

/**
 * Tooltip ที่ render ผ่าน Portal เพื่อไม่ให้ถูก parent stacking context บัง
 */
function NotificationTooltip({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        anchor &&
        !anchor.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-150"
      style={{ top: pos.top, right: pos.right }}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * แสดงสถานะ push notification ใน header ของห้องแชท
 * ออกแบบให้ใช้กับ header สีเข้ม (text-white) + grouped button style
 */
export function ChatNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe } =
    usePushSubscription();
  const [showTooltip, setShowTooltip] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const handleClose = useCallback(() => setShowTooltip(false), []);

  if (!isSupported) return null;

  // Already subscribed
  if (isSubscribed) {
    return (
      <>
        <button
          ref={btnRef}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-300 transition-all hover:bg-white/10 sm:h-9 sm:w-9"
          title="เปิดแจ้งเตือนแล้ว"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellRing className="h-4 w-4" />
        </button>
        {showTooltip && (
          <NotificationTooltip anchorRef={btnRef} onClose={handleClose}>
            <div className="w-52 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <div className="mb-1 flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-semibold text-gray-800 dark:text-gray-200">เปิดแจ้งเตือนแล้ว</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400">จะได้รับแจ้งเตือนแม้ปิดหน้าจอ</p>
            </div>
          </NotificationTooltip>
        )}
      </>
    );
  }

  // Permission denied
  if (permission === 'denied') {
    return (
      <>
        <button
          ref={btnRef}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-red-300 transition-all hover:bg-white/10 sm:h-9 sm:w-9"
          title="แจ้งเตือนถูกบล็อก"
          onClick={() => setShowTooltip((v) => !v)}
        >
          <BellOff className="h-4 w-4" />
        </button>
        {showTooltip && (
          <NotificationTooltip anchorRef={btnRef} onClose={handleClose}>
            <div className="w-60 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <p className="font-semibold text-red-600 dark:text-red-400">
                แจ้งเตือนถูกบล็อก
              </p>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                กรุณาเปิดการแจ้งเตือนในตั้งค่าเบราว์เซอร์ แล้วโหลดหน้าใหม่
              </p>
            </div>
          </NotificationTooltip>
        )}
      </>
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
