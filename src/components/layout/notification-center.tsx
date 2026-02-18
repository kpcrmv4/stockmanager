'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  BellOff,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatThaiDate } from '@/lib/utils/format';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationStore } from '@/stores/notification-store';
import type { Notification } from '@/types/database';

interface NotificationCenterProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'เมื่อสักครู่';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
  return formatThaiDate(dateStr);
}

function getNotificationIcon(
  type: string | null,
  data?: Record<string, unknown> | null
): { icon: LucideIcon; color: string; bg: string } {
  switch (type) {
    case 'deposit_confirmed':
      return { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationCenter({ className }: NotificationCenterProps) {
  const router = useRouter();
  const { markRead, markAllRead } = useNotifications();
  const { notifications, unreadCount } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
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

    // Navigate based on notification type / data
    const data = notification.data;
    switch (notification.type) {
      case 'deposit_confirmed':
      case 'new_deposit':
      case 'deposit_expiry':
        if (data?.deposit_id) {
          router.push(`/deposits/${data.deposit_id}`);
        } else {
          router.push('/deposits');
        }
        break;
      case 'withdrawal_completed':
      case 'withdrawal_request':
        if (data?.withdrawal_id) {
          router.push(`/withdrawals/${data.withdrawal_id}`);
        } else {
          router.push('/withdrawals');
        }
        break;
      case 'approval_request':
      case 'approval_result':
      case 'explanation_submitted':
        router.push('/approvals');
        break;
      case 'stock_alert':
        router.push('/stock');
        break;
      case 'promotion':
        router.push('/notifications');
        break;
      default:
        router.push('/notifications');
    }

    setOpen(false);
  }

  function handleMarkAllRead() {
    markAllRead();
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Bell trigger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-lg',
          'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
          'transition-colors duration-150'
        )}
        aria-label="การแจ้งเตือน"
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

      {/* Dropdown panel */}
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
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              การแจ้งเตือน
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                <BellOff className="mb-2 h-10 w-10" />
                <p className="text-sm">ไม่มีการแจ้งเตือน</p>
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
                      !notification.read && 'bg-blue-50/50 dark:bg-blue-900/10'
                    )}
                    role="menuitem"
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        bg
                      )}
                    >
                      <Icon className={cn('h-4 w-4', color)} />
                    </div>

                    {/* Content */}
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

                    {/* Unread indicator */}
                    {!notification.read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
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
                ดูทั้งหมด
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
