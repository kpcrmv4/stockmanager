import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/ae — list AE profiles (search supported)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const search = req.nextUrl.searchParams.get('search') || '';
  const activeOnly = req.nextUrl.searchParams.get('active') !== 'false';

  let query = supabase
    .from('ae_profiles')
    .select('*')
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);
  if (search) query = query.or(`name.ilike.%${search}%,nickname.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

// POST /api/ae — create AE profile
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, nickname, phone, bank_name, bank_account_no, bank_account_name, notes } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'ชื่อ AE จำเป็นต้องกรอก' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ae_profiles')
    .insert({
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
