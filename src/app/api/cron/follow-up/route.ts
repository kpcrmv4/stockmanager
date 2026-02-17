import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { pushMessage } from '@/lib/line/messaging';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find pending comparisons that need follow-up (more than 4 hours old)
  const fourHoursAgo = new Date();
  fourHoursAgo.setHours(fourHoursAgo.getHours() - 4);

  const { data: pendingComparisons } = await supabase
    .from('comparisons')
    .select('*, store:stores(store_name, line_token, staff_group_id)')
    .eq('status', 'pending')
    .lt('created_at', fourHoursAgo.toISOString());

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
      const store = comps[0]?.store as { store_name: string; line_token: string; staff_group_id: string } | null;
      if (!store?.staff_group_id || !store?.line_token) continue;

      try {
        const message = {
          type: 'text' as const,
          text: `📋 ติดตามผล: มีรายการผลต่างสต๊อก ${comps.length} รายการ ที่ยังไม่มีคำอธิบาย\n\nกรุณาเข้าระบบเพื่ออธิบายผลต่าง`,
        };
        await pushMessage(store.staff_group_id, [message], { token: store.line_token });

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
  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

  const { data: pendingWithdrawals } = await supabase
    .from('withdrawals')
    .select('*, store:stores(store_name, line_token, staff_group_id)')
    .eq('status', 'pending')
    .lt('created_at', twoHoursAgo.toISOString());

  let withdrawalNotified = 0;
  if (pendingWithdrawals) {
    const byStore = new Map<string, typeof pendingWithdrawals>();
    for (const w of pendingWithdrawals) {
      const storeId = w.store_id;
      if (!byStore.has(storeId)) byStore.set(storeId, []);
      byStore.get(storeId)!.push(w);
    }

    for (const [, withdrawals] of byStore) {
      const store = withdrawals[0]?.store as { store_name: string; line_token: string; staff_group_id: string } | null;
      if (!store?.staff_group_id || !store?.line_token) continue;

      try {
        const message = {
          type: 'text' as const,
          text: `🍷 ติดตามผล: มีคำขอเบิกเหล้า ${withdrawals.length} รายการ ที่รอดำเนินการ\n\nกรุณาเข้าระบบเพื่อดำเนินการ`,
        };
        await pushMessage(store.staff_group_id, [message], { token: store.line_token });
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
