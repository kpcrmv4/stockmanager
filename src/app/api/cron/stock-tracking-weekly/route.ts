/**
 * GET /api/cron/stock-tracking-weekly
 *
 * Monday 09:00 — send a weekly tracking summary to each store's chat:
 * - active tracked count (by priority)
 * - newly auto-flagged this week
 * - resolved this week
 * - top 5 by total_abs_diff
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendBotMessage } from '@/lib/chat/bot';

interface ItemRow {
  id: string;
  store_id: string;
  product_code: string;
  product_name: string | null;
  priority: string;
  is_tracking: boolean;
  resolved_at: string | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekISO = oneWeekAgo.toISOString();

  const { data: stores } = await supabase
    .from('stores')
    .select('id, store_name')
    .eq('active', true);
  if (!stores || stores.length === 0) {
    return NextResponse.json({ status: 'no_stores' });
  }

  const results: Array<{ store: string; sent: boolean }> = [];

  for (const store of stores) {
    const { data: items } = await supabase
      .from('stock_tracking_items')
      .select('id, store_id, product_code, product_name, priority, is_tracking, resolved_at')
      .eq('store_id', store.id);
    const all = (items || []) as ItemRow[];
    const active = all.filter((i) => i.is_tracking);
    if (active.length === 0 && all.length === 0) {
      results.push({ store: store.store_name, sent: false });
      continue;
    }

    const urgent = active.filter((i) => i.priority === 'urgent').length;
    const high = active.filter((i) => i.priority === 'high').length;

    // Newly auto-flagged this week (history events of action='auto_flagged')
    const { data: autoFlaggedHist } = await supabase
      .from('stock_tracking_history')
      .select('tracking_item_id, created_at, item:stock_tracking_items(store_id, product_name)')
      .eq('action', 'auto_flagged')
      .gte('created_at', weekISO);
    const autoCount = (autoFlaggedHist || []).filter((h) => {
      const it = h.item as { store_id?: string } | null;
      return it?.store_id === store.id;
    }).length;

    // Resolved this week (resolved_at within last 7 days)
    const resolvedThisWeek = all.filter((i) => i.resolved_at && i.resolved_at >= weekISO).length;

    // Top 5 by recent total_abs_diff (use the trend RPC for this store)
    const { data: trends } = await supabase
      .rpc('get_tracking_trend', { p_store_id: store.id, p_days: 7 });
    type TrendRow = { product_code: string; product_name: string | null; total_abs_diff: number };
    const top5 = (trends as TrendRow[] | null) || [];
    const top5Active = top5
      .filter((t) => active.find((i) => i.product_code === t.product_code))
      .slice(0, 5);

    if (active.length === 0 && autoCount === 0 && resolvedThisWeek === 0) {
      results.push({ store: store.store_name, sent: false });
      continue;
    }

    const lines = [
      `📌 สรุปประจำสัปดาห์ — ระบบติดตามผลต่าง`,
      `กำลังติดตาม: ${active.length}` +
        (urgent + high > 0 ? ` (ด่วนมาก ${urgent} · สูง ${high})` : ''),
      autoCount > 0 ? `🤖 Auto-flag ใหม่สัปดาห์นี้: ${autoCount}` : '',
      resolvedThisWeek > 0 ? `✅ ปิดเคสสัปดาห์นี้: ${resolvedThisWeek}` : '',
      top5Active.length > 0
        ? `\nTop 5 ผลต่างมากสุด (7 วันล่าสุด):\n${top5Active
            .map((t, i) => `${i + 1}. ${t.product_name || t.product_code} — รวม ${Number(t.total_abs_diff).toFixed(1)}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await sendBotMessage({
        storeId: store.id,
        type: 'system',
        content: lines,
      });
      results.push({ store: store.store_name, sent: true });
    } catch (err) {
      console.error('[StockTrackingWeekly] error for', store.store_name, err);
      results.push({ store: store.store_name, sent: false });
    }
  }

  return NextResponse.json({ success: true, results });
}
