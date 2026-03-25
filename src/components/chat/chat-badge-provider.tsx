'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useChatBadge } from '@/hooks/use-chat-realtime';

/**
 * Global chat badge provider — ใส่ใน dashboard layout
 * 1. โหลด unread counts จาก DB ตอน mount
 * 2. Subscribe realtime badge channel ตลอดเวลา (ไม่ใช่แค่หน้า /chat)
 */
export function ChatBadgeProvider() {
  const { user } = useAuthStore();
  const { setUnreadCounts } = useChatStore();

  // Subscribe to realtime badge channel globally
  useChatBadge();

  // Fetch initial unread counts from DB
  useEffect(() => {
    if (!user) return;

    const supabase = createClient();
    supabase
      .rpc('get_chat_unread_counts', { p_user_id: user.id })
      .then(({ data }) => {
        if (data) {
          const counts: Record<string, number> = {};
          for (const row of data) {
            counts[row.room_id] = Number(row.unread_count);
          }
          setUnreadCounts(counts);
        }
      });
  }, [user, setUnreadCounts]);

  return null;
}
