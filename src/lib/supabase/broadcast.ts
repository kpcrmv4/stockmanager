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
  // ใช้ชื่อ channel ที่ไม่ซ้ำกับ subscription ที่มีอยู่แล้ว
  // เพื่อป้องกัน Supabase ไม่ emit 'SUBSCRIBED' ซ้ำ
  const uniqueName = `${channelName}:send:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
  const channel = supabase.channel(uniqueName);

  const TIMEOUT_MS = 5000;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Channel ${channelName} broadcast timed out`));
    }, TIMEOUT_MS);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel
          .send({ type: 'broadcast', event, payload })
          .then(() => {
            clearTimeout(timer);
            resolve();
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
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
