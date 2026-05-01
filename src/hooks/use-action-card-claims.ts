'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * A live snapshot of who has claimed which task in the store's chat room.
 *
 * Several dashboard pages (`/deposit/requests`, `/bar-approval`,
 * `/deposit/withdrawals`, `/stock/...`, `/borrow`, `/hq-warehouse`) list
 * rows that are also surfaced as chat action cards. The page reads from
 * the source-of-truth table (e.g. `deposits.status='pending_staff'`) but
 * the chat card's "someone is acting on it" state lives on
 * `chat_messages.metadata.status`. Without a cross-check the same row
 * shows mutation buttons in both UIs, letting two people race to
 * approve/reject the same task.
 *
 * This hook subscribes to the store's chat room messages and exposes a
 * Map keyed by `reference_id` (deposit_code / withdrawal_id / etc.)
 * with the claimer info. Pages can then hide their action buttons +
 * show "Claimed by X" when the corresponding key is present.
 *
 * Cleanup removes the realtime channel + cancels the in-flight loader
 * so the hook doesn't leak connections across store switches.
 */

export interface ActionCardClaim {
  claimedBy: string;
  claimedByName: string;
  actionType: string;
  status: 'claimed' | 'pending_bar';
  barStep: boolean;
  claimedAt: string | null;
  timeoutMinutes: number | null;
}

export function useActionCardClaims(
  storeId: string | null | undefined,
): Map<string, ActionCardClaim> {
  const [claims, setClaims] = useState<Map<string, ActionCardClaim>>(new Map());

  useEffect(() => {
    if (!storeId) {
      setClaims(new Map());
      return;
    }
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let roomId: string | null = null;

    async function rebuildMap() {
      if (!roomId) return;
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('metadata')
        .eq('room_id', roomId)
        .eq('type', 'action_card')
        .is('archived_at', null);

      const map = new Map<string, ActionCardClaim>();
      const now = Date.now();
      for (const msg of messages || []) {
        const meta = msg.metadata as Record<string, unknown> | null;
        if (!meta) continue;
        // Most action cards key on `reference_id`. The transfer card
        // schema is older and stores its key as `transfer_code` at the
        // top level of metadata — fall back to that so transfer_receive
        // races at /hq-warehouse can be detected here too.
        const actionType = meta.action_type as string | undefined;
        const refId =
          (meta.reference_id as string | undefined) ||
          (actionType === 'transfer_receive'
            ? (meta.transfer_code as string | undefined)
            : undefined);
        // Transfer cards use a different status vocabulary
        // ('pending'|'received'|'rejected'|'partial'). For the
        // page-side lock we treat anything still claimable (i.e. not
        // received/rejected) the same as 'claimed'.
        const status = meta.status as string | undefined;
        if (!refId) continue;
        const isTransfer = actionType === 'transfer_receive';
        const isStandardClaim = status === 'claimed' || status === 'pending_bar';
        // Transfer cards don't surface a 'claimed' status — instead
        // they expose `received_by` once a HQ user starts receiving.
        // Mirror that by treating pending+received_by as a claim.
        const transferReceivingBy = isTransfer
          ? (meta.received_by as string | null | undefined)
          : null;
        const isTransferClaim =
          isTransfer && status === 'pending' && !!transferReceivingBy;
        if (!isStandardClaim && !isTransferClaim) continue;

        // Skip timed-out claims — those have semantically reflowed back
        // to "pending" even though the DB row hasn't been rewritten yet.
        const claimedAt = meta.claimed_at as string | null | undefined;
        const timeout = meta.timeout_minutes as number | null | undefined;
        if (isStandardClaim && status === 'claimed' && claimedAt && timeout && timeout > 0) {
          const deadline = new Date(claimedAt).getTime() + timeout * 60 * 1000;
          if (now > deadline) continue;
        }

        map.set(refId, {
          claimedBy:
            (meta.claimed_by as string) ||
            (isTransfer ? (meta.received_by as string) || '' : ''),
          claimedByName:
            (meta.claimed_by_name as string) ||
            (isTransfer ? (meta.received_by_name as string) || '' : ''),
          actionType: actionType || '',
          // Map transfer claim into the existing 'claimed' bucket so
          // consumers don't need to special-case it.
          status: (isStandardClaim ? (status as 'claimed' | 'pending_bar') : 'claimed'),
          barStep: meta._bar_step === true,
          claimedAt: claimedAt ?? null,
          timeoutMinutes: timeout ?? null,
        });
      }
      if (!cancelled) setClaims(map);
    }

    async function init() {
      // Find the store's chat room id (the postgres_changes filter
      // string supports `column=eq.value`, so we need the actual id).
      const { data: room } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('store_id', storeId)
        .eq('type', 'store')
        .eq('is_active', true)
        .maybeSingle();
      if (cancelled) return;
      if (!room) {
        setClaims(new Map());
        return;
      }
      roomId = room.id;
      await rebuildMap();
      if (cancelled) return;

      channel = supabase
        .channel(`action-card-claims-${storeId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            // The metadata can flip via UPDATE (claim/release/complete)
            // or arrive via INSERT (new card). Either way, refresh.
            void rebuildMap();
          },
        )
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [storeId]);

  return claims;
}
