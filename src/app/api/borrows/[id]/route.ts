import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { pushToStaffGroup, type LineMessage } from '@/lib/line/messaging';
import {
  borrowApprovedFlex,
  borrowRejectedFlex,
  borrowCompletedFlex,
} from '@/lib/line/flex-templates';
import { notifyStoreStaff, notifyBorrowWatchers } from '@/lib/notifications/service';
import { sendBotMessage } from '@/lib/chat/bot';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatchBody {
  action:
    | 'approve'
    | 'reject'
    | 'mark_received'
    | 'upload_photo'
    | 'cancel'
    | 'mark_returned'
    | 'confirm_return_receipt';
  lenderPhotoUrl?: string;
  reason?: string;
  side?: 'borrower' | 'lender';
  photoUrl?: string;
  approvedItems?: { itemId: string; approvedQuantity: number }[];
  returnNotes?: string;
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
  if (!store?.deposit_notify_group_id || !store.line_token) return;

  await pushToStaffGroup(
    store.deposit_notify_group_id,
    [flexMsg as unknown as LineMessage],
    store.line_token,
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
    .select('display_name, role, store_id')
    .eq('id', user.id)
    .single();

  const currentUserName = userProfile?.display_name || user.email || 'Unknown';
  const currentUserRole = userProfile?.role as string | undefined;
  const currentUserStoreId = userProfile?.store_id as string | undefined;

  // Human-readable tag used in bot chat messages (falls back to short UUID prefix for legacy rows)
  const borrowTag = borrow.borrow_code
    ? `[${borrow.borrow_code}] `
    : `[BRW-${borrow.id.slice(0, 5).toUpperCase()}] `;

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

      // Update approved_quantity per item if provided
      if (body.approvedItems && body.approvedItems.length > 0) {
        await Promise.allSettled(
          body.approvedItems.map((ai) =>
            serviceClient
              .from('borrow_items')
              .update({ approved_quantity: ai.approvedQuantity })
              .eq('id', ai.itemId)
              .eq('borrow_id', id)
          )
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

      // Chat bot — system message to both stores
      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        const msg = `✅ ${borrowTag}อนุมัติยืมสินค้า — ${ctx.fromStore?.store_name} ← ${ctx.toStore?.store_name}\nรายการ: ${itemsList}\nอนุมัติโดย: ${currentUserName}`;

        await Promise.allSettled([
          sendBotMessage({ storeId: updatedBorrow.from_store_id, type: 'system', content: msg }),
          sendBotMessage({ storeId: updatedBorrow.to_store_id, type: 'system', content: msg }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to send chat message (approve):', err);
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

      // Notify owners of both stores
      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        await Promise.allSettled([
          notifyBorrowWatchers({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '✅ คำขอยืมสินค้าได้รับการอนุมัติ',
            body: `${ctx.toStore?.store_name} อนุมัติให้ ${ctx.fromStore?.store_name} ยืม (${itemsList})`,
            data: { borrowId: id, url: '/borrow' },
          }),
          notifyBorrowWatchers({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '✅ อนุมัติยืมสินค้าแล้ว',
            body: `อนุมัติให้ ${ctx.fromStore?.store_name} ยืม (${itemsList}) โดย ${currentUserName}`,
            data: { borrowId: id, url: '/borrow' },
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify owners (approve):', err);
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

      // Chat bot — system message to both stores
      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        const reasonText = body.reason ? `\nเหตุผล: ${body.reason}` : '';
        const msg = `❌ ${borrowTag}ปฏิเสธคำขอยืมสินค้า — ${ctx.fromStore?.store_name} ← ${ctx.toStore?.store_name}\nรายการ: ${itemsList}\nปฏิเสธโดย: ${currentUserName}${reasonText}`;

        await Promise.allSettled([
          sendBotMessage({ storeId: updatedBorrow.from_store_id, type: 'system', content: msg }),
          sendBotMessage({ storeId: updatedBorrow.to_store_id, type: 'system', content: msg }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to send chat message (reject):', err);
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

      // Notify owners of both stores
      try {
        await Promise.allSettled([
          notifyBorrowWatchers({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '❌ คำขอยืมสินค้าถูกปฏิเสธ',
            body: `${ctx.toStore?.store_name} ปฏิเสธคำขอยืมของ ${ctx.fromStore?.store_name}${body.reason ? ` เหตุผล: ${body.reason}` : ''}`,
            data: { borrowId: id, url: '/borrow' },
          }),
          notifyBorrowWatchers({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '❌ ปฏิเสธคำขอยืมสินค้า',
            body: `ปฏิเสธคำขอยืมจาก ${ctx.fromStore?.store_name} โดย ${currentUserName}`,
            data: { borrowId: id, url: '/borrow' },
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify owners (reject):', err);
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
    // ACTION: mark_received (borrower confirms the items were received)
    // =====================================================================
    // This replaces the old "confirm_pos" flow. The borrower takes a photo
    // of the received items and submits it — that single action completes
    // the borrow. No POS bill or per-side POS confirmation is required.
    if (action === 'mark_received') {
      if (!body.photoUrl || typeof body.photoUrl !== 'string') {
        return NextResponse.json(
          { error: 'photoUrl is required' },
          { status: 400 },
        );
      }

      // Accept both 'approved' and legacy 'pos_adjusting' as valid starting
      // points so in-flight records from the old flow can still complete.
      if (borrow.status !== 'approved' && borrow.status !== 'pos_adjusting') {
        return NextResponse.json(
          { error: 'Borrow must be approved before marking as received' },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update({
          status: 'completed',
          borrower_photo_url: body.photoUrl,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Mark received error:', updateError);
        return NextResponse.json(
          { error: 'Failed to mark as received' },
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

      // Notify both stores (in-app + PWA push) — borrower received, awaiting return
      try {
        await Promise.allSettled([
          notifyStoreStaff({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '📦 รับสินค้าที่ยืมแล้ว',
            body: `รับสินค้าจาก ${ctx.toStore?.store_name || 'สาขา'} เรียบร้อย — โปรดเบิกเหล้าไปคืน`,
            data: { borrowId: id },
            excludeUserId: user.id,
          }),
          notifyStoreStaff({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '📦 ผู้ยืมรับสินค้าแล้ว',
            body: `${ctx.fromStore?.store_name || 'สาขา'} ยืนยันรับสินค้า — รอคืน`,
            data: { borrowId: id },
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify completion:', err);
      }

      // Chat bot — system message to both stores
      // Note: status is 'completed' (items received by borrower) but the borrow is
      // NOT fully finished yet — borrower still has to withdraw stock and return it.
      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        const borrowerMsg = `📦 ${borrowTag}รับสินค้าที่ยืมแล้ว — โปรดเบิกเหล้าไปคืน\n${ctx.fromStore?.store_name} ← ${ctx.toStore?.store_name}\nรายการ: ${itemsList}\nยืนยันรับสินค้าโดย: ${currentUserName}`;
        const lenderMsg = `📦 ${borrowTag}${ctx.fromStore?.store_name} ยืนยันรับสินค้าแล้ว — รอคืน\n${ctx.fromStore?.store_name} ← ${ctx.toStore?.store_name}\nรายการ: ${itemsList}\nยืนยันรับสินค้าโดย: ${currentUserName}`;

        await Promise.allSettled([
          sendBotMessage({ storeId: updatedBorrow.from_store_id, type: 'system', content: borrowerMsg }),
          sendBotMessage({ storeId: updatedBorrow.to_store_id, type: 'system', content: lenderMsg }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to send chat message (received):', err);
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

      // Notify owners of both stores + return reminder
      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        await Promise.allSettled([
          notifyBorrowWatchers({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '🎉 ยืมสินค้าเสร็จสมบูรณ์ — รอคืน',
            body: `${ctx.fromStore?.store_name} รับสินค้าจาก ${ctx.toStore?.store_name} แล้ว (${itemsList}) กรุณาเบิกเหล้าไปคืน`,
            data: { borrowId: id, url: '/borrow' },
          }),
          notifyBorrowWatchers({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '🎉 ยืมสินค้าเสร็จสมบูรณ์',
            body: `${ctx.fromStore?.store_name} รับสินค้าเรียบร้อย (${itemsList})`,
            data: { borrowId: id, url: '/borrow' },
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify owners (completed):', err);
      }

      // Send return reminder to borrower store staff
      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        await notifyStoreStaff({
          storeId: updatedBorrow.from_store_id,
          type: 'approval_request',
          title: '⚠️ กรุณาเบิกเหล้าไปคืนสาขา ' + (ctx.toStore?.store_name || ''),
          body: `รายการที่ต้องคืน: ${itemsList}`,
          data: { borrowId: id, url: '/borrow' },
        });
      } catch (err) {
        console.error('[Borrows] Failed to send return reminder:', err);
      }

      // Audit log
      await serviceClient.from('audit_logs').insert({
        store_id: updatedBorrow.from_store_id,
        action_type: 'BORROW_MARKED_RECEIVED',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          received_by: user.id,
          receiver_name: currentUserName,
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
    // ACTION: cancel
    // =====================================================================
    if (action === 'cancel') {
      if (borrow.status !== 'pending_approval') {
        return NextResponse.json(
          { error: 'Borrow can only be cancelled when pending approval' },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update({
          status: 'cancelled',
          cancelled_by: user.id,
          cancelled_at: now,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Cancel error:', updateError);
        return NextResponse.json(
          { error: 'Failed to cancel borrow' },
          { status: 500 },
        );
      }

      // Fetch context for notifications
      const ctx = await fetchBorrowContext(serviceClient, updatedBorrow);

      // Chat bot — system message to both stores
      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        const msg = `⚠️ ${borrowTag}ยกเลิกคำขอยืมสินค้า — ${ctx.fromStore?.store_name} ← ${ctx.toStore?.store_name}\nรายการ: ${itemsList}\nยกเลิกโดย: ${currentUserName}`;

        await Promise.allSettled([
          sendBotMessage({ storeId: updatedBorrow.from_store_id, type: 'system', content: msg }),
          sendBotMessage({ storeId: updatedBorrow.to_store_id, type: 'system', content: msg }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to send chat message (cancel):', err);
      }

      // Notify lender store (in-app + PWA push)
      try {
        await notifyStoreStaff({
          storeId: updatedBorrow.to_store_id,
          type: 'approval_request',
          title: 'คำขอยืมสินค้าถูกยกเลิก',
          body: `${ctx.fromStore?.store_name || 'สาขา'} ยกเลิกคำขอยืมสินค้า ${ctx.items.length} รายการ โดย ${currentUserName}`,
          data: { borrowId: id, url: '/borrow' },
        });
      } catch (err) {
        console.error('[Borrows] Failed to notify lender store (cancel):', err);
      }

      // Notify owners of both stores
      try {
        await Promise.allSettled([
          notifyBorrowWatchers({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '⚠️ ยกเลิกคำขอยืมสินค้า',
            body: `${ctx.fromStore?.store_name} ยกเลิกคำขอยืมจาก ${ctx.toStore?.store_name} โดย ${currentUserName}`,
            data: { borrowId: id, url: '/borrow' },
          }),
          notifyBorrowWatchers({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '⚠️ คำขอยืมสินค้าถูกยกเลิก',
            body: `${ctx.fromStore?.store_name} ยกเลิกคำขอยืมสินค้า ${ctx.items.length} รายการ`,
            data: { borrowId: id, url: '/borrow' },
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify owners (cancel):', err);
      }

      // Audit log
      await serviceClient.from('audit_logs').insert({
        store_id: updatedBorrow.from_store_id,
        action_type: 'BORROW_CANCELLED',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          cancelled_by: user.id,
          canceller_name: currentUserName,
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
    // ACTION: mark_returned (borrower submits a photo that items are returned)
    // Moves status from 'completed' → 'return_pending'. The lender must then
    // confirm receipt with confirm_return_receipt before status becomes 'returned'.
    // =====================================================================
    if (action === 'mark_returned') {
      if (!body.photoUrl || typeof body.photoUrl !== 'string') {
        return NextResponse.json(
          { error: 'photoUrl is required for return confirmation' },
          { status: 400 },
        );
      }

      if (borrow.status !== 'completed') {
        return NextResponse.json(
          { error: 'Borrow must be completed before marking as returned' },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update({
          status: 'return_pending',
          return_photo_url: body.photoUrl,
          return_confirmed_by: user.id,
          return_confirmed_at: now,
          return_notes: body.returnNotes || null,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Mark returned error:', updateError);
        return NextResponse.json(
          { error: 'Failed to mark as returned' },
          { status: 500 },
        );
      }

      const ctx = await fetchBorrowContext(serviceClient, updatedBorrow);

      // Notify the lender (to_store) — they must confirm receipt
      try {
        await Promise.allSettled([
          notifyStoreStaff({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '📦 รอยืนยันรับคืนสินค้า',
            body: `${ctx.fromStore?.store_name || 'สาขา'} ส่งคืนสินค้าแล้ว กรุณาถ่ายรูปยืนยันรับคืน`,
            data: { borrowId: id, url: '/borrow' },
          }),
          notifyStoreStaff({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '📦 ส่งคืนสินค้าแล้ว',
            body: `รอ ${ctx.toStore?.store_name || 'สาขา'} ยืนยันรับคืน`,
            data: { borrowId: id, url: '/borrow' },
            excludeUserId: user.id,
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify return_pending:', err);
      }

      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        const msg = `📦 ${borrowTag}ส่งคืนสินค้ายืม รอยืนยันรับคืน — ${ctx.fromStore?.store_name} → ${ctx.toStore?.store_name}\nรายการ: ${itemsList}\nส่งคืนโดย: ${currentUserName}`;

        await Promise.allSettled([
          sendBotMessage({ storeId: updatedBorrow.from_store_id, type: 'system', content: msg }),
          sendBotMessage({ storeId: updatedBorrow.to_store_id, type: 'system', content: msg }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to send chat message (return_pending):', err);
      }

      await serviceClient.from('audit_logs').insert({
        store_id: updatedBorrow.from_store_id,
        action_type: 'BORROW_RETURN_PENDING',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          returned_by: user.id,
          returner_name: currentUserName,
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
    // ACTION: confirm_return_receipt (lender confirms receiving returned items)
    // Moves status from 'return_pending' → 'returned'. Requires a receipt photo.
    // =====================================================================
    if (action === 'confirm_return_receipt') {
      if (!body.photoUrl || typeof body.photoUrl !== 'string') {
        return NextResponse.json(
          { error: 'photoUrl is required to confirm return receipt' },
          { status: 400 },
        );
      }

      if (borrow.status !== 'return_pending') {
        return NextResponse.json(
          { error: 'Borrow must be in return_pending state before confirming receipt' },
          { status: 400 },
        );
      }

      // Only the lender (to_store) can confirm — or owner/accountant (cross-store)
      const isCrossStoreRole =
        currentUserRole === 'owner' || currentUserRole === 'accountant';
      const lenderStoreId = (borrow as { to_store_id: string }).to_store_id;
      if (!isCrossStoreRole && currentUserStoreId !== lenderStoreId) {
        return NextResponse.json(
          { error: 'Only the lender store can confirm return receipt' },
          { status: 403 },
        );
      }

      const now = new Date().toISOString();

      const { data: updatedBorrow, error: updateError } = await serviceClient
        .from('borrows')
        .update({
          status: 'returned',
          return_receipt_photo_url: body.photoUrl,
          return_received_by: user.id,
          return_received_at: now,
          updated_at: now,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updateError || !updatedBorrow) {
        console.error('[Borrows] Confirm return receipt error:', updateError);
        return NextResponse.json(
          { error: 'Failed to confirm return receipt' },
          { status: 500 },
        );
      }

      const ctx = await fetchBorrowContext(serviceClient, updatedBorrow);

      // Notify both stores
      try {
        await Promise.allSettled([
          notifyStoreStaff({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '✅ รับคืนสินค้าเรียบร้อย',
            body: `${ctx.toStore?.store_name || 'สาขา'} ยืนยันรับคืนแล้ว`,
            data: { borrowId: id, url: '/borrow' },
          }),
          notifyStoreStaff({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '✅ ยืนยันรับคืนแล้ว',
            body: `รับคืนจาก ${ctx.fromStore?.store_name || 'สาขา'} เรียบร้อย`,
            data: { borrowId: id, url: '/borrow' },
            excludeUserId: user.id,
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify return confirmed:', err);
      }

      try {
        await Promise.allSettled([
          notifyBorrowWatchers({
            storeId: updatedBorrow.from_store_id,
            type: 'approval_request',
            title: '✅ สินค้ายืมถูกคืนครบถ้วน',
            body: `${ctx.fromStore?.store_name} คืนสินค้าให้ ${ctx.toStore?.store_name} เรียบร้อย (ยืนยันรับแล้ว)`,
            data: { borrowId: id, url: '/borrow' },
          }),
          notifyBorrowWatchers({
            storeId: updatedBorrow.to_store_id,
            type: 'approval_request',
            title: '✅ สินค้ายืมถูกคืนครบถ้วน',
            body: `${ctx.fromStore?.store_name} คืนสินค้าเรียบร้อย`,
            data: { borrowId: id, url: '/borrow' },
          }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to notify owners (return receipt):', err);
      }

      try {
        const itemsList = ctx.items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
        const msg = `✅ ${borrowTag}ยืนยันรับคืนสินค้าแล้ว — ${ctx.fromStore?.store_name} → ${ctx.toStore?.store_name}\nรายการ: ${itemsList}\nยืนยันรับโดย: ${currentUserName}`;

        await Promise.allSettled([
          sendBotMessage({ storeId: updatedBorrow.from_store_id, type: 'system', content: msg }),
          sendBotMessage({ storeId: updatedBorrow.to_store_id, type: 'system', content: msg }),
        ]);
      } catch (err) {
        console.error('[Borrows] Failed to send chat message (returned):', err);
      }

      await serviceClient.from('audit_logs').insert({
        store_id: updatedBorrow.to_store_id,
        action_type: 'BORROW_RETURNED',
        table_name: 'borrows',
        new_value: {
          borrow_id: id,
          received_by: user.id,
          receiver_name: currentUserName,
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
