/**
 * GET /api/cron/chat-daily-summary
 *
 * Cron job: ส่งสรุปประจำวันเข้าห้องแชทสาขา
 * รวม: ฝากเหล้า, เบิกเหล้า, สต๊อก, ยืมสินค้า
 *
 * Schedule: ทุกวัน 06:00 (Bangkok time)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendBotMessage } from '@/lib/chat/bot';
import { getChatBotSettings } from '@/lib/chat/bot-settings';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all active stores
  const { data: stores } = await supabase
    .from('stores')
    .select('id, store_name')
    .eq('active', true);

  if (!stores || stores.length === 0) {
    return NextResponse.json({ status: 'no stores' });
  }

  const results: Array<{ store: string; sent: boolean }> = [];

  // "Bar day" window: 11:00 yesterday → 05:59 today (Bangkok time)
  // ร้านเหล้าเปิดข้ามวัน จึงนับวันทำงานตั้งแต่ 11:00 - 05:59
  const now = new Date();
  const bangkokOffset = 7 * 60 * 60 * 1000;
  const bangkokNow = new Date(now.getTime() + bangkokOffset);

  // Bar day start: yesterday 11:00 Bangkok
  const barStart = new Date(bangkokNow);
  barStart.setDate(barStart.getDate() - 1);
  barStart.setHours(11, 0, 0, 0);

  // Bar day end: today 05:59:59 Bangkok
  const barEnd = new Date(bangkokNow);
  barEnd.setHours(5, 59, 59, 999);

  // Convert to UTC for DB queries
  const startUTC = new Date(barStart.getTime() - bangkokOffset).toISOString();
  const endUTC = new Date(barEnd.getTime() - bangkokOffset).toISOString();

  const yesterday = new Date(bangkokNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateLabel = yesterday.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  for (const store of stores) {
    try {
      // Check if daily summary is enabled for this store
      const botSettings = await getChatBotSettings(store.id);
      if (!botSettings.chat_bot_daily_summary_enabled) {
        results.push({ store: store.store_name, sent: false });
        continue;
      }

      // Fetch all stats in parallel
      const [depositsResult, withdrawalsResult, comparisonsResult, borrowsResult] =
        await Promise.all([
          // Deposits created yesterday
          supabase
            .from('deposits')
            .select('id, status', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .gte('created_at', startUTC)
            .lte('created_at', endUTC),

          // Withdrawals completed yesterday
          supabase
            .from('withdrawals')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .eq('status', 'completed')
            .gte('created_at', startUTC)
            .lte('created_at', endUTC),

          // Stock comparisons pending explanation
          supabase
            .from('comparisons')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .eq('status', 'pending'),

          // Active borrow requests (pending or approved)
          supabase
            .from('borrows')
            .select('id', { count: 'exact', head: true })
            .or(`from_store_id.eq.${store.id},to_store_id.eq.${store.id}`)
            .in('status', ['pending_approval', 'approved']),
        ]);

      const newDeposits = depositsResult.count ?? 0;
      const completedWithdrawals = withdrawalsResult.count ?? 0;
      const pendingExplanations = comparisonsResult.count ?? 0;
      const activeBorrows = borrowsResult.count ?? 0;

      // Also get currently active deposits
      const { count: activeDepositsCount } = await supabase
        .from('deposits')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('status', 'in_store');

      const activeDeposits = activeDepositsCount ?? 0;

      // Get expiring soon (within 3 days)
      const in3Days = new Date(bangkokNow);
      in3Days.setDate(in3Days.getDate() + 3);
      const in3DaysUTC = new Date(in3Days.getTime() - bangkokOffset).toISOString();
      const nowUTC = new Date(bangkokNow.getTime() - bangkokOffset).toISOString();

      const { count: expiringSoonCount } = await supabase
        .from('deposits')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('status', 'in_store')
        .gt('expiry_date', nowUTC)
        .lte('expiry_date', in3DaysUTC);

      const expiringSoon = expiringSoonCount ?? 0;

      // Skip if nothing to report
      if (
        newDeposits === 0 &&
        completedWithdrawals === 0 &&
        pendingExplanations === 0 &&
        activeBorrows === 0 &&
        activeDeposits === 0
      ) {
        results.push({ store: store.store_name, sent: false });
        continue;
      }

      // Build summary card with structured metadata
      const summaryData = {
        type: 'daily_summary' as const,
        date_label: dateLabel,
        new_deposits: newDeposits,
        withdrawals_today: completedWithdrawals,
        active_deposits: activeDeposits,
        expiring_soon: expiringSoon,
        expiring_days: 3,
        pending_explanations: pendingExplanations,
        active_borrows: activeBorrows,
      };

      await sendBotMessage({
        storeId: store.id,
        type: 'system',
        content: `📊 สรุปประจำวัน — ${dateLabel}`,
        metadata: summaryData,
      });

      results.push({ store: store.store_name, sent: true });
    } catch (err) {
      console.error(`[Daily Summary] Error for store ${store.store_name}:`, err);
      results.push({ store: store.store_name, sent: false });
    }
  }

  return NextResponse.json({ success: true, results });
}
