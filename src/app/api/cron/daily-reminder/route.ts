import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/messaging';
import { dailyReminderTemplate } from '@/lib/line/flex-templates';

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

  const now = new Date();
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const results: Array<{ store: string; sent: boolean; error?: string }> = [];

  for (const store of stores) {
    const settings = Array.isArray(store.settings) ? store.settings[0] : store.settings;
    if (!settings) continue;

    // Check if today should notify
    const notifyDays = settings.notify_days || [];
    if (!notifyDays.includes(dayOfWeek)) {
      results.push({ store: store.store_name, sent: false, error: 'Not a notify day' });
      continue;
    }

    // Get LINE group ID for staff notification
    const groupId = store.line_group_id;
    if (!groupId) {
      results.push({ store: store.store_name, sent: false, error: 'No LINE group ID' });
      continue;
    }

    try {
      const flex = dailyReminderTemplate(store.store_name);
      await pushMessage(groupId, [{ type: 'flex', altText: 'เตือนนับสต๊อก', contents: flex }]);
      results.push({ store: store.store_name, sent: true });
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
