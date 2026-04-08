'use client';

import { useTranslations } from 'next-intl';

import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationStore } from '@/stores/notification-store';
import { resolveNotificationUrl } from '@/lib/notifications/resolve-url';
import { cn } from '@/lib/utils/cn';
import { formatThaiDate } from '@/lib/utils/format';
import {
  Bell,
  Check,
  CheckCheck,
  Loader2,
  Inbox,
  CheckCircle,
  Package,
  AlertTriangle,
  BarChart3,
  Shield,
  MessageSquare,
  ArrowUpFromLine,
  Megaphone,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import type { Notification } from '@/types/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNotificationIcon(
  type: string | null,
  data?: Record<string, unknown> | null,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const router = useRouter();
  const t = useTranslations('notificationsPage');
  const { markRead, markAllRead } = useNotifications();
  const { notifications, unreadCount } = useNotificationStore();

  const loading = notifications.length === 0 && unreadCount === 0;

  function handleClick(notif: Notification) {
    if (!notif.read) {
      markRead(notif.id);
    }
    const url = resolveNotificationUrl(notif.type, notif.data);
    router.push(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('unreadCount', { count: unreadCount })}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCheck className="h-4 w-4" />}
            onClick={markAllRead}
          >
            {t('markAllRead')}
          </Button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t('empty')}
          description={t('emptyDesc')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {notifications.map((notif) => {
              const { icon: Icon, color, bg } = getNotificationIcon(
                notif.type,
                notif.data,
              );

              return (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleClick(notif)}
                  className={cn(
                    'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors',
                    'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    !notif.read && 'bg-blue-50/50 dark:bg-blue-900/10',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      bg,
                    )}
                  >
                    <Icon className={cn('h-4 w-4', color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm',
                        notif.read
                          ? 'text-gray-600 dark:text-gray-400'
                          : 'font-medium text-gray-900 dark:text-white',
                      )}
                    >
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {notif.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {formatThaiDate(notif.created_at)}
                    </p>
                  </div>
                  {!notif.read && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(notif.id);
                      }}
                      className="mt-1.5 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title={t('markRead')}
                    >
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
