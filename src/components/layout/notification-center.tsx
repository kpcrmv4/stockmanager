'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bell,
  CheckCircle,
  Package,
  AlertTriangle,
  BarChart3,
  Shield,
  MessageSquare,
  ArrowUpFromLine,
  Megaphone,
  Wine,
  BellOff,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatThaiDate } from '@/lib/utils/format';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationStore } from '@/stores/notification-store';
import { resolveNotificationUrl } from '@/lib/notifications/resolve-url';
import type { Notification } from '@/types/database';

interface NotificationCenterProps {
  className?: string;
}

function getNotificationIcon(
  type: string | null,
  data?: Record<string, unknown> | null
): { icon: LucideIcon; color: string; bg: string } {
  switch (type) {
    case 'deposit_confirmed':
      return { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
    case 'deposit_received':
      return { icon: Wine, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' };
    case 'withdrawal_completed':
      return { icon: Package, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' };
    case 'deposit_expiry':
      return { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' };
    case 'stock_alert':
      return { icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' };
    case 'approval_request':
      return { icon: Shield, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' };
    case 'explanation_submitted':
      return { icon: MessageSquare, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30' };
    case 'approval_result': {
      const approved = data?.approved === true;
      return approved
        ? { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' }
        : { icon: Shield, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' };
    }
    case 'new_deposit':
      return { icon: Package, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' };
    case 'withdrawal_request':
      return { icon: ArrowUpFromLine, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' };
    case 'promotion':
      return { icon: Megaphone, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-100 dark:bg-pink-900/30' };
    default:
      return { icon: Bell, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' };
  }
}

function getNotificationRowBg(type: string | null): string {
  switch (type) {
    case 'new_deposit':
    case 'deposit_confirmed':
      return 'bg-purple-50/60 dark:bg-purple-900/10';
    case 'deposit_received':
      return 'bg-amber-50/60 dark:bg-amber-900/10';
    case 'withdrawal_request':
    case 'withdrawal_completed':
      return 'bg-blue-50/60 dark:bg-blue-900/10';
    case 'stock_alert':
    case 'explanation_submitted':
      return 'bg-indigo-50/60 dark:bg-indigo-900/10';
    case 'approval_request':
    case 'approval_result':
      return 'bg-emerald-50/60 dark:bg-emerald-900/10';
    case 'deposit_expiry':
      return 'bg-orange-50/60 dark:bg-orange-900/10';
    case 'promotion':
      return 'bg-pink-50/60 dark:bg-pink-900/10';
    default:
      return '';
  }
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const router = useRouter();
  const t = useTranslations();
  const { markRead, markAllRead } = useNotifications();
  const { notifications, unreadCount } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function getTimeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHour = Math.floor(diffMs / 3_600_000);
    const diffDay = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1) return t('notifications.justNow');
    if (diffMin < 60) return t('notifications.minutesAgo', { count: diffMin });
    if (diffHour < 24) return t('notifications.hoursAgo', { count: diffHour });
    if (diffDay < 7) return t('notifications.daysAgo', { count: diffDay });
    return formatThaiDate(dateStr);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open]);

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      markRead(notification.id);
    }
    const data = notification.data;
    const url = resolveNotificationUrl(notification.type, data);
    router.push(url);
    setOpen(false);
  }

  function handleMarkAllRead() {
    markAllRead();
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-lg',
          'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
          'transition-colors duration-150'
        )}
        aria-label={t('notifications.title')}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
              'bg-red-500 text-[10px] font-bold text-white'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 z-50',
            'w-80 sm:w-96',
            'overflow-hidden rounded-xl border shadow-xl',
            'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900',
            'animate-in fade-in zoom-in-95 duration-150'
          )}
          role="menu"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('notifications.title')}
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                <BellOff className="mb-2 h-10 w-10" />
                <p className="text-sm">{t('notifications.empty')}</p>
              </div>
            ) : (
              notifications.slice(0, 20).map((notification) => {
                const { icon: Icon, color, bg } = getNotificationIcon(
                  notification.type,
                  notification.data
                );

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      'hover:bg-gray-50 dark:hover:bg-gray-800',
                      !notification.read
                        ? getNotificationRowBg(notification.type) || 'bg-blue-50/50 dark:bg-blue-900/10'
                        : ''
                    )}
                    role="menuitem"
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        bg
                      )}
                    >
                      <Icon className={cn('h-4 w-4', color)} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {notification.body}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {getTimeAgo(notification.created_at)}
                      </p>
                    </div>

                    {!notification.read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  router.push('/notifications');
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-center py-3 text-sm font-medium',
                  'text-blue-600 hover:bg-gray-50 dark:text-blue-400 dark:hover:bg-gray-800',
                  'transition-colors'
                )}
              >
                {t('notifications.viewAll')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
