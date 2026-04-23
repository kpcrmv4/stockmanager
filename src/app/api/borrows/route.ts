import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { pushToStaffGroup, type LineMessage } from '@/lib/line/messaging';
import { borrowRequestFlex } from '@/lib/line/flex-templates';
import { notifyStoreStaff, notifyBorrowWatchers } from '@/lib/notifications/service';
import { sendBotMessage, buildBorrowActionCard } from '@/lib/chat/bot';

const BORROW_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomBorrowSuffix(length = 5): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += BORROW_CODE_CHARS.charAt(Math.floor(Math.random() * BORROW_CODE_CHARS.length));
  }
  return s;
}

async function generateUniqueBorrowCode(
  client: SupabaseClient,
  fromCode: string,
  toCode: string,
): Promise<string> {
  // Retry a few times to dodge the vanishingly unlikely collision on the
  // 5-char suffix (36^5 ≈ 60M combinations per store pair).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `BRW-${fromCode}-${toCode}-${randomBorrowSuffix()}`;
    const { data } = await client.from('borrows').select('id').eq('borrow_code', code).maybeSingle();
    if (!data) return code;
  }
  // Fallback — extremely unlikely to reach here
  return `BRW-${fromCode}-${toCode}-${randomBorrowSuffix(7)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BorrowItemInput {
  productName: string;
  category?: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface CreateBorrowBody {
  fromStoreId: string;
  toStoreId: string;
  items: BorrowItemInput[];
  notes?: string;
  borrowerPhotoUrl?: string;
}

// ---------------------------------------------------------------------------
// POST /api/borrows — Create a new borrow request
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ----- Auth -----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ----- Parse body -----
  const body = (await request.json()) as CreateBorrowBody;
  const { fromStoreId, toStoreId, items, notes, borrowerPhotoUrl } = body;

  // ----- Validation -----
  if (!fromStoreId || !toStoreId) {
    return NextResponse.json(
      { error: 'fromStoreId and toStoreId are required' },
      { status: 400 },
    );
  }

  if (fromStoreId === toStoreId) {
    return NextResponse.json(
      { error: 'Cannot borrow from the same store' },
      { status: 400 },
    );
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: 'At least one item is required' },
      { status: 400 },
    );
  }

  for (const item of items) {
    if (!item.productName || typeof item.productName !== 'string') {
      return NextResponse.json(
        { error: 'Each item must have a productName' },
        { status: 400 },
      );
    }
    if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
      return NextResponse.json(
        { error: 'Each item must have a quantity greater than 0' },
        { status: 400 },
      );
    }
  }

  // ----- Service client for DB operations -----
  const serviceClient = createServiceClient();

  try {
    // ----- Generate human-readable borrow_code: BRW-{from_code}-{to_code}-XXXXX
    const [fromStoreCodeResult, toStoreCodeResult] = await Promise.all([
      serviceClient.from('stores').select('store_code').eq('id', fromStoreId).single(),
      serviceClient.from('stores').select('store_code').eq('id', toStoreId).single(),
    ]);
    const fromCode = fromStoreCodeResult.data?.store_code || 'XXX';
    const toCode = toStoreCodeResult.data?.store_code || 'XXX';
    const borrowCode = await generateUniqueBorrowCode(serviceClient, fromCode, toCode);

    // ----- Insert borrow -----
    const { data: borrow, error: borrowError } = await serviceClient
      .from('borrows')
      .insert({
        from_store_id: fromStoreId,
        to_store_id: toStoreId,
        requested_by: user.id,
        status: 'pending_approval',
        notes: notes || null,
        borrower_photo_url: borrowerPhotoUrl || null,
        borrow_code: borrowCode,
      })
      .select('*')
      .single();

    if (borrowError || !borrow) {
      console.error('[Borrows] Insert borrow error:', borrowError);
      return NextResponse.json(
        { error: 'Failed to create borrow request' },
        { status: 500 },
      );
    }

    // ----- Insert borrow items -----
    const borrowItemsToInsert = items.map((item) => ({
      borrow_id: borrow.id,
      product_name: item.productName,
      category: item.category || null,
      quantity: item.quantity,
      unit: item.unit || null,
      notes: item.notes || null,
    }));

    const { data: borrowItems, error: itemsError } = await serviceClient
      .from('borrow_items')
      .insert(borrowItemsToInsert)
      .select('*');

    if (itemsError) {
      console.error('[Borrows] Insert borrow_items error:', itemsError);
      // Attempt to clean up the borrow record
      await serviceClient.from('borrows').delete().eq('id', borrow.id);
      return NextResponse.json(
        { error: 'Failed to create borrow items' },
        { status: 500 },
      );
    }

    // ----- Fetch store names for notifications -----
    const [fromStoreResult, toStoreResult] = await Promise.all([
      serviceClient
        .from('stores')
        .select('store_name, line_token, deposit_notify_group_id')
        .eq('id', fromStoreId)
        .single(),
      serviceClient
        .from('stores')
        .select('store_name, line_token, deposit_notify_group_id')
        .eq('id', toStoreId)
        .single(),
    ]);

    const fromStoreName = fromStoreResult.data?.store_name || 'Unknown';
    const toStoreName = toStoreResult.data?.store_name || 'Unknown';

    // ----- Fetch requester profile -----
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const requesterName = profile?.display_name || user.email || 'Unknown';

    // ----- Notify lender store (in-app + PWA push) -----
    try {
      await notifyStoreStaff({
        storeId: toStoreId,
        type: 'approval_request',
        title: 'มีคำขอยืมสินค้า',
        body: `${fromStoreName} ขอยืมสินค้า ${items.length} รายการ โดย ${requesterName}`,
        data: { borrowId: borrow.id, url: '/borrow' },
        excludeUserId: user.id,
      });
    } catch (err) {
      console.error('[Borrows] Failed to notify lender store staff:', err);
    }

    // ----- Notify owners of BOTH stores -----
    try {
      await Promise.allSettled([
        notifyBorrowWatchers({
          storeId: fromStoreId,
          type: 'approval_request',
          title: '📦 มีการขอยืมสินค้า',
          body: `${fromStoreName} ขอยืมจาก ${toStoreName} (${items.length} รายการ) โดย ${requesterName}`,
          data: { borrowId: borrow.id, url: '/borrow' },
        }),
        notifyBorrowWatchers({
          storeId: toStoreId,
          type: 'approval_request',
          title: '📦 มีคำขอยืมสินค้าเข้ามา',
          body: `${fromStoreName} ขอยืมสินค้า ${items.length} รายการ`,
          data: { borrowId: borrow.id, url: '/borrow' },
        }),
      ]);
    } catch (err) {
      console.error('[Borrows] Failed to notify owners:', err);
    }

    // ----- Notify lender store via LINE -----
    if (toStoreResult.data?.deposit_notify_group_id) {
      try {
        const flexItems = items.map((i) => ({
          product_name: i.productName,
          quantity: i.quantity,
          unit: i.unit,
        }));

        const flexMsg = borrowRequestFlex({
          from_store_name: fromStoreName,
          to_store_name: toStoreName,
          requester_name: requesterName,
          items: flexItems,
          notes: notes || undefined,
        });

        if (toStoreResult.data.line_token) {
          await pushToStaffGroup(
            toStoreResult.data.deposit_notify_group_id,
            [flexMsg as unknown as LineMessage],
            toStoreResult.data.line_token,
          );
        }
      } catch (err) {
        console.error('[Borrows] Failed to send LINE notification to lender:', err);
      }
    }

    // ----- Send Action Card to lender store chat -----
    try {
      const itemsPreview = items
        .slice(0, 3)
        .map((i) => `${i.productName} x${i.quantity}`)
        .join(', ');
      const preview = itemsPreview + (items.length > 3 ? ` +${items.length - 3} อื่นๆ` : '');

      const actionCard = buildBorrowActionCard({
        id: borrow.id,
        borrow_code: borrow.borrow_code,
        from_store_name: fromStoreName,
        items_preview: preview,
        notes: notes || null,
      });

      console.log('[Borrows] Sending action card to lender store chat:', {
        toStoreId,
        borrowId: borrow.id,
        fromStoreName,
        preview,
      });

      const chatResult = await sendBotMessage({ storeId: toStoreId, ...actionCard });
      console.log('[Borrows] Chat action card result:', chatResult);
    } catch (chatErr) {
      console.error('[Borrows] Failed to send chat action card:', chatErr);
    }

    // ----- Audit log -----
    await serviceClient.from('audit_logs').insert({
      store_id: fromStoreId,
      action_type: 'BORROW_REQUEST_CREATED',
      table_name: 'borrows',
      new_value: {
        borrow_id: borrow.id,
        from_store_id: fromStoreId,
        to_store_id: toStoreId,
        items_count: items.length,
        requester_name: requesterName,
      },
      changed_by: user.id,
    });

    // ----- Return result -----
    return NextResponse.json({
      success: true,
      borrow: {
        ...borrow,
        borrow_items: borrowItems,
        from_store_name: fromStoreName,
        to_store_name: toStoreName,
        requester_name: requesterName,
      },
    });
  } catch (error) {
    console.error('[Borrows] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/borrows — List borrows for a store
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // ----- Auth -----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ----- Query params -----
  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get('storeId');
  const tab = searchParams.get('tab') || 'outgoing';
  const statusFilter = searchParams.get('status');

  if (!storeId) {
    return NextResponse.json(
      { error: 'storeId is required' },
      { status: 400 },
    );
  }

  const serviceClient = createServiceClient();

  try {
    // ----- Build query -----
    let query = serviceClient
      .from('borrows')
      .select(`
        *,
        borrow_items (*),
        from_store:stores!borrows_from_store_id_fkey (id, store_name, store_code),
        to_store:stores!borrows_to_store_id_fkey (id, store_name, store_code),
        requester:profiles!borrows_requested_by_fkey (id, display_name),
        approver:profiles!borrows_approved_by_fkey (id, display_name)
      `)
      .order('created_at', { ascending: false });

    // Filter by tab direction
    if (tab === 'incoming') {
      query = query.eq('to_store_id', storeId);
    } else {
      query = query.eq('from_store_id', storeId);
    }

    // Optional status filter
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: borrows, error } = await query;

    if (error) {
      console.error('[Borrows] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch borrows' },
        { status: 500 },
      );
    }

    // Flatten nested relations for the client
    const result = (borrows || []).map((b: Record<string, unknown>) => {
      const fromStore = b.from_store as Record<string, string> | null;
      const toStore = b.to_store as Record<string, string> | null;
      const requester = b.requester as Record<string, string> | null;
      const approver = b.approver as Record<string, string> | null;
      const borrowItems = b.borrow_items as unknown[];

      // Remove nested objects and add flat fields
      const { from_store, to_store, requester: _r, approver: _a, borrow_items, ...rest } = b;
      return {
        ...rest,
        from_store_name: fromStore?.store_name || null,
        to_store_name: toStore?.store_name || null,
        requester_name: requester?.display_name || null,
        approver_name: approver?.display_name || null,
        items: borrowItems || [],
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Borrows] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
