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
  const TIMEOUT_MS = 5000;

  // ถ้ามี channel ที่ subscribe อยู่แล้ว (เช่น จาก useChatRealtime) → ใช้ send ตรงเลย
  const existing = supabase.getChannels().find(
    (ch) => ch.topic === `realtime:${channelName}` && ch.state === 'joined',
  );

  if (existing) {
    await existing.send({ type: 'broadcast', event, payload });
    return;
  }

  // ไม่มี channel อยู่ → สร้างใหม่ subscribe แล้ว send
  const channel = supabase.channel(channelName);

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
