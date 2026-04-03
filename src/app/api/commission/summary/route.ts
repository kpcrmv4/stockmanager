import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/commission/summary?month=2026-04&store_id=xxx
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = req.nextUrl.searchParams.get('store_id');
  const month = req.nextUrl.searchParams.get('month'); // YYYY-MM

  if (!month) {
    return NextResponse.json({ error: 'month parameter required (YYYY-MM)' }, { status: 400 });
  }

  const start = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const end = new Date(y, m, 0).toISOString().split('T')[0];

  // Fetch all entries for the month
  let query = supabase
    .from('commission_entries')
    .select('*, ae_profile:ae_profiles(id, name, nickname, bank_name, bank_account_no, bank_account_name), staff_profile:profiles!commission_entries_staff_id_fkey(id, display_name, username), store:stores!commission_entries_store_id_fkey(id, store_name, store_code)')
    .gte('bill_date', start)
    .lte('bill_date', end)
    .order('bill_date', { ascending: true });

  if (storeId) query = query.eq('store_id', storeId);

  const { data: entries, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate AE Commission by ae_id
  const aeMap = new Map<string, {
    ae_id: string;
    ae_name: string;
    ae_nickname: string | null;
    bank_name: string | null;
    bank_account_no: string | null;
    bank_account_name: string | null;
    entry_count: number;
    total_subtotal: number;
    total_commission: number;
    total_tax: number;
    total_net: number;
    entries: typeof entries;
  }>();

  // Aggregate Bottle Commission by staff_id
  const bottleMap = new Map<string, {
    staff_id: string;
    staff_name: string;
    entry_count: number;
    total_bottles: number;
    total_net: number;
    entries: typeof entries;
  }>();

  for (const entry of entries || []) {
    if (entry.type === 'ae_commission' && entry.ae_id) {
      const key = entry.ae_id;
      const existing = aeMap.get(key);
      if (existing) {
        existing.entry_count++;
        existing.total_subtotal += Number(entry.subtotal_amount) || 0;
        existing.total_commission += Number(entry.commission_amount) || 0;
        existing.total_tax += Number(entry.tax_amount) || 0;
        existing.total_net += Number(entry.net_amount) || 0;
        existing.entries.push(entry);
      } else {
        const ae = entry.ae_profile as Record<string, unknown> | null;
        aeMap.set(key, {
          ae_id: key,
          ae_name: (ae?.name as string) || 'Unknown',
          ae_nickname: (ae?.nickname as string) || null,
          bank_name: (ae?.bank_name as string) || null,
          bank_account_no: (ae?.bank_account_no as string) || null,
          bank_account_name: (ae?.bank_account_name as string) || null,
          entry_count: 1,
          total_subtotal: Number(entry.subtotal_amount) || 0,
          total_commission: Number(entry.commission_amount) || 0,
          total_tax: Number(entry.tax_amount) || 0,
          total_net: Number(entry.net_amount) || 0,
          entries: [entry],
        });
      }
    } else if (entry.type === 'bottle_commission') {
      const key = entry.staff_id || 'no_staff';
      const existing = bottleMap.get(key);
      if (existing) {
        existing.entry_count++;
        existing.total_bottles += Number(entry.bottle_count) || 0;
        existing.total_net += Number(entry.net_amount) || 0;
        existing.entries.push(entry);
      } else {
        const staff = entry.staff_profile as Record<string, unknown> | null;
        bottleMap.set(key, {
          staff_id: key,
          staff_name: (staff?.display_name as string) || (staff?.username as string) || 'ไม่ระบุ',
          entry_count: 1,
          total_bottles: Number(entry.bottle_count) || 0,
          total_net: Number(entry.net_amount) || 0,
          entries: [entry],
        });
      }
    }
  }

  const aeSummary = Array.from(aeMap.values()).sort((a, b) => b.total_net - a.total_net);
  const bottleSummary = Array.from(bottleMap.values()).sort((a, b) => b.total_net - a.total_net);

  const grandTotal = {
    ae_total_net: aeSummary.reduce((s, a) => s + a.total_net, 0),
    ae_total_entries: aeSummary.reduce((s, a) => s + a.entry_count, 0),
    bottle_total_net: bottleSummary.reduce((s, a) => s + a.total_net, 0),
    bottle_total_entries: bottleSummary.reduce((s, a) => s + a.entry_count, 0),
    total_payout: aeSummary.reduce((s, a) => s + a.total_net, 0) + bottleSummary.reduce((s, a) => s + a.total_net, 0),
  };

  return NextResponse.json({
    month,
    store_id: storeId,
    ae_summary: aeSummary,
    bottle_summary: bottleSummary,
    grand_total: grandTotal,
  });
}
