import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/messaging';
import { hoursAgoISO } from '@/lib/utils/date';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find pending comparisons that need follow-up (more than 4 hours old)
  const fourHoursAgoISO = hoursAgoISO(4);

  const { data: pendingComparisons } = await supabase
    .from('comparisons')
    .select('*, store:stores(store_name, line_token, stock_notify_group_id, settings:store_settings(line_notify_enabled, follow_up_enabled))')
    .eq('status', 'pending')
    .lt('created_at', fourHoursAgoISO);

  const results: Array<{ comp_id: string; sent: boolean }> = [];

  if (pendingComparisons) {
    // Group by store for batch notification
    const byStore = new Map<string, typeof pendingComparisons>();
    for (const comp of pendingComparisons) {
      const storeId = comp.store_id;
      if (!byStore.has(storeId)) byStore.set(storeId, []);
      byStore.get(storeId)!.push(comp);
    }

    for (const [, comps] of byStore) {
      const store = comps[0]?.store as { store_name: string; line_token: string | null; stock_notify_group_id: string | null; settings: { line_notify_enabled: boolean; follow_up_enabled: boolean } | { line_notify_enabled: boolean; follow_up_enabled: boolean }[] | null } | null;
      if (!store?.stock_notify_group_id) continue;

      // Check settings
      const storeSettings = Array.isArray(store.settings) ? store.settings[0] : store.settings;
      if (storeSettings?.line_notify_enabled === false) continue;
      if (storeSettings?.follow_up_enabled === false) continue;

      // ใช้ token ของสาขาถ้ามี, ถ้าไม่มีจะ fall back เป็น central token
      const token = store.line_token || undefined;

      try {
        const message = {
          type: 'text' as const,
          text: `📋 ติดตามผล: มีรายการผลต่างสต๊อก ${comps.length} รายการ ที่ยังไม่มีคำอธิบาย\n\nกรุณาเข้าระบบเพื่ออธิบายผลต่าง`,
        };
        await pushMessage(store.stock_notify_group_id, [message], { token });

        await supabase.from('audit_logs').insert({
          store_id: comps[0].store_id,
          action_type: 'CRON_FOLLOW_UP_SENT',
          table_name: 'comparisons',
          new_value: { store_name: store.store_name, type: 'comparison', count: comps.length },
          changed_by: null,
        });

        for (const comp of comps) {
          results.push({ comp_id: comp.id, sent: true });
        }
      } catch {
        for (const comp of comps) {
          results.push({ comp_id: comp.id, sent: false });
        }
      }
    }
  }

  // Check pending withdrawal requests older than 2 hours
  const twoHoursAgoISO = hoursAgoISO(2);

  const { data: pendingWithdrawals } = await supabase
    .from('withdrawals')
    .select('*, store:stores(store_name, line_token, deposit_notify_group_id, settings:store_settings(line_notify_enabled, follow_up_enabled))')
    .eq('status', 'pending')
    .lt('created_at', twoHoursAgoISO);

  let withdrawalNotified = 0;
  if (pendingWithdrawals) {
    const byStore = new Map<string, typeof pendingWithdrawals>();
    for (const w of pendingWithdrawals) {
      const storeId = w.store_id;
      if (!byStore.has(storeId)) byStore.set(storeId, []);
      byStore.get(storeId)!.push(w);
    }

    for (const [, withdrawals] of byStore) {
      const store = withdrawals[0]?.store as { store_name: string; line_token: string | null; deposit_notify_group_id: string | null; settings: { line_notify_enabled: boolean; follow_up_enabled: boolean } | { line_notify_enabled: boolean; follow_up_enabled: boolean }[] | null } | null;
      if (!store?.deposit_notify_group_id) continue;

      // Check settings
      const wStoreSettings = Array.isArray(store.settings) ? store.settings[0] : store.settings;
      if (wStoreSettings?.line_notify_enabled === false) continue;
      if (wStoreSettings?.follow_up_enabled === false) continue;

      // ใช้ token ของสาขาถ้ามี, ถ้าไม่มีจะ fall back เป็น central token
      const token = store.line_token || undefined;

      try {
        const message = {
          type: 'text' as const,
          text: `🍷 ติดตามผล: มีคำขอเบิกเหล้า ${withdrawals.length} รายการ ที่รอดำเนินการ\n\nกรุณาเข้าระบบเพื่อดำเนินการ`,
        };
        await pushMessage(store.deposit_notify_group_id, [message], { token });

        await supabase.from('audit_logs').insert({
          store_id: withdrawals[0].store_id,
          action_type: 'CRON_FOLLOW_UP_SENT',
          table_name: 'withdrawals',
          new_value: { store_name: store.store_name, type: 'withdrawal', count: withdrawals.length },
          changed_by: null,
        });

        withdrawalNotified += withdrawals.length;
      } catch {
        // Ignore send errors
      }
    }
  }

  return NextResponse.json({
    status: 'ok',
    comparison_follow_ups: results.length,
    withdrawal_follow_ups: withdrawalNotified,
  });
}
