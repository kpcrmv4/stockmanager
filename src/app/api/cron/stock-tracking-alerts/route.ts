/**
 * GET /api/cron/stock-tracking-alerts
 *
 * Daily 08:00 — for each tracked product that's still over-tolerance in the
 * last 7 days, notify owner/accountant/manager so they don't lose track.
 * Sends in-app + chat (system text) + LINE personal push if configured.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyBorrowWatchers } from '@/lib/notifications/service';
import { sendBotMessage } from '@/lib/chat/bot';

interface TrackingItemRow {
  id: string;
  store_id: string;
  product_code: string;
  product_name: string | null;
  priority: string;
  reason: string | null;
}

interface RecentDiffRow {
  store_id: string;
  product_code: string;
  recent_pending: number;
  total_recent_abs: number;
  last_diff: number;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. All active tracking items
  const { data: items } = await supabase
    .from('stock_tracking_items')
    .select('id, store_id, product_code, product_name, priority, reason')
    .eq('is_tracking', true);
  if (!items || items.length === 0) {
    return NextResponse.json({ status: 'no_items', count: 0 });
  }

  // 2. Build recent (7 days) over-tolerance signals per (store, product_code)
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceISO = since.toISOString().slice(0, 10);

  const { data: recent } = await supabase
    .from('comparisons')
    .select('store_id, product_code, status, difference, comp_date')
    .gte('comp_date', sinceISO)
    .not('manual_quantity', 'is', null);

  const recentMap = new Map<string, RecentDiffRow>();
  for (const row of recent || []) {
    const key = `${row.store_id}::${row.product_code}`;
    const existing = recentMap.get(key) || {
      store_id: row.store_id as string,
      product_code: row.product_code as string,
      recent_pending: 0,
      total_recent_abs: 0,
      last_diff: 0,
    };
    if (row.status === 'pending') existing.recent_pending++;
    existing.total_recent_abs += Math.abs(Number(row.difference));
    existing.last_diff = Number(row.difference);
    recentMap.set(key, existing);
  }

  // 3. Group items by store, only if they have recent activity
  const byStore = new Map<string, Array<{ item: TrackingItemRow; recent: RecentDiffRow }>>();
  for (const item of items as TrackingItemRow[]) {
    const key = `${item.store_id}::${item.product_code}`;
    const r = recentMap.get(key);
    if (!r || r.recent_pending === 0) continue;
    const arr = byStore.get(item.store_id) || [];
    arr.push({ item, recent: r });
    byStore.set(item.store_id, arr);
  }

  if (byStore.size === 0) {
    return NextResponse.json({ status: 'no_alerts', tracked: items.length });
  }

  // 4. Notify per store
  const results: Array<{ store_id: string; alert_count: number }> = [];
  for (const [storeId, list] of byStore) {
    const top = list
      .sort((a, b) => b.recent.total_recent_abs - a.recent.total_recent_abs)
      .slice(0, 5);
    const preview = top
      .map((x) => `${x.item.product_name || x.item.product_code} (ผลต่าง ${x.recent.last_diff > 0 ? '+' : ''}${x.recent.last_diff})`)
      .join(', ');

    try {
      await notifyBorrowWatchers({
        storeId,
        type: 'stock_alert',
        title: `📌 ${list.length} รายการที่ติดตามยังเกินเกณฑ์`,
        body: `${preview}${list.length > 5 ? ` +${list.length - 5} อื่นๆ` : ''}`,
        data: { url: '/stock/tracking' },
      });
    } catch (err) {
      console.error('[StockTrackingAlerts] notify error:', err);
    }

    try {
      await sendBotMessage({
        storeId,
        type: 'system',
        content: `📌 ติดตามผลต่าง: ${list.length} รายการยังเกินเกณฑ์ใน 7 วันล่าสุด — ${preview}${list.length > 5 ? ` +${list.length - 5} อื่นๆ` : ''}`,
      });
    } catch (err) {
      console.error('[StockTrackingAlerts] chat error:', err);
    }

    results.push({ store_id: storeId, alert_count: list.length });
  }

  return NextResponse.json({ success: true, results });
}
