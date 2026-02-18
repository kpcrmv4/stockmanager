import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';
import { pushToStaffGroup, createFlexMessage } from '@/lib/line/messaging';
import { approvalRequestTemplate } from '@/lib/line/flex-templates';
import { notifyStoreStaff } from '@/lib/notifications/service';

/**
 * POST /api/customer/deposit-request
 * ลูกค้าส่งคำขอฝากเหล้าผ่าน LIFF หรือ token
 *
 * Body: { customerName, customerPhone?, tableNumber?, notes?, customerPhotoUrl?, storeId, token?, accessToken? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    customerName,
    customerPhone,
    tableNumber,
    notes,
    customerPhotoUrl,
    storeId,
    token,
    accessToken,
  } = body as {
    customerName?: string;
    customerPhone?: string;
    tableNumber?: string;
    notes?: string;
    customerPhotoUrl?: string;
    storeId: string;
    token?: string;
    accessToken?: string;
  };

  // -----------------------------------------------------------------------
  // Validate required fields
  // -----------------------------------------------------------------------
  if (!storeId) {
    return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
  }

  // -----------------------------------------------------------------------
  // Verify identity
  // -----------------------------------------------------------------------
  let lineUserId: string | null = null;

  if (token) {
    lineUserId = verifyCustomerToken(token);
  } else if (accessToken) {
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { userId: string };
      lineUserId = profile.userId;
    }
  }

  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // -----------------------------------------------------------------------
  // Insert deposit request
  // -----------------------------------------------------------------------
  const supabase = createServiceClient();

  const { data: inserted, error: insertError } = await supabase
    .from('deposit_requests')
    .insert({
      store_id: storeId,
      line_user_id: lineUserId,
      customer_name: customerName || 'ลูกค้า',
      customer_phone: customerPhone || null,
      product_name: null, // staff fills this later
      quantity: null,
      table_number: tableNumber || null,
      customer_photo_url: customerPhotoUrl || null,
      notes: notes || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[DepositRequest] Insert error:', insertError);
    return NextResponse.json(
      { error: 'ไม่สามารถส่งคำขอฝากเหล้าได้' },
      { status: 500 },
    );
  }

  const insertedId = inserted.id;

  // -----------------------------------------------------------------------
  // Audit log
  // -----------------------------------------------------------------------
  await supabase.from('audit_logs').insert({
    store_id: storeId,
    action_type: 'CUSTOMER_DEPOSIT_REQUEST',
    table_name: 'deposit_requests',
    new_value: {
      customer_name: customerName || 'ลูกค้า',
      line_user_id: lineUserId,
      table_number: tableNumber || null,
    },
    changed_by: null,
  });

  // -----------------------------------------------------------------------
  // Get store info for LINE notification
  // -----------------------------------------------------------------------
  const { data: store } = await supabase
    .from('stores')
    .select('store_name, line_token, deposit_notify_group_id')
    .eq('id', storeId)
    .single();

  // -----------------------------------------------------------------------
  // Notify staff via LINE (if deposit_notify_group_id exists)
  // -----------------------------------------------------------------------
  if (store?.deposit_notify_group_id) {
    try {
      const flexMsg = createFlexMessage(
        'คำขอฝากเหล้าใหม่',
        approvalRequestTemplate(
          customerName || 'ลูกค้า',
          'ฝากเหล้า (รอ Staff ระบุรายละเอียด)',
          'deposit',
          store?.store_name || '',
        ),
      );
      await pushToStaffGroup(
        store.deposit_notify_group_id,
        [flexMsg],
        store?.line_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
      );
    } catch (err) {
      console.error('[DepositRequest] Failed to notify staff via LINE:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Send web push + in-app notifications to staff/bar
  // -----------------------------------------------------------------------
  try {
    await notifyStoreStaff({
      storeId,
      type: 'new_deposit',
      title: 'มีคำขอฝากเหล้าใหม่',
      body: `${customerName || 'ลูกค้า'}${tableNumber ? ` (โต๊ะ ${tableNumber})` : ''} ต้องการฝากเหล้า`,
      data: { requestId: insertedId },
    });
  } catch (err) {
    console.error('[DepositRequest] Failed to send push notification:', err);
  }

  return NextResponse.json({ success: true, requestId: insertedId });
}
