'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePushSubscription } from '@/hooks/use-push-subscription';

const DISMISSED_KEY = 'push-prompt-dismissed';

interface PushPromptProps {
  className?: string;
}

export function PushPrompt({ className }: PushPromptProps) {
  const { isSupported, isSubscribed, isLoading, permission, subscribe } =
    usePushSubscription();
  const [dismissed, setDismissed] = useState(true); // default to hidden to avoid flash

  // Check localStorage on mount
  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
    setDismissed(wasDismissed);
  }, []);

  // Don't show the prompt if:
  // - Push is not supported
  // - Already subscribed
  // - Permission was denied (user can't grant it again)
  // - User dismissed it before
  if (!isSupported || isSubscribed || permission === 'denied' || dismissed) {
    return null;
  }

  const handleSubscribe = async () => {
    try {
      await subscribe();
    } catch {
      // subscribe() already logs the error
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20',
        className
      )}
    >
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-800/40 dark:text-blue-400">
        <Bell className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          เปิดการแจ้งเตือน
        </p>
        <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
          รับแจ้งเตือนทันทีเมื่อมีรายการใหม่
        </p>

        {/* Actions */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-gray-900',
              isLoading && 'cursor-not-allowed opacity-60'
            )}
          >
            {isLoading ? 'กำลังเปิด...' : 'เปิด'}
          </button>
          <button
            onClick={handleDismiss}
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-800/30 dark:hover:text-blue-300"
          >
            ภายหลัง
          </button>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-0.5 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600 dark:text-blue-500 dark:hover:bg-blue-800/30 dark:hover:text-blue-300"
        aria-label="ปิด"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
