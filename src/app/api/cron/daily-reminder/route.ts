import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/messaging';
import { dailyReminderTemplate } from '@/lib/line/flex-templates';
import { dayOfWeekBangkok } from '@/lib/utils/date';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all active stores with settings
  const { data: stores } = await supabase
    .from('stores')
    .select('*, settings:store_settings(*)')
    .eq('active', true);

  if (!stores) {
    return NextResponse.json({ status: 'no stores' });
  }

  const dayOfWeek = dayOfWeekBangkok();
  const results: Array<{ store: string; sent: boolean; error?: string }> = [];

  for (const store of stores) {
    const settings = Array.isArray(store.settings) ? store.settings[0] : store.settings;
    if (!settings) continue;

    // Check if daily reminder is enabled for this store
    if (settings.daily_reminder_enabled === false) {
      results.push({ store: store.store_name, sent: false, error: 'Daily reminder disabled' });
      continue;
    }

    // Check if today should notify
    const notifyDays = settings.notify_days || [];
    if (!notifyDays.includes(dayOfWeek)) {
      results.push({ store: store.store_name, sent: false, error: 'Not a notify day' });
      continue;
    }

    // Check if LINE notifications are enabled for this store
    if (settings.line_notify_enabled === false) {
      results.push({ store: store.store_name, sent: false, error: 'LINE notify disabled' });
      continue;
    }

    // Get LINE stock notify group ID for notification
    const groupId = store.stock_notify_group_id;
    if (!groupId) {
      results.push({ store: store.store_name, sent: false, error: 'No stock notify group ID' });
      continue;
    }

    // ใช้ token ของสาขาถ้ามี, ถ้าไม่มีจะ fall back เป็น central token อัตโนมัติ
    const storeToken = store.line_token || undefined;

    try {
      const flex = dailyReminderTemplate(store.store_name);
      await pushMessage(groupId, [{ type: 'flex', altText: 'เตือนนับสต๊อก', contents: flex }], { token: storeToken });
      await supabase.from('audit_logs').insert({
        store_id: store.id,
        action_type: 'CRON_DAILY_REMINDER_SENT',
        table_name: 'stores',
        record_id: store.id,
        new_value: { store_name: store.store_name, sent: true },
        changed_by: null,
      });
      results.push({ store: store.store_name, sent: true });

      // Also create in-app notifications for all staff in this store
      const { data: storeStaff } = await supabase
        .from('user_stores')
        .select('user_id')
        .eq('store_id', store.id);

      if (storeStaff) {
        const staffNotifs = storeStaff.map(s => ({
          user_id: s.user_id,
          store_id: store.id,
          title: 'เตือนนับสต๊อก',
          body: `ถึงเวลานับสต๊อกประจำวัน - ${store.store_name}`,
          type: 'stock_alert',
          read: false,
          data: { url: '/stock/daily-check' },
        }));
        await supabase.from('notifications').insert(staffNotifs);
      }
    } catch (error) {
      results.push({
        store: store.store_name,
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({ status: 'ok', results });
}
