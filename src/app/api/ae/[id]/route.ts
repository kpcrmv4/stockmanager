import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/ae/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('ae_profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PUT /api/ae/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, nickname, phone, bank_name, bank_account_no, bank_account_name, notes, is_active } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (nickname !== undefined) updates.nickname = nickname?.trim() || null;
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (bank_name !== undefined) updates.bank_name = bank_name?.trim() || null;
  if (bank_account_no !== undefined) updates.bank_account_no = bank_account_no?.trim() || null;
  if (bank_account_name !== undefined) updates.bank_account_name = bank_account_name?.trim() || null;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from('ae_profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
