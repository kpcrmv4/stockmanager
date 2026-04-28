import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/commission/payment — list payments
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = req.nextUrl.searchParams.get('store_id');
  const month = req.nextUrl.searchParams.get('month');
  const year = req.nextUrl.searchParams.get('year');
  const status = req.nextUrl.searchParams.get('status');

  let query = supabase
    .from('commission_payments')
    .select('*, ae_profile:ae_profiles(id, name, nickname), staff_profile:profiles!commission_payments_staff_id_fkey(id, display_name, username), paid_by_profile:profiles!commission_payments_paid_by_fkey(id, display_name, username)')
    .order('paid_at', { ascending: false });

  if (storeId) query = query.eq('store_id', storeId);
  if (month) query = query.eq('month', month);
  if (year) query = query.like('month', `${year}-%`);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// POST /api/commission/payment — create payment (mark entries as paid).
// Body accepts an explicit `entry_ids` array (partial-pay flow from
// the UI checklist) and falls back to "all unpaid for this AE/staff
// + month" when entry_ids isn't provided.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { store_id, ae_id, staff_id, type, month, slip_photo_url, notes, entry_ids } = body as {
    store_id: string;
    ae_id?: string;
    staff_id?: string;
    type: string;
    month: string;
    slip_photo_url?: string | null;
    notes?: string | null;
    entry_ids?: string[];
  };

  if (!store_id || !type || !month) {
    return NextResponse.json({ error: 'store_id, type, month required' }, { status: 400 });
  }

  let entriesQuery = supabase
    .from('commission_entries')
    .select('id, net_amount, ae_id, staff_id, type, store_id')
    .eq('store_id', store_id)
    .eq('type', type)
    .is('payment_id', null)
    .is('cancelled_at', null);

  if (Array.isArray(entry_ids) && entry_ids.length > 0) {
    // Explicit pick — restrict to just the entries the user ticked.
    entriesQuery = entriesQuery.in('id', entry_ids);
  } else {
    // Legacy "pay everything" path — narrow by ae/staff + month.
    entriesQuery = entriesQuery.gte('bill_date', `${month}-01`);
    const [y, m] = month.split('-').map(Number);
    const endDate = new Date(y, m, 0).toISOString().split('T')[0];
    entriesQuery = entriesQuery.lte('bill_date', endDate);
    if (type === 'ae_commission' && ae_id) entriesQuery = entriesQuery.eq('ae_id', ae_id);
    if (type === 'bottle_commission' && staff_id) entriesQuery = entriesQuery.eq('staff_id', staff_id);
  }

  const { data: entries, error: entriesErr } = await entriesQuery;
  if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 500 });

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: 'ไม่มีรายการที่ยังไม่ได้จ่าย' }, { status: 400 });
  }

  // Sanity-check: every entry must belong to the same ae/staff so we
  // don't accidentally bundle bills for two different recipients into
  // a single payment record. The summary UI only lets the user pick
  // within one group, but enforce on the server too.
  if (type === 'ae_commission') {
    const aeIds = new Set(entries.map((e) => e.ae_id).filter(Boolean));
    if (aeIds.size !== 1) return NextResponse.json({ error: 'รายการต้องเป็น AE เดียวกัน' }, { status: 400 });
  }
  if (type === 'bottle_commission') {
    const staffIds = new Set(entries.map((e) => e.staff_id).filter(Boolean));
    if (staffIds.size !== 1) return NextResponse.json({ error: 'รายการต้องเป็นพนักงานคนเดียวกัน' }, { status: 400 });
  }

  const resolvedAeId = type === 'ae_commission' ? (ae_id ?? entries[0].ae_id ?? null) : null;
  const resolvedStaffId = type === 'bottle_commission' ? (staff_id ?? entries[0].staff_id ?? null) : null;
  const totalAmount = entries.reduce((sum, e) => sum + (Number(e.net_amount) || 0), 0);

  const { data: payment, error: payErr } = await supabase
    .from('commission_payments')
    .insert({
      store_id,
      ae_id: resolvedAeId,
      staff_id: resolvedStaffId,
      type,
      month,
      total_entries: entries.length,
      total_amount: Math.round(totalAmount * 100) / 100,
      slip_photo_url: slip_photo_url || null,
      notes: notes?.trim() || null,
      status: 'paid',
      paid_by: user.id,
    })
    .select()
    .single();

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

  const entryIds = entries.map((e) => e.id);
  const { error: updateErr } = await supabase
    .from('commission_entries')
    .update({ payment_id: payment.id })
    .in('id', entryIds);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json(payment, { status: 201 });
}
