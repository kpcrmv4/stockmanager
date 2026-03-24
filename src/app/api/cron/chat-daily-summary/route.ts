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

  // Yesterday's date range (Bangkok timezone = UTC+7)
  const now = new Date();
  const bangkokOffset = 7 * 60 * 60 * 1000;
  const bangkokNow = new Date(now.getTime() + bangkokOffset);
  const yesterday = new Date(bangkokNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = new Date(yesterday);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // Convert back to UTC for DB queries
  const startUTC = new Date(yesterdayStart.getTime() - bangkokOffset).toISOString();
  const endUTC = new Date(yesterdayEnd.getTime() - bangkokOffset).toISOString();

  const dateLabel = yesterday.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  for (const store of stores) {
    try {
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

      // Get expiring soon (within 7 days)
      const in7Days = new Date(bangkokNow);
      in7Days.setDate(in7Days.getDate() + 7);
      const in7DaysUTC = new Date(in7Days.getTime() - bangkokOffset).toISOString();
      const nowUTC = new Date(bangkokNow.getTime() - bangkokOffset).toISOString();

      const { count: expiringSoonCount } = await supabase
        .from('deposits')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('status', 'in_store')
        .gt('expiry_date', nowUTC)
        .lte('expiry_date', in7DaysUTC);

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

      // Build summary message
      const lines: string[] = [
        `📊 สรุปประจำวัน — ${dateLabel}`,
        '',
      ];

      // Deposits section
      lines.push(`🍷 ฝากเหล้า`);
      lines.push(`  ในร้าน: ${activeDeposits} รายการ`);
      if (newDeposits > 0) lines.push(`  ใหม่เมื่อวาน: +${newDeposits}`);
      if (expiringSoon > 0) lines.push(`  ⚠️ ใกล้หมดอายุ (7 วัน): ${expiringSoon}`);

      // Withdrawals
      if (completedWithdrawals > 0) {
        lines.push(`  เบิกเมื่อวาน: ${completedWithdrawals}`);
      }

      // Stock
      if (pendingExplanations > 0) {
        lines.push('');
        lines.push(`📦 สต๊อก`);
        lines.push(`  ⚠️ รอชี้แจง: ${pendingExplanations} รายการ`);
      }

      // Borrows
      if (activeBorrows > 0) {
        lines.push('');
        lines.push(`🔄 ยืมสินค้า`);
        lines.push(`  รายการที่ยังดำเนินการ: ${activeBorrows}`);
      }

      await sendBotMessage({
        storeId: store.id,
        type: 'system',
        content: lines.join('\n'),
      });

      results.push({ store: store.store_name, sent: true });
    } catch (err) {
      console.error(`[Daily Summary] Error for store ${store.store_name}:`, err);
      results.push({ store: store.store_name, sent: false });
    }
  }

  return NextResponse.json({ success: true, results });
}
