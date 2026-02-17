'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useRealtime } from './use-realtime';
import type { Notification } from '@/types/database';

export function useNotifications() {
  const { user } = useAuthStore();
  const { notifications, unreadCount, setNotifications, addNotification, markAsRead, markAllAsRead } = useNotificationStore();

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    async function loadNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setNotifications(data || []);
    }

    loadNotifications();
  }, [user, setNotifications]);

  const handleNewNotification = useCallback(
    (notification: Notification) => {
      if (notification.user_id === user?.id) {
        addNotification(notification);
      }
    },
    [user, addNotification]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useRealtime<Notification & Record<string, unknown>>({
    table: 'notifications',
    filter: user ? `user_id=eq.${user.id}` : undefined,
    onInsert: handleNewNotification,
    enabled: !!user,
  });

  const markRead = async (id: string) => {
    const supabase = createClient();
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    markAsRead(id);
  };

  const markAllRead = async () => {
    if (!user) return;
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    markAllAsRead();
  };

  return { notifications, unreadCount, markRead, markAllRead };
}
