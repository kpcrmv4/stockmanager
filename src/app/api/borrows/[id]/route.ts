import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { pushToStaffGroup, type LineMessage } from '@/lib/line/messaging';
import {
  borrowApprovedFlex,
  borrowRejectedFlex,
  borrowCompletedFlex,
} from '@/lib/line/flex-templates';
import { notifyStoreStaff } from '@/lib/notifications/service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatchBody {
  action: 'approve' | 'reject' | 'confirm_pos' | 'upload_photo';
  lenderPhotoUrl?: string;
  reason?: string;
  side?: 'borrower' | 'lender';
  photoUrl?: string;
}

interface StoreRow {
  id: string;
  store_name: string;
  line_token: string | null;
  deposit_notify_group_id: string | null;
}

interface BorrowItemRow {
  id: string;
  borrow_id: string;
  product_name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helper: fetch both stores and items for a borrow
// ---------------------------------------------------------------------------

async function fetchBorrowContext(
  serviceClient: ReturnType<typeof createServiceClient>,
  borrow: Record<string, unknown>,
) {
  const [fromStoreResult, toStoreResult, itemsResult, requesterResult, approverResult] =
    await Promise.all([
      serviceClient
        .from('stores')
        .select('id, store_name, line_token, deposit_notify_group_id')
        .eq('id', borrow.from_store_id as string)
        .single(),
      serviceClient
        .from('stores')
        .select('id, store_name, line_token, deposit_notify_group_id')
        .eq('id', borrow.to_store_id as string)
        .single(),
      serviceClient
        .from('borrow_items')
        .select('*')
        .eq('borrow_id', borrow.id as string),
      serviceClient
        .from('profiles')
        .select('id, display_name')
        .eq('id', borrow.requested_by as string)
        .single(),
      borrow.approved_by
        ? serviceClient
            .from('profiles')
            .select('id, display_name')
            .eq('id', borrow.approved_by as string)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  return {
    fromStore: fromStoreResult.data as StoreRow | null,
    toStore: toStoreResult.data as StoreRow | null,
    items: (itemsResult.data || []) as BorrowItemRow[],
    requesterName: requesterResult.data?.display_name || 'Unknown',
    approverName: approverResult.data?.display_name || null,
  };
}

// ---------------------------------------------------------------------------
// Helper: send LINE push to a store's deposit_notify_group_id
// ---------------------------------------------------------------------------

async function sendLineToStore(
  store: StoreRow | null,
  flexMsg: unknown,
): Promise<void> {
  if (!store?.deposit_notify_group_id) return;

  await pushToStaffGroup(
    store.deposit_notify_group_id,
    [flexMsg as unknown as LineMessage],
    store.line_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  );
}

// ---------------------------------------------------------------------------
// PATCH /api/borrows/[id] — Update borrow status
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ----- Auth -----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ----- Parse body -----
  const body = (await request.json()) as PatchBody;
  const { action } = body;

  if (!action) {
    return NextResponse.json(
      { error: 'action is required' },
      { status: 400 },
    );
  }

  const serviceClient = createServiceClient();

  // ----- Fetch existing borrow -----
  const { data: borrow, error: fetchError } = await serviceClient
    .from('borrows')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !borrow) {
    return NextResponse.json(
      { error: 'Borrow not found' },
      { status: 404 },
    );
  }

  // ----- Fetch current user profile -----
  const { data: userProfile } = await serviceClient
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const currentUserName = userProfile?.display_name || 'Unknown';

  try {
    // =====================================================================
    // ACTION: approve
    // =====================================================================
    if (action === 'approve') {
      if (borrow.status !== 'pending_approval') {
        return NextResponse.json(
          { error: 'Borrow is not pending approval' },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: now,
          lender_photo_url: body.lenderPhotoUrl || borrow.lender_photo_url,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Approve error:', updateError);
        return NextResponse.json(
          { error: 'Failed to approve borrow' },
          { status: 500 },
        );
      }

      // Fetch context for notifications
      const ctx = await fetchBorrowContext(serviceClient, updatedBorrow);

      const flexItems = ctx.items.map((i) => ({
        product_name: i.product_name,
        quantity: i.quantity,
        unit: i.unit || undefined,
      }));

      // Notify borrower store (in-app + PWA push)
      try {
        await notifyStoreStaff({
          storeId: updatedBorrow.from_store_id,
          type: 'approval_request',
          title: 'คำขอยืมสินค้าได้รับการอนุมัติ',
          body: `${ctx.toStore?.store_name || 'สาขา'} อนุมัติคำขอยืมสินค้า ${ctx.items.length} รายการ โดย ${currentUserName}`,
          data: { borrowId: id },
        });
      } catch (err) {
        console.error('[Borrows] Failed to notify borrower store:', err);
      }

      // Notify lender store staff about the approval (in-app + PWA push)
      try {
        await notifyStoreStaff({
          storeId: updatedBorrow.to_store_id,
          type: 'approval_request',
          title: 'อนุมัติยืมสินค้าแล้ว',
          body: `อนุมัติให้ ${ctx.fromStore?.store_name || 'สาขา'} ยืมสินค้า ${ctx.items.length} รายการ โดย ${currentUserName}`,
          data: { borrowId: id },
          excludeUserId: user.id,
        });
      } catch (err) {
        console.error('[Borrows] Failed to notify lender store:', err);
      }

      // LINE push to borrower store
      try {
        const flexMsg = borrowApprovedFlex({
          from_store_name: ctx.fromStore?.store_name || 'Unknown',
          to_store_name: ctx.toStore?.store_name || 'Unknown',
          approver_name: currentUserName,
          items: flexItems,
        });
        await sendLineToStore(ctx.fromStore, flexMsg);
      } catch (err) {
        console.error('[Borrows] Failed to send LINE to borrower:', err);
      }

      // Audit log
      await serviceClient.from('audit_logs').insert({
        store_id: updatedBorrow.to_store_id,
        action_type: 'BORROW_APPROVED',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          approved_by: user.id,
          approver_name: currentUserName,
        },
        changed_by: user.id,
      });

      return NextResponse.json({
        success: true,
        borrow: {
          ...updatedBorrow,
          borrow_items: ctx.items,
          from_store_name: ctx.fromStore?.store_name,
          to_store_name: ctx.toStore?.store_name,
        },
      });
    }

    // =====================================================================
    // ACTION: reject
    // =====================================================================
    if (action === 'reject') {
      if (borrow.status !== 'pending_approval') {
        return NextResponse.json(
          { error: 'Borrow is not pending approval' },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update({
          status: 'rejected',
          rejected_by: user.id,
          rejected_at: now,
          rejection_reason: body.reason || null,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Reject error:', updateError);
        return NextResponse.json(
          { error: 'Failed to reject borrow' },
          { status: 500 },
        );
      }

      // Fetch context for notifications
      const ctx = await fetchBorrowContext(serviceClient, updatedBorrow);

      const flexItems = ctx.items.map((i) => ({
        product_name: i.product_name,
        quantity: i.quantity,
        unit: i.unit || undefined,
      }));

      // Notify borrower store (in-app + PWA push)
      try {
        await notifyStoreStaff({
          storeId: updatedBorrow.from_store_id,
          type: 'approval_request',
          title: 'คำขอยืมสินค้าถูกปฏิเสธ',
          body: `${ctx.toStore?.store_name || 'สาขา'} ปฏิเสธคำขอยืมสินค้า${body.reason ? ` เหตุผล: ${body.reason}` : ''}`,
          data: { borrowId: id },
        });
      } catch (err) {
        console.error('[Borrows] Failed to notify borrower store:', err);
      }

      // LINE push to borrower store
      try {
        const flexMsg = borrowRejectedFlex({
          from_store_name: ctx.fromStore?.store_name || 'Unknown',
          to_store_name: ctx.toStore?.store_name || 'Unknown',
          rejector_name: currentUserName,
          reason: body.reason || undefined,
          items: flexItems,
        });
        await sendLineToStore(ctx.fromStore, flexMsg);
      } catch (err) {
        console.error('[Borrows] Failed to send LINE to borrower:', err);
      }

      // Audit log
      await serviceClient.from('audit_logs').insert({
        store_id: updatedBorrow.to_store_id,
        action_type: 'BORROW_REJECTED',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          rejected_by: user.id,
          rejector_name: currentUserName,
          reason: body.reason || null,
        },
        changed_by: user.id,
      });

      return NextResponse.json({
        success: true,
        borrow: {
          ...updatedBorrow,
          borrow_items: ctx.items,
          from_store_name: ctx.fromStore?.store_name,
          to_store_name: ctx.toStore?.store_name,
        },
      });
    }

    // =====================================================================
    // ACTION: confirm_pos
    // =====================================================================
    if (action === 'confirm_pos') {
      const { side } = body;

      if (!side || (side !== 'borrower' && side !== 'lender')) {
        return NextResponse.json(
          { error: 'side must be "borrower" or "lender"' },
          { status: 400 },
        );
      }

      if (borrow.status !== 'approved' && borrow.status !== 'pos_adjusting') {
        return NextResponse.json(
          { error: 'Borrow must be approved before confirming POS' },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();

      // Build update payload based on side
      const updatePayload: Record<string, unknown> = {
        updated_at: now,
      };

      if (side === 'borrower') {
        if (borrow.borrower_pos_confirmed) {
          return NextResponse.json(
            { error: 'Borrower POS already confirmed' },
            { status: 400 },
          );
        }
        updatePayload.borrower_pos_confirmed = true;
        updatePayload.borrower_pos_confirmed_by = user.id;
        updatePayload.borrower_pos_confirmed_at = now;
      } else {
        if (borrow.lender_pos_confirmed) {
          return NextResponse.json(
            { error: 'Lender POS already confirmed' },
            { status: 400 },
          );
        }
        updatePayload.lender_pos_confirmed = true;
        updatePayload.lender_pos_confirmed_by = user.id;
        updatePayload.lender_pos_confirmed_at = now;
      }

      // Determine if both sides will be confirmed after this update
      const borrowerConfirmed =
        side === 'borrower' ? true : !!borrow.borrower_pos_confirmed;
      const lenderConfirmed =
        side === 'lender' ? true : !!borrow.lender_pos_confirmed;
      const bothConfirmed = borrowerConfirmed && lenderConfirmed;

      if (bothConfirmed) {
        updatePayload.status = 'completed';
        updatePayload.completed_at = now;
      } else if (borrow.status === 'approved') {
        // Move to pos_adjusting once the first side confirms
        updatePayload.status = 'pos_adjusting';
      }

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Confirm POS error:', updateError);
        return NextResponse.json(
          { error: 'Failed to confirm POS' },
          { status: 500 },
        );
      }

      // Fetch context
      const ctx = await fetchBorrowContext(serviceClient, updatedBorrow);

      // If both sides confirmed => completed
      if (bothConfirmed) {
        const flexItems = ctx.items.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          unit: i.unit || undefined,
        }));

        // Notify both stores (in-app + PWA push)
        try {
          await Promise.allSettled([
            notifyStoreStaff({
              storeId: updatedBorrow.from_store_id,
              type: 'approval_request',
              title: 'ยืมสินค้าเสร็จสมบูรณ์',
              body: `การยืมสินค้าระหว่าง ${ctx.fromStore?.store_name || 'สาขา'} กับ ${ctx.toStore?.store_name || 'สาขา'} เสร็จสมบูรณ์แล้ว`,
              data: { borrowId: id },
            }),
            notifyStoreStaff({
              storeId: updatedBorrow.to_store_id,
              type: 'approval_request',
              title: 'ยืมสินค้าเสร็จสมบูรณ์',
              body: `การยืมสินค้าระหว่าง ${ctx.fromStore?.store_name || 'สาขา'} กับ ${ctx.toStore?.store_name || 'สาขา'} เสร็จสมบูรณ์แล้ว`,
              data: { borrowId: id },
            }),
          ]);
        } catch (err) {
          console.error('[Borrows] Failed to notify completion:', err);
        }

        // LINE push to both stores
        try {
          const completedFlex = borrowCompletedFlex({
            from_store_name: ctx.fromStore?.store_name || 'Unknown',
            to_store_name: ctx.toStore?.store_name || 'Unknown',
            items: flexItems,
          });

          await Promise.allSettled([
            sendLineToStore(ctx.fromStore, completedFlex),
            sendLineToStore(ctx.toStore, completedFlex),
          ]);
        } catch (err) {
          console.error('[Borrows] Failed to send LINE completion:', err);
        }
      }

      // Audit log
      await serviceClient.from('audit_logs').insert({
        store_id: side === 'borrower' ? updatedBorrow.from_store_id : updatedBorrow.to_store_id,
        action_type: 'BORROW_POS_CONFIRMED',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          side,
          confirmed_by: user.id,
          confirmer_name: currentUserName,
          both_confirmed: bothConfirmed,
        },
        changed_by: user.id,
      });

      return NextResponse.json({
        success: true,
        borrow: {
          ...updatedBorrow,
          borrow_items: ctx.items,
          from_store_name: ctx.fromStore?.store_name,
          to_store_name: ctx.toStore?.store_name,
        },
      });
    }

    // =====================================================================
    // ACTION: upload_photo
    // =====================================================================
    if (action === 'upload_photo') {
      const { side, photoUrl } = body;

      if (!side || (side !== 'borrower' && side !== 'lender')) {
        return NextResponse.json(
          { error: 'side must be "borrower" or "lender"' },
          { status: 400 },
        );
      }

      if (!photoUrl || typeof photoUrl !== 'string') {
        return NextResponse.json(
          { error: 'photoUrl is required' },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();

      const updatePayload: Record<string, unknown> = {
        updated_at: now,
      };

      if (side === 'borrower') {
        updatePayload.borrower_photo_url = photoUrl;
      } else {
        updatePayload.lender_photo_url = photoUrl;
      }

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Upload photo error:', updateError);
        return NextResponse.json(
          { error: 'Failed to upload photo' },
          { status: 500 },
        );
      }

      // Fetch items for response
      const { data: items } = await serviceClient
        .from('borrow_items')
        .select('*')
        .eq('borrow_id', id);

      // Audit log
      await serviceClient.from('audit_logs').insert({
        store_id: side === 'borrower' ? updatedBorrow.from_store_id : updatedBorrow.to_store_id,
        action_type: 'BORROW_PHOTO_UPLOADED',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          side,
          photo_url: photoUrl,
          uploaded_by: user.id,
        },
        changed_by: user.id,
      });

      return NextResponse.json({
        success: true,
        borrow: {
          ...updatedBorrow,
          borrow_items: items || [],
        },
      });
    }

    // =====================================================================
    // Unknown action
    // =====================================================================
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    console.error('[Borrows] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/borrows/[id] — Get a single borrow with items
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ----- Auth -----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  try {
    // ----- Fetch the borrow -----
    const { data: borrow, error: borrowError } = await serviceClient
      .from('borrows')
      .select('*')
      .eq('id', id)
      .single();

    if (borrowError || !borrow) {
      return NextResponse.json(
        { error: 'Borrow not found' },
        { status: 404 },
      );
    }

    // ----- Fetch related data in parallel -----
    const [itemsResult, fromStoreResult, toStoreResult, requesterResult, approverResult] =
      await Promise.all([
        serviceClient
          .from('borrow_items')
          .select('*')
          .eq('borrow_id', id),
        serviceClient
          .from('stores')
          .select('id, store_name, store_code')
          .eq('id', borrow.from_store_id)
          .single(),
        serviceClient
          .from('stores')
          .select('id, store_name, store_code')
          .eq('id', borrow.to_store_id)
          .single(),
        serviceClient
          .from('profiles')
          .select('id, display_name')
          .eq('id', borrow.requested_by)
          .single(),
        borrow.approved_by
          ? serviceClient
              .from('profiles')
              .select('id, display_name')
              .eq('id', borrow.approved_by)
              .single()
          : Promise.resolve({ data: null }),
      ]);

    // ----- Fetch POS confirmer names if present -----
    const [borrowerConfirmerResult, lenderConfirmerResult, rejectorResult] =
      await Promise.all([
        borrow.borrower_pos_confirmed_by
          ? serviceClient
              .from('profiles')
              .select('id, display_name')
              .eq('id', borrow.borrower_pos_confirmed_by)
              .single()
          : Promise.resolve({ data: null }),
        borrow.lender_pos_confirmed_by
          ? serviceClient
              .from('profiles')
              .select('id, display_name')
              .eq('id', borrow.lender_pos_confirmed_by)
              .single()
          : Promise.resolve({ data: null }),
        borrow.rejected_by
          ? serviceClient
              .from('profiles')
              .select('id, display_name')
              .eq('id', borrow.rejected_by)
              .single()
          : Promise.resolve({ data: null }),
      ]);

    return NextResponse.json({
      ...borrow,
      items: itemsResult.data || [],
      from_store_name: fromStoreResult.data?.store_name || null,
      to_store_name: toStoreResult.data?.store_name || null,
      requester_name: requesterResult.data?.display_name || null,
      approver_name: approverResult.data?.display_name || null,
    });
  } catch (error) {
    console.error('[Borrows] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
