import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Broadcast helper — subscribe ก่อนแล้วค่อย send เพื่อไม่ให้ Supabase fallback ไป REST
 * หลัง send เสร็จจะ cleanup channel ทิ้ง
 */
export async function broadcastToChannel(
  supabase: SupabaseClient,
  channelName: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const channel = supabase.channel(channelName);

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel
          .send({ type: 'broadcast', event, payload })
          .then(() => resolve())
          .catch(reject);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Channel ${channelName} failed: ${status}`));
      }
    });
  });

  supabase.removeChannel(channel);
}

/**
 * Broadcast ไปหลาย channels พร้อมกัน (เช่น badge ไปหลาย users)
 */
export async function broadcastToMany(
  supabase: SupabaseClient,
  sends: Array<{ channel: string; event: string; payload: Record<string, unknown> }>,
): Promise<void> {
  await Promise.allSettled(
    sends.map((s) => broadcastToChannel(supabase, s.channel, s.event, s.payload)),
  );
}
