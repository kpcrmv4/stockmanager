import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/commission — list commission entries with filters
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = req.nextUrl.searchParams.get('store_id');
  const type = req.nextUrl.searchParams.get('type');
  const aeId = req.nextUrl.searchParams.get('ae_id');
  const month = req.nextUrl.searchParams.get('month'); // YYYY-MM
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100');
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

  let query = supabase
    .from('commission_entries')
    .select('*, ae_profile:ae_profiles(*), staff_profile:profiles!commission_entries_staff_id_fkey(id, display_name, username), store:stores!commission_entries_store_id_fkey(id, store_name, store_code)', { count: 'exact' })
    .order('bill_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (storeId) query = query.eq('store_id', storeId);
  if (type) query = query.eq('type', type);
  if (aeId) query = query.eq('ae_id', aeId);
  if (month) {
    const start = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const end = new Date(y, m, 0).toISOString().split('T')[0]; // last day of month
    query = query.gte('bill_date', start).lte('bill_date', end);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count });
}

// POST /api/commission — create commission entry
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { store_id, type, ae_id, staff_id, bill_date, receipt_no, receipt_photo_url, table_no, subtotal_amount, commission_rate, tax_rate, bottle_count, bottle_rate, notes } = body;

  if (!store_id || !type || !bill_date) {
    return NextResponse.json({ error: 'store_id, type, bill_date จำเป็นต้องกรอก' }, { status: 400 });
  }

  let commission_amount: number | null = null;
  let tax_amount: number | null = null;
  let net_amount: number;

  if (type === 'ae_commission') {
    if (!ae_id) return NextResponse.json({ error: 'กรุณาเลือก AE' }, { status: 400 });
    if (!subtotal_amount || subtotal_amount <= 0) return NextResponse.json({ error: 'กรุณากรอกยอดรวม' }, { status: 400 });

    const rate = commission_rate ?? 0.10;
    const tRate = tax_rate ?? 0.03;
    commission_amount = Math.round(subtotal_amount * rate * 100) / 100;
    tax_amount = Math.round(commission_amount * tRate * 100) / 100;
    net_amount = Math.round((commission_amount - tax_amount) * 100) / 100;
  } else {
    // bottle_commission
    const count = bottle_count ?? 1;
    const rate = bottle_rate ?? 500;
    net_amount = count * rate;
  }

  const { data, error } = await supabase
    .from('commission_entries')
    .insert({
      store_id,
      type,
      ae_id: type === 'ae_commission' ? ae_id : null,
      staff_id: type === 'bottle_commission' ? (staff_id || null) : null,
      bill_date,
      receipt_no: receipt_no?.trim() || null,
      receipt_photo_url: receipt_photo_url || null,
      table_no: table_no?.trim() || null,
      subtotal_amount: type === 'ae_commission' ? subtotal_amount : null,
      commission_rate: commission_rate ?? 0.10,
      tax_rate: tax_rate ?? 0.03,
      commission_amount,
      tax_amount,
      net_amount,
      bottle_count: type === 'bottle_commission' ? (bottle_count ?? 1) : null,
      bottle_rate: type === 'bottle_commission' ? (bottle_rate ?? 500) : null,
      notes: notes?.trim() || null,
      created_by: user.id,
    })
    .select('*, ae_profile:ae_profiles(*), staff_profile:profiles!commission_entries_staff_id_fkey(id, display_name, username), store:stores!commission_entries_store_id_fkey(id, store_name, store_code)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
