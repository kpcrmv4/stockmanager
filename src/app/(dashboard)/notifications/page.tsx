'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils/cn';
import { formatThaiDate } from '@/lib/utils/format';
import { Bell, Check, CheckCheck, Loader2, Inbox } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('notifications')
        .select('id, title, message, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setNotifications(data ?? []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    const supabase = createClient();
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

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
            การแจ้งเตือน
          </h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              ยังไม่ได้อ่าน {unreadCount} รายการ
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCheck className="h-4 w-4" />}
            onClick={markAllAsRead}
          >
            อ่านทั้งหมด
          </Button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="ไม่มีการแจ้งเตือน"
          description="การแจ้งเตือนของคุณจะปรากฏที่นี่"
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={cn(
                  'flex items-start gap-3 px-5 py-4 transition-colors',
                  !notif.read && 'bg-blue-50/50 dark:bg-blue-900/10'
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    notif.read
                      ? 'bg-gray-100 dark:bg-gray-700'
                      : 'bg-blue-100 dark:bg-blue-900/30'
                  )}
                >
                  <Bell
                    className={cn(
                      'h-4 w-4',
                      notif.read
                        ? 'text-gray-400'
                        : 'text-blue-600 dark:text-blue-400'
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm',
                      notif.read
                        ? 'text-gray-600 dark:text-gray-400'
                        : 'font-medium text-gray-900 dark:text-white'
                    )}
                  >
                    {notif.title}
                  </p>
                  {notif.message && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {notif.message}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {formatThaiDate(notif.created_at)}
                  </p>
                </div>
                {!notif.read && (
                  <button
                    type="button"
                    onClick={() => markAsRead(notif.id)}
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    title="อ่านแล้ว"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
