'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Wine, Package, ClipboardCheck, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ActionCardMessage } from './action-card-message';
import type { ChatMessage, ActionCardMetadata } from '@/types/chat';

interface ActionCardGroupProps {
  messages: ChatMessage[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  roomId: string;
  storeId: string | null;
}

const TYPE_ICON: Record<string, typeof Wine> = {
  deposit_claim: Wine,
  withdrawal_claim: Package,
  stock_explain: ClipboardCheck,
  borrow_approve: Repeat,
  transfer_receive: Package,
};

const TYPE_LABEL: Record<string, string> = {
  deposit_claim: 'รายการฝาก',
  withdrawal_claim: 'คำขอเบิก',
  stock_explain: 'สต๊อก',
  borrow_approve: 'คำขอยืม',
  transfer_receive: 'โอนสต๊อก',
};

const TYPE_COLOR: Record<string, string> = {
  deposit_claim: 'emerald',
  withdrawal_claim: 'blue',
  stock_explain: 'amber',
  borrow_approve: 'violet',
  transfer_receive: 'orange',
};

/**
 * Renders a group of consecutive action cards as a collapsible section.
 * Shows a summary header with count + pending/claimed badges.
 * Always shows the first card; remaining are collapsed by default.
 */
export function ActionCardGroup({ messages, currentUserId, currentUserName, currentUserRole, roomId, storeId }: ActionCardGroupProps) {
  const [expanded, setExpanded] = useState(false);

  // Determine the dominant type for the group header
  const groupInfo = useMemo(() => {
    const typeCounts = new Map<string, number>();
    let pendingCount = 0;
    let claimedCount = 0;

    for (const msg of messages) {
      const meta = msg.metadata as ActionCardMetadata;
      if (!meta) continue;
      typeCounts.set(meta.action_type, (typeCounts.get(meta.action_type) || 0) + 1);
      if (meta.status === 'pending' || meta.status === 'pending_bar') pendingCount++;
      else if (meta.status === 'claimed') claimedCount++;
    }

    // Find dominant type
    let dominantType = 'generic';
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    const isMixed = typeCounts.size > 1;
    return { dominantType, isMixed, pendingCount, claimedCount };
  }, [messages]);

  // If only 1 message, render directly without grouping
  if (messages.length === 1) {
    return (
      <ActionCardMessage
        message={messages[0]}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserRole={currentUserRole}
        roomId={roomId}
        storeId={storeId}
      />
    );
  }

  const Icon = TYPE_ICON[groupInfo.dominantType] || ClipboardCheck;
  const label = groupInfo.isMixed
    ? 'รายการงาน'
    : TYPE_LABEL[groupInfo.dominantType] || 'รายการงาน';
  const color = TYPE_COLOR[groupInfo.dominantType] || 'gray';

  // Show the most recent pending card (or last card) as preview
  const previewMsg = messages.find((m) => {
    const s = (m.metadata as ActionCardMetadata)?.status;
    return s === 'pending' || s === 'pending_bar';
  }) || messages[messages.length - 1];
  const hiddenMessages = messages.filter((m) => m.id !== previewMsg.id);

  return (
    <div className="my-1">
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2 rounded-t-xl border px-3 py-2 text-left transition-colors',
          `border-${color}-200 bg-${color}-50/80 dark:border-${color}-800 dark:bg-${color}-900/20`
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', `text-${color}-500`)} />
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
          {label} {messages.length} รายการ
        </span>
        {groupInfo.pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            รอ {groupInfo.pendingCount}
          </span>
        )}
        {groupInfo.claimedCount > 0 && (
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            ทำ {groupInfo.claimedCount}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-500">
          {expanded ? 'ซ่อน' : 'ดูทั้งหมด'}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {/* Preview card (always visible) */}
      <div className={cn(
        'border-x border-b rounded-b-xl',
        `border-${color}-200 dark:border-${color}-800`,
        expanded && 'rounded-b-none border-b-0'
      )}>
        <ActionCardMessage
          message={previewMsg}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          roomId={roomId}
          storeId={storeId}
        />
      </div>

      {/* Expanded cards */}
      {expanded && (
        <div className={cn(
          'space-y-0.5 border-x border-b rounded-b-xl pb-1',
          `border-${color}-200 dark:border-${color}-800`
        )}>
          {hiddenMessages.map((msg) => (
            <ActionCardMessage
              key={msg.id}
              message={msg}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              roomId={roomId}
              storeId={storeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Groups consecutive action_card messages into arrays.
 * Non-action messages break the group.
 * Returns an array of { type: 'group' | 'single', messages: ChatMessage[] }
 */
export function groupConsecutiveActionCards(messages: ChatMessage[]): Array<{
  type: 'action_group' | 'message';
  messages: ChatMessage[];
}> {
  const result: Array<{ type: 'action_group' | 'message'; messages: ChatMessage[] }> = [];
  let currentGroup: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.type === 'action_card') {
      currentGroup.push(msg);
    } else {
      // Flush action card group
      if (currentGroup.length > 0) {
        result.push({ type: 'action_group', messages: currentGroup });
        currentGroup = [];
      }
      result.push({ type: 'message', messages: [msg] });
    }
  }

  // Flush remaining
  if (currentGroup.length > 0) {
    result.push({ type: 'action_group', messages: currentGroup });
  }

  return result;
}
