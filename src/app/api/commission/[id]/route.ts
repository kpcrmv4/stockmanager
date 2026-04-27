import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/commission/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('commission_entries')
    .select('*, ae_profile:ae_profiles(*), staff_profile:profiles!commission_entries_staff_id_fkey(id, display_name, username), store:stores!commission_entries_store_id_fkey(id, store_name, store_code)')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PUT /api/commission/[id]
//
// Three modes (chosen via body.action):
//   - undefined / 'update' — patch fields, recalc if amounts changed
//   - 'cancel'             — soft-cancel: set cancelled_at, cancelled_by,
//                            cancel_reason. Refused if entry is already
//                            tied to a payment (cancel the payment first).
//   - 'restore'            — clear cancellation. Refused if entry is
//                            tied to a payment.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const action = body.action as string | undefined;

  // ── Cancel / restore branches ──────────────────────────────────────────
  if (action === 'cancel' || action === 'restore') {
    // Block if the entry has been included in a payment — caller must cancel
    // the payment first to avoid breaking sum integrity.
    const { data: entry, error: fetchErr } = await supabase
      .from('commission_entries')
      .select('id, payment_id, cancelled_at')
      .eq('id', id)
      .single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });
    if ((entry as { payment_id?: string | null }).payment_id) {
      return NextResponse.json({ error: 'รายการนี้ผูกกับการจ่ายแล้ว — ยกเลิกการจ่ายก่อน' }, { status: 409 });
    }

    const cancelUpdates: Record<string, unknown> = action === 'cancel'
      ? {
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
          cancel_reason: typeof body.reason === 'string' ? body.reason.trim() || null : null,
        }
      : {
          cancelled_at: null,
          cancelled_by: null,
          cancel_reason: null,
        };

    const { data, error } = await supabase
      .from('commission_entries')
      .update(cancelUpdates)
      .eq('id', id)
      .select('*, ae_profile:ae_profiles(*), staff_profile:profiles!commission_entries_staff_id_fkey(id, display_name, username, role), store:stores!commission_entries_store_id_fkey(id, store_name, store_code)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // ── Generic update branch ──────────────────────────────────────────────
  // Recalculate if amounts change
  const updates: Record<string, unknown> = {};
  if (body.bill_date !== undefined) updates.bill_date = body.bill_date;
  if (body.receipt_no !== undefined) updates.receipt_no = body.receipt_no?.trim() || null;
  if (body.receipt_photo_url !== undefined) updates.receipt_photo_url = body.receipt_photo_url || null;
  if (body.table_no !== undefined) updates.table_no = body.table_no?.trim() || null;
  if (body.ae_id !== undefined) updates.ae_id = body.ae_id;
  if (body.staff_id !== undefined) updates.staff_id = body.staff_id;
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
  if (body.bottle_product_id !== undefined) updates.bottle_product_id = body.bottle_product_id || null;
  if (body.bottle_product_name !== undefined) updates.bottle_product_name = body.bottle_product_name?.trim() || null;
  if (body.bottle_product_category !== undefined) updates.bottle_product_category = body.bottle_product_category?.trim() || null;

  // Recalc AE commission
  if (body.subtotal_amount !== undefined) {
    const subtotal = body.subtotal_amount;
    const rate = body.commission_rate ?? 0.10;
    const tRate = body.tax_rate ?? 0.03;
    const commission = Math.round(subtotal * rate * 100) / 100;
    const tax = Math.round(commission * tRate * 100) / 100;
    updates.subtotal_amount = subtotal;
    updates.commission_rate = rate;
    updates.tax_rate = tRate;
    updates.commission_amount = commission;
    updates.tax_amount = tax;
    updates.net_amount = Math.round((commission - tax) * 100) / 100;
  }

  // Recalc bottle commission
  if (body.bottle_count !== undefined || body.bottle_rate !== undefined) {
    const count = body.bottle_count ?? 1;
    const rate = body.bottle_rate ?? 500;
    updates.bottle_count = count;
    updates.bottle_rate = rate;
    updates.net_amount = count * rate;
  }

  const { data, error } = await supabase
    .from('commission_entries')
    .update(updates)
    .eq('id', id)
    .select('*, ae_profile:ae_profiles(*), staff_profile:profiles!commission_entries_staff_id_fkey(id, display_name, username, role), store:stores!commission_entries_store_id_fkey(id, store_name, store_code)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/commission/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('commission_entries')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
