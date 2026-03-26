'use client';

import { useState, useMemo } from 'react';
import {
  Hand,
  CheckCircle,
  Clock,
  Inbox,
  Wine,
  Package,
  ClipboardCheck,
  Repeat,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useChatStore } from '@/stores/chat-store';
import { ActionCardMessage } from './action-card-message';
import type { ChatMessage } from '@/types/chat';

interface MyTasksBoardProps {
  roomId: string;
  storeId: string | null;
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
}

type SubTab = 'claimed' | 'completed';

const TYPE_CONFIG: Record<string, { icon: typeof Wine; label: string }> = {
  deposit_claim: { icon: Wine, label: 'ฝากเหล้า' },
  withdrawal_claim: { icon: Package, label: 'เบิกเหล้า' },
  stock_explain: { icon: ClipboardCheck, label: 'สต๊อก' },
  borrow_approve: { icon: Repeat, label: 'ยืมสินค้า' },
  transfer_receive: { icon: Truck, label: 'โอนสต๊อก' },
};

/**
 * Get the current "store shift" window: yesterday 11:00 → today 06:00
 * If current time is before 06:00, shift is from 2 days ago 11:00 → yesterday 06:00 adjusted.
 */
function getShiftWindow(): { start: Date; end: Date } {
  const now = new Date();
  const hour = now.getHours();

  let shiftStart: Date;
  let shiftEnd: Date;

  if (hour >= 11) {
    // After 11:00 today → shift is today 11:00 to tomorrow 06:00
    shiftStart = new Date(now);
    shiftStart.setHours(11, 0, 0, 0);
    shiftEnd = new Date(now);
    shiftEnd.setDate(shiftEnd.getDate() + 1);
    shiftEnd.setHours(6, 0, 0, 0);
  } else {
    // Before 11:00 today (including 00:00-06:00) → shift is yesterday 11:00 to today 06:00
    shiftStart = new Date(now);
    shiftStart.setDate(shiftStart.getDate() - 1);
    shiftStart.setHours(11, 0, 0, 0);
    shiftEnd = new Date(now);
    shiftEnd.setHours(6, 0, 0, 0);
  }

  return { start: shiftStart, end: shiftEnd };
}

function formatShiftLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:00`;
  return `${fmt(start)} — ${fmt(end)}`;
}

export function MyTasksBoard({ roomId, storeId, currentUserId, currentUserName, currentUserRole }: MyTasksBoardProps) {
  const messages = useChatStore((s) => s.messages);
  const [subTab, setSubTab] = useState<SubTab>('claimed');

  const { start: shiftStart, end: shiftEnd } = useMemo(() => getShiftWindow(), []);
  const shiftLabel = useMemo(() => formatShiftLabel(shiftStart, shiftEnd), [shiftStart, shiftEnd]);

  // Filter: my cards within shift window
  const myCards = useMemo(() => {
    return messages.filter((msg) => {
      if (msg.type !== 'action_card' || !msg.metadata) return false;
      const meta = msg.metadata as unknown as Record<string, unknown>;
      if (!meta.action_type) return false;

      // Only cards claimed/completed by current user
      if (meta.claimed_by !== currentUserId) return false;

      // Filter by shift window
      const msgDate = new Date(msg.created_at);
      if (msgDate < shiftStart || msgDate > shiftEnd) return false;

      return true;
    });
  }, [messages, currentUserId, shiftStart, shiftEnd]);

  // Split into claimed (in-progress) and completed
  const claimedCards = useMemo(() => {
    return myCards.filter((msg) => {
      const meta = msg.metadata as unknown as Record<string, unknown>;
      return meta.status === 'claimed';
    });
  }, [myCards]);

  const completedCards = useMemo(() => {
    return myCards.filter((msg) => {
      const meta = msg.metadata as unknown as Record<string, unknown>;
      return meta.status === 'completed' || meta.status === 'received';
    });
  }, [myCards]);

  const displayCards = subTab === 'claimed' ? claimedCards : completedCards;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F0EFF5] dark:bg-gray-900">
      {/* Shift window label */}
      <div className="flex items-center justify-center gap-1.5 border-b border-gray-200 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
        <Clock className="h-3 w-3 text-gray-400" />
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          กะ {shiftLabel}
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => setSubTab('claimed')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
            subTab === 'claimed'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          )}
        >
          <Hand className="h-3.5 w-3.5" />
          งานที่กำลังทำ
          {claimedCards.length > 0 && (
            <span className="min-w-[18px] rounded-full bg-blue-500 px-1 text-center text-[10px] font-bold text-white">
              {claimedCards.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('completed')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
            subTab === 'completed'
              ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          )}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          เสร็จแล้ว
          {completedCards.length > 0 && (
            <span className="min-w-[18px] rounded-full bg-emerald-500 px-1 text-center text-[10px] font-bold text-white">
              {completedCards.length}
            </span>
          )}
        </button>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {displayCards.length === 0 ? (
          <div className="mt-12 text-center">
            <Inbox className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {subTab === 'claimed'
                ? 'ไม่มีงานที่กำลังทำ'
                : 'ยังไม่มีงานที่เสร็จในกะนี้'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayCards.map((msg) => {
              const meta = msg.metadata as unknown as Record<string, unknown>;
              const typeCfg = TYPE_CONFIG[meta.action_type as string];
              const TypeIcon = typeCfg?.icon || ClipboardCheck;

              return (
                <div key={msg.id} className="relative">
                  {/* Type badge */}
                  <div className="mb-0.5 flex items-center gap-1 px-1">
                    <TypeIcon className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] font-medium text-gray-400">
                      {typeCfg?.label || 'งาน'}
                    </span>
                  </div>
                  <ActionCardMessage
                    message={msg}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    currentUserRole={currentUserRole}
                    roomId={roomId}
                    storeId={storeId}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {(claimedCards.length > 0 || completedCards.length > 0) && (
          <div className="mt-4 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">สรุปกะนี้</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Hand className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{claimedCards.length}</span>
                <span className="text-xs text-gray-500">กำลังทำ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{completedCards.length}</span>
                <span className="text-xs text-gray-500">เสร็จแล้ว</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
