import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/ae?store_id=...&search=... — list AE profiles in a store.
// store_id is required so one branch can't query another branch's
// roster; the entry form passes the user's currentStoreId.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = req.nextUrl.searchParams.get('store_id');
  const search = req.nextUrl.searchParams.get('search') || '';
  const activeOnly = req.nextUrl.searchParams.get('active') !== 'false';

  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  let query = supabase
    .from('ae_profiles')
    .select('*')
    .eq('store_id', storeId)
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);
  if (search) query = query.or(`name.ilike.%${search}%,nickname.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// POST /api/ae — create AE profile (scoped to a store).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { store_id, name, nickname, phone, bank_name, bank_account_no, bank_account_name, notes } = body;

  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: 'ชื่อ AE จำเป็นต้องกรอก' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ae_profiles')
    .insert({
      store_id,
      name: name.trim(),
      nickname: nickname?.trim() || null,
      phone: phone?.trim() || null,
      bank_name: bank_name?.trim() || null,
      bank_account_no: bank_account_no?.trim() || null,
      bank_account_name: bank_account_name?.trim() || null,
      notes: notes?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
