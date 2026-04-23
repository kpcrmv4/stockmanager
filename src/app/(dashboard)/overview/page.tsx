'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  daysFromNowISO,
  daysAgoBangkokISO,
  startOfTodayBangkokISO,
} from '@/lib/utils/date';
import { Card, CardHeader, toast } from '@/components/ui';
import {
  Store,
  Wine,
  ClipboardCheck,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Repeat,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Users,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Loader2,
  RefreshCw,
  Inbox,
  CircleDot,
  Timer,
  FileCheck,
  CalendarClock,
  Warehouse,
  Truck,
  HandCoins,
  PlusCircle,
  Upload,
  Plus,
  Pencil,
  ToggleRight,
  Trash2,
  MessageSquare,
  MessageCircle,
  Bell,
  UserPlus,
  UserX,
  User,
  LogIn,
  Hand,
  Banknote,
  ChevronDown,
  ChevronUp,
  BarChart2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverviewData {
  storeCount: number;
  totalDepositsInStore: number;
  pendingWithdrawals: number;
  expiringDeposits: number;
  pendingExplanations: number;
  pendingApprovals: number;
  pendingTransfers: number;
  totalUsers: number;
  totalProducts: number;
  lastCheckDate: string | null;
  depositsTrend: number;
  withdrawalsTrend: number;
  stockChecksTrend: number;
  penaltiesTrend: number;
  commissionThisMonth: number;
  commissionEntries: number;
}

/** Per-store status for owner dashboard */
interface StoreStatus {
  id: string;
  name: string;
  code: string;
  isCentral: boolean;
  pendingDeposits: number;      // deposit_requests pending
  pendingWithdrawals: number;   // deposits pending_withdrawal
  expiringDeposits: number;     // expiring within 7 days
  activeDeposits: number;       // deposits in_store
  pendingExplanations: number;  // comparisons pending
  pendingApprovals: number;     // comparisons explained
  pendingTransfers: number;     // transfers pending (outgoing)
  pendingIncomingTransfers: number; // transfers pending (incoming to HQ)
  lastStockCheck: string | null;
  totalIssues: number;          // sum of all pending items
  borrowsToApprove: number; // from_store_id (Borrower), pending_approval
  borrowsToReturn: number;  // from_store_id (Borrower), completed
  lendsToApprove: number;   // to_store_id (Lender), pending_approval
  lendsToReceive: number;   // to_store_id (Lender), completed
  commissionThisMonth: number;  // commission net total this month
  commissionEntries: number;    // commission entry count this month
  depositsThisMonth: number;    // deposits created this month
  withdrawalsThisMonth: number; // deposits withdrawn this month (created_at in month, status=withdrawn)
  stockChecksThisMonth: number; // manual_counts created this month
  pendingConfirm: number;       // deposits awaiting bar confirmation (status=pending_confirm)
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  table_name: string | null;
  created_at: string;
  changed_by_name: string | null;
  record_id: string | null;
  new_value: Record<string, unknown> | null;
}

interface ModuleCardConfig {
  id: string;
  name: string;
  icon: LucideIcon;
  href: string;
  color: string;         // tailwind color name (indigo, emerald, ...)
  metrics: string[];      // computed metric strings
  description?: string;   // fallback if no metrics
}

// Metrics displayed in the per-store comparison chart (owner only).
// All values are already present on StoreStatus — no extra fetch needed.
type ComparisonMetric = {
  key: keyof StoreStatus;
  labelKey: string;
  format: (v: number) => string;
};

const COMPARISON_METRICS: ReadonlyArray<ComparisonMetric> = [
  { key: 'depositsThisMonth', labelKey: 'compareDeposits', format: (v) => formatNumber(v) },
  { key: 'withdrawalsThisMonth', labelKey: 'compareWithdrawals', format: (v) => formatNumber(v) },
  { key: 'stockChecksThisMonth', labelKey: 'compareStockChecks', format: (v) => formatNumber(v) },
  { key: 'commissionThisMonth', labelKey: 'compareCommission', format: (v) => `฿${formatNumber(Math.round(v))}` },
  { key: 'activeDeposits', labelKey: 'compareActiveDeposits', format: (v) => formatNumber(v) },
  { key: 'expiringDeposits', labelKey: 'comparePending', format: (v) => formatNumber(v) },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Relative-time string from an ISO timestamp */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function relativeTime(isoDate: string, t: (key: string, values?: any) => string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return t('relativeTime.justNow');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('relativeTime.minutesAgo', { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t('relativeTime.hoursAgo', { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return t('relativeTime.daysAgo', { count: diffDay });
  return formatThaiDate(isoDate);
}

/** Full action → icon mapping */
const ACTION_ICON_MAP: Record<string, LucideIcon> = {
  STOCK_COUNT_SAVED: ClipboardCheck,
  STOCK_COUNT_RESET: RefreshCw,
  STOCK_EXPLANATION_SUBMITTED: MessageSquare,
  STOCK_EXPLANATION_BATCH: MessageSquare,
  STOCK_APPROVED: CheckCircle2,
  STOCK_REJECTED: XCircle,
  STOCK_BATCH_APPROVED: CheckCircle2,
  STOCK_BATCH_REJECTED: XCircle,
  STOCK_COMPARISON_GENERATED: BarChart3,
  STOCK_TXT_UPLOADED: Upload,
  AUTO_ADD_PRODUCT: PlusCircle,
  AUTO_DEACTIVATE: XCircle,
  AUTO_REACTIVATE: CheckCircle2,
  PRODUCT_CREATED: Plus,
  PRODUCT_UPDATED: Pencil,
  PRODUCT_TOGGLED: ToggleRight,
  PRODUCT_DELETED: Trash2,
  DEPOSIT_CREATED: Wine,
  DEPOSIT_REQUEST_APPROVED: CheckCircle2,
  DEPOSIT_REQUEST_REJECTED: XCircle,
  DEPOSIT_STATUS_CHANGED: RefreshCw,
  DEPOSIT_BAR_CONFIRMED: CheckCircle2,
  DEPOSIT_BAR_REJECTED: XCircle,
  WITHDRAWAL_COMPLETED: Package,
  WITHDRAWAL_REJECTED: XCircle,
  WITHDRAWAL_REQUESTED: Package,
  DEPOSIT_NO_DEPOSIT_CREATED: Truck,
  TRANSFER_CREATED: Truck,
  TRANSFER_CONFIRMED: CheckCircle2,
  TRANSFER_REJECTED: XCircle,
  CUSTOMER_DEPOSIT_REQUEST: Wine,
  CUSTOMER_WITHDRAWAL_REQUEST: Package,
  CUSTOMER_INQUIRY: MessageCircle,
  CRON_DAILY_REMINDER_SENT: Bell,
  CRON_EXPIRY_CHECK: Clock,
  CRON_DEPOSIT_EXPIRED: AlertTriangle,
  CRON_FOLLOW_UP_SENT: Bell,
  USER_CREATED: UserPlus,
  USER_UPDATED: User,
  USER_DEACTIVATED: UserX,
  USER_LOGIN: LogIn,
  BORROW_REQUESTED: Repeat,
  BORROW_APPROVED: CheckCircle2,
  BORROW_REJECTED: XCircle,
  BORROW_POS_CONFIRMED: CheckCircle2,
  BORROW_COMPLETED: CheckCircle2,
  BORROW_RETURN_PENDING: Clock,
  BORROW_RETURNED: Repeat,
  BORROW_MARKED_RECEIVED: CheckCircle2,
  BORROW_PHOTO_UPLOADED: Upload,
  ACTION_CARD_CLAIMED: Hand,
  ACTION_CARD_RELEASED: XCircle,
  ACTION_CARD_COMPLETED: CheckCircle2,
  ACTION_CARD_REJECTED: XCircle,
  SETTINGS_UPDATED: Settings,
  STORE_CREATED: Store,
  STORE_UPDATED: Store,
  AUDIT_LOG_CLEANUP: Trash2,
  COMMISSION_ENTRY_CREATED: HandCoins,
  COMMISSION_ENTRY_UPDATED: Pencil,
  COMMISSION_ENTRY_DELETED: Trash2,
  COMMISSION_PAYMENT_CREATED: Banknote,
  COMMISSION_PAYMENT_CANCELLED: XCircle,
  AE_PROFILE_CREATED: UserPlus,
  AE_PROFILE_UPDATED: User,
};

/** Full action → color mapping */
const ACTION_COLOR_MAP: Record<string, string> = {
  STOCK_COUNT_SAVED: 'text-indigo-500',
  STOCK_COUNT_RESET: 'text-gray-500',
  STOCK_EXPLANATION_SUBMITTED: 'text-amber-500',
  STOCK_EXPLANATION_BATCH: 'text-amber-500',
  STOCK_APPROVED: 'text-emerald-500',
  STOCK_REJECTED: 'text-red-500',
  STOCK_BATCH_APPROVED: 'text-emerald-500',
  STOCK_BATCH_REJECTED: 'text-red-500',
  STOCK_COMPARISON_GENERATED: 'text-blue-500',
  STOCK_TXT_UPLOADED: 'text-violet-500',
  AUTO_ADD_PRODUCT: 'text-blue-500',
  AUTO_DEACTIVATE: 'text-red-500',
  AUTO_REACTIVATE: 'text-emerald-500',
  PRODUCT_CREATED: 'text-blue-500',
  PRODUCT_UPDATED: 'text-amber-500',
  PRODUCT_TOGGLED: 'text-gray-500',
  PRODUCT_DELETED: 'text-red-500',
  DEPOSIT_CREATED: 'text-emerald-500',
  DEPOSIT_REQUEST_APPROVED: 'text-emerald-500',
  DEPOSIT_REQUEST_REJECTED: 'text-red-500',
  DEPOSIT_STATUS_CHANGED: 'text-blue-500',
  DEPOSIT_BAR_CONFIRMED: 'text-emerald-500',
  DEPOSIT_BAR_REJECTED: 'text-red-500',
  WITHDRAWAL_COMPLETED: 'text-emerald-500',
  WITHDRAWAL_REJECTED: 'text-red-500',
  WITHDRAWAL_REQUESTED: 'text-blue-500',
  DEPOSIT_NO_DEPOSIT_CREATED: 'text-orange-500',
  TRANSFER_CREATED: 'text-blue-500',
  TRANSFER_CONFIRMED: 'text-emerald-500',
  TRANSFER_REJECTED: 'text-red-500',
  CUSTOMER_DEPOSIT_REQUEST: 'text-green-500',
  CUSTOMER_WITHDRAWAL_REQUEST: 'text-green-500',
  CUSTOMER_INQUIRY: 'text-green-500',
  CRON_DAILY_REMINDER_SENT: 'text-gray-400',
  CRON_EXPIRY_CHECK: 'text-gray-400',
  CRON_DEPOSIT_EXPIRED: 'text-red-500',
  CRON_FOLLOW_UP_SENT: 'text-gray-400',
  USER_CREATED: 'text-blue-500',
  USER_UPDATED: 'text-amber-500',
  USER_DEACTIVATED: 'text-red-500',
  USER_LOGIN: 'text-gray-400',
  BORROW_REQUESTED: 'text-teal-500',
  BORROW_APPROVED: 'text-emerald-500',
  BORROW_REJECTED: 'text-red-500',
  BORROW_POS_CONFIRMED: 'text-violet-500',
  BORROW_COMPLETED: 'text-emerald-500',
  BORROW_RETURN_PENDING: 'text-amber-500',
  BORROW_RETURNED: 'text-teal-500',
  BORROW_MARKED_RECEIVED: 'text-emerald-500',
  BORROW_PHOTO_UPLOADED: 'text-violet-500',
  ACTION_CARD_CLAIMED: 'text-blue-500',
  ACTION_CARD_RELEASED: 'text-amber-500',
  ACTION_CARD_COMPLETED: 'text-emerald-500',
  ACTION_CARD_REJECTED: 'text-red-500',
  SETTINGS_UPDATED: 'text-gray-500',
  STORE_CREATED: 'text-blue-500',
  STORE_UPDATED: 'text-amber-500',
  AUDIT_LOG_CLEANUP: 'text-red-500',
  COMMISSION_ENTRY_CREATED: 'text-amber-500',
  COMMISSION_ENTRY_UPDATED: 'text-amber-500',
  COMMISSION_ENTRY_DELETED: 'text-red-500',
  COMMISSION_PAYMENT_CREATED: 'text-emerald-500',
  COMMISSION_PAYMENT_CANCELLED: 'text-red-500',
  AE_PROFILE_CREATED: 'text-blue-500',
  AE_PROFILE_UPDATED: 'text-amber-500',
};

/** Known action types for i18n lookup */
const KNOWN_ACTION_TYPES = new Set([
  'STOCK_COUNT_SAVED', 'STOCK_COUNT_RESET', 'STOCK_EXPLANATION_SUBMITTED',
  'STOCK_EXPLANATION_BATCH', 'STOCK_APPROVED', 'STOCK_REJECTED',
  'STOCK_BATCH_APPROVED', 'STOCK_BATCH_REJECTED', 'STOCK_COMPARISON_GENERATED',
  'STOCK_TXT_UPLOADED', 'AUTO_ADD_PRODUCT', 'AUTO_DEACTIVATE', 'AUTO_REACTIVATE',
  'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_TOGGLED', 'PRODUCT_DELETED',
  'DEPOSIT_CREATED', 'DEPOSIT_REQUEST_APPROVED', 'DEPOSIT_REQUEST_REJECTED',
  'DEPOSIT_STATUS_CHANGED', 'DEPOSIT_BAR_CONFIRMED', 'DEPOSIT_BAR_REJECTED',
  'WITHDRAWAL_COMPLETED', 'WITHDRAWAL_REJECTED', 'WITHDRAWAL_REQUESTED',
  'DEPOSIT_NO_DEPOSIT_CREATED', 'TRANSFER_CREATED', 'TRANSFER_CONFIRMED',
  'TRANSFER_REJECTED', 'CUSTOMER_DEPOSIT_REQUEST', 'CUSTOMER_WITHDRAWAL_REQUEST',
  'CUSTOMER_INQUIRY', 'CRON_DAILY_REMINDER_SENT', 'CRON_EXPIRY_CHECK',
  'CRON_DEPOSIT_EXPIRED', 'CRON_FOLLOW_UP_SENT', 'USER_CREATED', 'USER_UPDATED',
  'USER_DEACTIVATED', 'USER_LOGIN', 'BORROW_REQUESTED', 'BORROW_APPROVED',
  'BORROW_REJECTED', 'BORROW_POS_CONFIRMED', 'BORROW_COMPLETED',
  'BORROW_RETURN_PENDING', 'BORROW_RETURNED', 'BORROW_MARKED_RECEIVED',
  'BORROW_PHOTO_UPLOADED',
  'ACTION_CARD_CLAIMED', 'ACTION_CARD_RELEASED', 'ACTION_CARD_COMPLETED',
  'ACTION_CARD_REJECTED', 'SETTINGS_UPDATED', 'STORE_CREATED', 'STORE_UPDATED',
  'AUDIT_LOG_CLEANUP', 'COMMISSION_ENTRY_CREATED', 'COMMISSION_ENTRY_UPDATED',
  'COMMISSION_ENTRY_DELETED', 'COMMISSION_PAYMENT_CREATED',
  'COMMISSION_PAYMENT_CANCELLED', 'AE_PROFILE_CREATED', 'AE_PROFILE_UPDATED',
  'INSERT', 'UPDATE', 'DELETE',
]);

/** Map audit_logs action to label + icon + color */
function mapActivity(actionType: string, tableName: string | null, t: (key: string) => string): {
  label: string;
  icon: LucideIcon;
  colorClass: string;
} {
  // Handle legacy generic INSERT/UPDATE/DELETE with table context
  if ((actionType === 'INSERT' || actionType === 'UPDATE' || actionType === 'DELETE') && tableName) {
    if (actionType === 'INSERT' && tableName === 'deposits') {
      return { label: t('actions.legacyInsertDeposit'), icon: Wine, colorClass: 'text-emerald-500' };
    }
    if (actionType === 'INSERT' && tableName === 'withdrawals') {
      return { label: t('actions.legacyInsertWithdrawal'), icon: Package, colorClass: 'text-blue-500' };
    }
    if (actionType === 'UPDATE' && tableName === 'comparisons') {
      return { label: t('actions.legacyUpdateComparison'), icon: BarChart3, colorClass: 'text-amber-500' };
    }
    const fallbackLabel = KNOWN_ACTION_TYPES.has(actionType) ? t(`actions.${actionType}`) : actionType;
    return { label: fallbackLabel, icon: Clock, colorClass: 'text-gray-400' };
  }

  if (KNOWN_ACTION_TYPES.has(actionType)) {
    return {
      label: t(`actions.${actionType}`),
      icon: ACTION_ICON_MAP[actionType] || Clock,
      colorClass: ACTION_COLOR_MAP[actionType] || 'text-gray-400',
    };
  }

  return { label: actionType || t('activity.fallbackLabel'), icon: Clock, colorClass: 'text-gray-400' };
}

/** Build detail string from audit log entry */
function getActivityDetail(activity: AuditLogEntry): string | null {
  const { action_type, record_id, new_value } = activity;

  // Show record_id as reference number for relevant actions
  if (record_id) {
    // Extract useful details from new_value if available
    const nv = new_value as Record<string, unknown> | null;

    if (action_type === 'DEPOSIT_CREATED' || action_type === 'DEPOSIT_REQUEST_APPROVED' ||
        action_type === 'DEPOSIT_REQUEST_REJECTED' || action_type === 'DEPOSIT_STATUS_CHANGED' ||
        action_type === 'DEPOSIT_BAR_CONFIRMED' || action_type === 'DEPOSIT_BAR_REJECTED') {
      const code = nv?.deposit_code || nv?.deposit_number || record_id.slice(0, 8);
      const customer = nv?.customer_name as string | undefined;
      return customer ? `#${code} — ${customer}` : `#${code}`;
    }

    if (action_type === 'WITHDRAWAL_COMPLETED' || action_type === 'WITHDRAWAL_REJECTED' ||
        action_type === 'WITHDRAWAL_REQUESTED') {
      const code = nv?.deposit_code || nv?.deposit_number || record_id.slice(0, 8);
      const customer = nv?.customer_name as string | undefined;
      return customer ? `#${code} — ${customer}` : `#${code}`;
    }

    if (action_type === 'PRODUCT_CREATED' || action_type === 'PRODUCT_UPDATED' ||
        action_type === 'PRODUCT_DELETED' || action_type === 'PRODUCT_TOGGLED') {
      const name = nv?.product_name || nv?.name;
      return name ? `${name}` : `#${record_id.slice(0, 8)}`;
    }

    if (action_type === 'AUTO_ADD_PRODUCT') {
      const name = nv?.product_name || nv?.name;
      return name ? `${name}` : null;
    }

    if (action_type === 'AUTO_DEACTIVATE' || action_type === 'AUTO_REACTIVATE') {
      const name = nv?.product_name || nv?.name;
      return name ? `${name}` : null;
    }

    if (action_type === 'TRANSFER_CREATED' || action_type === 'TRANSFER_CONFIRMED' ||
        action_type === 'TRANSFER_REJECTED') {
      return `#${record_id.slice(0, 8)}`;
    }

    if (action_type === 'BORROW_REQUESTED' || action_type === 'BORROW_APPROVED' ||
        action_type === 'BORROW_REJECTED' || action_type === 'BORROW_COMPLETED' ||
        action_type === 'BORROW_POS_CONFIRMED') {
      return `#${record_id.slice(0, 8)}`;
    }

    if (action_type === 'COMMISSION_PAYMENT_CREATED' || action_type === 'COMMISSION_PAYMENT_CANCELLED') {
      const amount = nv?.total_amount || nv?.amount;
      return amount ? `฿${formatNumber(Number(amount))}` : `#${record_id.slice(0, 8)}`;
    }

    if (action_type === 'COMMISSION_ENTRY_CREATED' || action_type === 'COMMISSION_ENTRY_UPDATED') {
      const aeName = nv?.ae_name as string | undefined;
      return aeName ? `${aeName}` : `#${record_id.slice(0, 8)}`;
    }

    if (action_type === 'STOCK_TXT_UPLOADED' || action_type === 'STOCK_COMPARISON_GENERATED') {
      const storeName = nv?.store_name as string | undefined;
      return storeName || null;
    }

    if (action_type === 'STOCK_EXPLANATION_SUBMITTED' || action_type === 'STOCK_APPROVED' ||
        action_type === 'STOCK_REJECTED') {
      const productName = nv?.product_name as string | undefined;
      return productName || null;
    }

    if (action_type === 'ACTION_CARD_CLAIMED' || action_type === 'ACTION_CARD_COMPLETED' ||
        action_type === 'ACTION_CARD_RELEASED' || action_type === 'ACTION_CARD_REJECTED') {
      const refId = nv?.reference_id as string | undefined;
      const actionTypeCard = nv?.action_type as string | undefined;
      if (refId) return `#${refId}`;
      if (actionTypeCard) return actionTypeCard;
      return `#${record_id.slice(0, 8)}`;
    }
  }

  return null;
}

/** Map action_type to navigable URL */
function getActivityHref(actionType: string, tableName: string | null): string | null {
  // Deposit
  if (actionType === 'DEPOSIT_CREATED' || actionType === 'DEPOSIT_REQUEST_APPROVED' ||
      actionType === 'DEPOSIT_REQUEST_REJECTED' || actionType === 'DEPOSIT_STATUS_CHANGED' ||
      actionType === 'DEPOSIT_BAR_CONFIRMED' || actionType === 'DEPOSIT_BAR_REJECTED' ||
      actionType === 'DEPOSIT_NO_DEPOSIT_CREATED' ||
      (actionType === 'INSERT' && tableName === 'deposits')) {
    return '/deposit';
  }
  if (actionType === 'DEPOSIT_REQUEST_APPROVED' || actionType === 'DEPOSIT_REQUEST_REJECTED') {
    return '/deposit/requests';
  }

  // Withdrawal
  if (actionType === 'WITHDRAWAL_COMPLETED' || actionType === 'WITHDRAWAL_REJECTED' ||
      actionType === 'WITHDRAWAL_REQUESTED' ||
      (actionType === 'INSERT' && tableName === 'withdrawals')) {
    return '/deposit/withdrawals';
  }

  // Bar approval
  if (actionType === 'DEPOSIT_BAR_CONFIRMED' || actionType === 'DEPOSIT_BAR_REJECTED') {
    return '/bar-approval';
  }

  // Stock
  if (actionType === 'STOCK_COUNT_SAVED' || actionType === 'STOCK_COUNT_RESET') {
    return '/stock/daily-check';
  }
  if (actionType === 'STOCK_COMPARISON_GENERATED' || actionType === 'STOCK_TXT_UPLOADED' ||
      (actionType === 'UPDATE' && tableName === 'comparisons')) {
    return '/stock/comparison';
  }
  if (actionType === 'STOCK_EXPLANATION_SUBMITTED' || actionType === 'STOCK_EXPLANATION_BATCH') {
    return '/stock/explanation';
  }
  if (actionType === 'STOCK_APPROVED' || actionType === 'STOCK_REJECTED' ||
      actionType === 'STOCK_BATCH_APPROVED' || actionType === 'STOCK_BATCH_REJECTED') {
    return '/stock/approval';
  }

  // Product
  if (actionType === 'PRODUCT_CREATED' || actionType === 'PRODUCT_UPDATED' ||
      actionType === 'PRODUCT_DELETED' || actionType === 'PRODUCT_TOGGLED' ||
      actionType === 'AUTO_ADD_PRODUCT' || actionType === 'AUTO_DEACTIVATE' ||
      actionType === 'AUTO_REACTIVATE') {
    return '/stock/products';
  }

  // Transfer
  if (actionType === 'TRANSFER_CREATED' || actionType === 'TRANSFER_CONFIRMED' ||
      actionType === 'TRANSFER_REJECTED') {
    return '/transfer';
  }

  // Borrow
  if (actionType === 'BORROW_REQUESTED' || actionType === 'BORROW_APPROVED' ||
      actionType === 'BORROW_REJECTED' || actionType === 'BORROW_POS_CONFIRMED' ||
      actionType === 'BORROW_COMPLETED') {
    return '/borrow';
  }

  // Commission
  if (actionType === 'COMMISSION_ENTRY_CREATED' || actionType === 'COMMISSION_ENTRY_UPDATED' ||
      actionType === 'COMMISSION_ENTRY_DELETED' || actionType === 'COMMISSION_PAYMENT_CREATED' ||
      actionType === 'COMMISSION_PAYMENT_CANCELLED' || actionType === 'AE_PROFILE_CREATED' ||
      actionType === 'AE_PROFILE_UPDATED') {
    return '/commission';
  }

  // Chat / Action Cards
  if (actionType === 'ACTION_CARD_CLAIMED' || actionType === 'ACTION_CARD_COMPLETED' ||
      actionType === 'ACTION_CARD_RELEASED' || actionType === 'ACTION_CARD_REJECTED') {
    return '/chat';
  }

  // Users
  if (actionType === 'USER_CREATED' || actionType === 'USER_UPDATED' ||
      actionType === 'USER_DEACTIVATED') {
    return '/users';
  }

  // Settings
  if (actionType === 'SETTINGS_UPDATED' || actionType === 'STORE_CREATED' ||
      actionType === 'STORE_UPDATED') {
    return '/settings';
  }

  // Activity log
  if (actionType === 'AUDIT_LOG_CLEANUP') {
    return '/activity';
  }

  return null;
}

/** Calculate percentage trend between two periods */
function calcTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
}

/** Badge showing trend percentage with directional arrow */
function TrendBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        isPositive
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-600 dark:text-red-400'
      )}
    >
      {isPositive ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" />
      )}
      {Math.abs(value)}%
    </span>
  );
}

/** Color utility maps keyed by module color name */
const COLOR_MAP: Record<
  string,
  { lightBg: string; text: string; border: string; iconBg: string }
> = {
  indigo: {
    lightBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-l-indigo-500',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  emerald: {
    lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  blue: {
    lightBg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  violet: {
    lightBg: 'bg-violet-50 dark:bg-violet-900/20',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-l-violet-500',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
  },
  amber: {
    lightBg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  gray: {
    lightBg: 'bg-gray-50 dark:bg-gray-700/30',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-l-gray-400',
    iconBg: 'bg-gray-100 dark:bg-gray-700/40',
  },
  rose: {
    lightBg: 'bg-rose-50 dark:bg-rose-900/20',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-l-rose-500',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const t = useTranslations('overview');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewData>({
    storeCount: 0,
    totalDepositsInStore: 0,
    pendingWithdrawals: 0,
    expiringDeposits: 0,
    pendingExplanations: 0,
    pendingApprovals: 0,
    pendingTransfers: 0,
    totalUsers: 0,
    totalProducts: 0,
    lastCheckDate: null,
    depositsTrend: 0,
    withdrawalsTrend: 0,
    stockChecksTrend: 0,
    penaltiesTrend: 0,
    commissionThisMonth: 0,
    commissionEntries: 0,
  });
  const [activities, setActivities] = useState<AuditLogEntry[]>([]);
  const [storeStatuses, setStoreStatuses] = useState<StoreStatus[]>([]);
  // Per-store-card expansion state (owner view). Collapsed by default — users
  // see a lightweight header + badges and click to reveal full metric breakdown.
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const toggleStore = (id: string) => {
    setExpandedStores((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allExpanded = storeStatuses.length > 0 && expandedStores.size === storeStatuses.length;
  const toggleAllStores = () => {
    if (allExpanded) setExpandedStores(new Set());
    else setExpandedStores(new Set(storeStatuses.map((s) => s.id)));
  };

  const isOwner = user?.role === 'owner';

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // For owner: no store filter (see all). For manager: filter by currentStoreId.
      const storeFilter = isOwner ? null : currentStoreId;

      const sevenDaysFromNow = daysFromNowISO(7);
      const todayISO = startOfTodayBangkokISO();
      const thirtyDaysAgoISO = daysAgoBangkokISO(30);
      const sixtyDaysAgoISO = daysAgoBangkokISO(60);
      const now = new Date();
      const commissionMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const commissionMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      // -------- Build all queries (no awaits) --------
      // Global headline counts
      const storesQuery = supabase.from('stores').select('*', { count: 'exact', head: true }).eq('active', true);

      const depositsInStoreQuery = supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'in_store');
      if (storeFilter) depositsInStoreQuery.eq('store_id', storeFilter);

      const pendingWithdrawalsQuery = supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'pending_withdrawal');
      if (storeFilter) pendingWithdrawalsQuery.eq('store_id', storeFilter);

      const expiringQuery = supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'in_store').lt('expiry_date', sevenDaysFromNow).gt('expiry_date', todayISO);
      if (storeFilter) expiringQuery.eq('store_id', storeFilter);

      const pendingExplQuery = supabase.from('comparisons').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      if (storeFilter) pendingExplQuery.eq('store_id', storeFilter);

      const pendingApprQuery = supabase.from('comparisons').select('*', { count: 'exact', head: true }).eq('status', 'explained');
      if (storeFilter) pendingApprQuery.eq('store_id', storeFilter);

      const pendingTransfersQuery = supabase.from('transfers').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      if (storeFilter) pendingTransfersQuery.eq('from_store_id', storeFilter);

      const usersQuery = supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('active', true);

      const productsQuery = supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true);
      if (storeFilter) productsQuery.eq('store_id', storeFilter);

      const latestCountBuilder = supabase.from('manual_counts').select('count_date').order('count_date', { ascending: false }).limit(1);
      if (storeFilter) latestCountBuilder.eq('store_id', storeFilter);
      const latestCountQuery = latestCountBuilder.maybeSingle();

      // Trend queries (current vs previous 30-day window)
      const curDepositsQ = supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'in_store').gte('created_at', thirtyDaysAgoISO);
      if (storeFilter) curDepositsQ.eq('store_id', storeFilter);

      const curWithdrawalsQ = supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'withdrawn').gte('created_at', thirtyDaysAgoISO);
      if (storeFilter) curWithdrawalsQ.eq('store_id', storeFilter);

      const curStockChecksQ = supabase.from('manual_counts').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgoISO);
      if (storeFilter) curStockChecksQ.eq('store_id', storeFilter);

      const curPenaltiesQ = supabase.from('comparisons').select('*', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', thirtyDaysAgoISO);
      if (storeFilter) curPenaltiesQ.eq('store_id', storeFilter);

      const prevDepositsQ = supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'in_store').gte('created_at', sixtyDaysAgoISO).lt('created_at', thirtyDaysAgoISO);
      if (storeFilter) prevDepositsQ.eq('store_id', storeFilter);

      const prevWithdrawalsQ = supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'withdrawn').gte('created_at', sixtyDaysAgoISO).lt('created_at', thirtyDaysAgoISO);
      if (storeFilter) prevWithdrawalsQ.eq('store_id', storeFilter);

      const prevStockChecksQ = supabase.from('manual_counts').select('*', { count: 'exact', head: true }).gte('created_at', sixtyDaysAgoISO).lt('created_at', thirtyDaysAgoISO);
      if (storeFilter) prevStockChecksQ.eq('store_id', storeFilter);

      const prevPenaltiesQ = supabase.from('comparisons').select('*', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', sixtyDaysAgoISO).lt('created_at', thirtyDaysAgoISO);
      if (storeFilter) prevPenaltiesQ.eq('store_id', storeFilter);

      const commissionQuery = supabase.from('commission_entries').select('net_amount').gte('bill_date', commissionMonthStart).lte('bill_date', commissionMonthEnd);
      if (storeFilter) commissionQuery.eq('store_id', storeFilter);

      const logsQuery = supabase.from('audit_logs').select('id, action_type, table_name, record_id, new_value, created_at, changed_by').order('created_at', { ascending: false }).limit(8);
      if (storeFilter) logsQuery.eq('store_id', storeFilter);

      // -------- Per-store grouped queries (owner only) --------
      // Strategy: 1 query per metric returning store_id (or sums), grouped client-side.
      // Replaces the previous N+1 (14 queries × N stores).
      const ownerStoresQuery = isOwner
        ? supabase.from('stores').select('id, store_name, store_code, is_central').eq('active', true).order('store_name')
        : null;

      // Owner-only grouped metrics. We fetch only the columns needed for grouping.
      const grpPwQ = isOwner ? supabase.from('deposits').select('store_id').eq('status', 'pending_withdrawal') : null;
      const grpEdQ = isOwner ? supabase.from('deposits').select('store_id').eq('status', 'in_store').lt('expiry_date', sevenDaysFromNow).gt('expiry_date', todayISO) : null;
      const grpAdQ = isOwner ? supabase.from('deposits').select('store_id').eq('status', 'in_store') : null;
      const grpPeQ = isOwner ? supabase.from('comparisons').select('store_id').eq('status', 'pending') : null;
      const grpPaQ = isOwner ? supabase.from('comparisons').select('store_id').eq('status', 'explained') : null;
      const grpPtQ = isOwner ? supabase.from('transfers').select('from_store_id').eq('status', 'pending') : null;
      const grpPiQ = isOwner ? supabase.from('transfers').select('to_store_id').eq('status', 'pending') : null;
      const grpBtaQ = isOwner ? supabase.from('borrows').select('from_store_id').eq('status', 'pending_approval') : null;
      const grpBtrQ = isOwner ? supabase.from('borrows').select('from_store_id').eq('status', 'completed') : null;
      const grpLtaQ = isOwner ? supabase.from('borrows').select('to_store_id').eq('status', 'pending_approval') : null;
      const grpLtrQ = isOwner ? supabase.from('borrows').select('to_store_id').eq('status', 'completed') : null;
      const grpCmQ = isOwner ? supabase.from('commission_entries').select('store_id, net_amount').gte('bill_date', commissionMonthStart).lte('bill_date', commissionMonthEnd) : null;
      const grpDrQ = isOwner ? supabase.from('deposit_requests').select('store_id').eq('status', 'pending') : null;
      // For lastStockCheck per store: fetch (store_id, count_date) ordered DESC, take first per store.
      const grpLcQ = isOwner ? supabase.from('manual_counts').select('store_id, count_date').order('count_date', { ascending: false }).limit(2000) : null;

      // Month-scoped grouped metrics (for the per-store comparison chart).
      const monthStartISO = `${commissionMonthStart}T00:00:00+07:00`;
      const grpMoDepQ = isOwner ? supabase.from('deposits').select('store_id').gte('created_at', monthStartISO) : null;
      const grpMoWdQ = isOwner ? supabase.from('deposits').select('store_id').eq('status', 'withdrawn').gte('created_at', monthStartISO) : null;
      const grpMoScQ = isOwner ? supabase.from('manual_counts').select('store_id').gte('created_at', monthStartISO) : null;

      // Deposits awaiting bar confirmation — drives the "รอยืนยัน" badge.
      const grpPcQ = isOwner ? supabase.from('deposits').select('store_id').eq('status', 'pending_confirm') : null;

      // -------- Execute everything in parallel --------
      const [
        storesRes, depositsInStoreRes, pendingWithdrawalsRes, expiringRes,
        pendingExplRes, pendingApprRes, pendingTransfersRes, usersRes,
        productsRes, latestCountRes,
        curDepositsRes, curWithdrawalsRes, curStockChecksRes, curPenaltiesRes,
        prevDepositsRes, prevWithdrawalsRes, prevStockChecksRes, prevPenaltiesRes,
        commissionRes, logsRes,
        ownerStoresRes,
        grpPwRes, grpEdRes, grpAdRes, grpPeRes, grpPaRes, grpPtRes, grpPiRes,
        grpBtaRes, grpBtrRes, grpLtaRes, grpLtrRes, grpCmRes, grpDrRes, grpLcRes,
        grpMoDepRes, grpMoWdRes, grpMoScRes, grpPcRes,
      ] = await Promise.all([
        storesQuery, depositsInStoreQuery, pendingWithdrawalsQuery, expiringQuery,
        pendingExplQuery, pendingApprQuery, pendingTransfersQuery, usersQuery,
        productsQuery, latestCountQuery,
        curDepositsQ, curWithdrawalsQ, curStockChecksQ, curPenaltiesQ,
        prevDepositsQ, prevWithdrawalsQ, prevStockChecksQ, prevPenaltiesQ,
        commissionQuery, logsQuery,
        ownerStoresQuery,
        grpPwQ, grpEdQ, grpAdQ, grpPeQ, grpPaQ, grpPtQ, grpPiQ,
        grpBtaQ, grpBtrQ, grpLtaQ, grpLtrQ, grpCmQ, grpDrQ, grpLcQ,
        grpMoDepQ, grpMoWdQ, grpMoScQ, grpPcQ,
      ]);

      const depositsTrend = calcTrend(curDepositsRes.count || 0, prevDepositsRes.count || 0);
      const withdrawalsTrend = calcTrend(curWithdrawalsRes.count || 0, prevWithdrawalsRes.count || 0);
      const stockChecksTrend = calcTrend(curStockChecksRes.count || 0, prevStockChecksRes.count || 0);
      const penaltiesTrend = calcTrend(curPenaltiesRes.count || 0, prevPenaltiesRes.count || 0);

      const commissionRows = commissionRes.data || [];
      const commissionThisMonth = commissionRows.reduce((sum, r) => sum + (Number(r.net_amount) || 0), 0);
      const commissionEntries = commissionRows.length;

      setData({
        storeCount: storesRes.count || 0,
        totalDepositsInStore: depositsInStoreRes.count || 0,
        pendingWithdrawals: pendingWithdrawalsRes.count || 0,
        expiringDeposits: expiringRes.count || 0,
        pendingExplanations: pendingExplRes.count || 0,
        pendingApprovals: pendingApprRes.count || 0,
        pendingTransfers: pendingTransfersRes.count || 0,
        totalUsers: usersRes.count || 0,
        totalProducts: productsRes.count || 0,
        lastCheckDate: latestCountRes.data?.count_date || null,
        depositsTrend,
        withdrawalsTrend,
        stockChecksTrend,
        penaltiesTrend,
        commissionThisMonth,
        commissionEntries,
      });

      // --- Recent audit logs (latest 8) ---
      const logs = logsRes.data;
      if (logs && logs.length > 0) {
        const userIds = [...new Set(logs.map((l) => l.changed_by).filter(Boolean))] as string[];
        let nameMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, username')
            .in('id', userIds);
          if (profiles) {
            nameMap = Object.fromEntries(
              profiles.map((p) => [p.id, p.display_name || p.username])
            );
          }
        }

        setActivities(
          logs.map((l) => ({
            id: l.id,
            action_type: l.action_type,
            table_name: l.table_name,
            record_id: l.record_id || null,
            new_value: (l.new_value as Record<string, unknown>) || null,
            created_at: l.created_at,
            changed_by_name: l.changed_by ? nameMap[l.changed_by] || null : null,
          }))
        );
      } else {
        setActivities([]);
      }

      // --- Per-store statuses (owner only) ---
      if (isOwner && ownerStoresRes) {
        if (ownerStoresRes.error) {
          console.error('Error fetching stores:', ownerStoresRes.error);
        } else if (ownerStoresRes.data && ownerStoresRes.data.length > 0) {
          // Build count maps from grouped query results
          const countBy = (rows: Array<Record<string, unknown>> | null | undefined, col: string): Map<string, number> => {
            const m = new Map<string, number>();
            if (!rows) return m;
            for (const r of rows) {
              const k = r[col] as string | null;
              if (!k) continue;
              m.set(k, (m.get(k) || 0) + 1);
            }
            return m;
          };

          const pwMap = countBy(grpPwRes?.data, 'store_id');
          const edMap = countBy(grpEdRes?.data, 'store_id');
          const adMap = countBy(grpAdRes?.data, 'store_id');
          const peMap = countBy(grpPeRes?.data, 'store_id');
          const paMap = countBy(grpPaRes?.data, 'store_id');
          const ptMap = countBy(grpPtRes?.data, 'from_store_id');
          const piMap = countBy(grpPiRes?.data, 'to_store_id');
          const btaMap = countBy(grpBtaRes?.data, 'from_store_id');
          const btrMap = countBy(grpBtrRes?.data, 'from_store_id');
          const ltaMap = countBy(grpLtaRes?.data, 'to_store_id');
          const ltrMap = countBy(grpLtrRes?.data, 'to_store_id');
          const drMap = countBy(grpDrRes?.data, 'store_id');
          const moDepMap = countBy(grpMoDepRes?.data, 'store_id');
          const moWdMap = countBy(grpMoWdRes?.data, 'store_id');
          const moScMap = countBy(grpMoScRes?.data, 'store_id');
          const pcMap = countBy(grpPcRes?.data, 'store_id');

          // Commission: sum net_amount + count entries per store
          const commTotalMap = new Map<string, number>();
          const commCountMap = new Map<string, number>();
          for (const r of grpCmRes?.data || []) {
            const sid = r.store_id as string | null;
            if (!sid) continue;
            commTotalMap.set(sid, (commTotalMap.get(sid) || 0) + (Number(r.net_amount) || 0));
            commCountMap.set(sid, (commCountMap.get(sid) || 0) + 1);
          }

          // Last stock check per store: take the first occurrence per store_id
          // (rows are ordered by count_date DESC).
          const lastCheckMap = new Map<string, string>();
          for (const r of grpLcRes?.data || []) {
            const sid = r.store_id as string | null;
            if (!sid || lastCheckMap.has(sid)) continue;
            if (r.count_date) lastCheckMap.set(sid, r.count_date as string);
          }

          const storeResults: StoreStatus[] = ownerStoresRes.data.map((store) => {
            const sid = store.id;
            const isCentral = store.is_central === true;

            if (isCentral) {
              const pendingIncoming = piMap.get(sid) || 0;
              return {
                id: store.id,
                name: store.store_name,
                code: store.store_code || '',
                isCentral: true,
                pendingDeposits: 0,
                pendingWithdrawals: 0,
                expiringDeposits: 0,
                activeDeposits: 0,
                pendingExplanations: 0,
                pendingApprovals: 0,
                pendingTransfers: 0,
                pendingIncomingTransfers: pendingIncoming,
                lastStockCheck: null,
                totalIssues: pendingIncoming,
                borrowsToApprove: 0,
                borrowsToReturn: 0,
                lendsToApprove: 0,
                lendsToReceive: 0,
                commissionThisMonth: 0,
                commissionEntries: 0,
                depositsThisMonth: 0,
                withdrawalsThisMonth: 0,
                stockChecksThisMonth: moScMap.get(sid) || 0,
                pendingConfirm: 0,
              };
            }

            const pendingDeposits = drMap.get(sid) || 0;
            const pendingWithdrawals = pwMap.get(sid) || 0;
            const expiringDeposits = edMap.get(sid) || 0;
            const activeDeposits = adMap.get(sid) || 0;
            const pendingExpl = peMap.get(sid) || 0;
            const pendingAppr = paMap.get(sid) || 0;
            const pendingTrans = ptMap.get(sid) || 0;
            const pendingIncoming = piMap.get(sid) || 0;
            const borrowsToApprove = btaMap.get(sid) || 0;
            const borrowsToReturn = btrMap.get(sid) || 0;
            const lendsToApprove = ltaMap.get(sid) || 0;
            const lendsToReceive = ltrMap.get(sid) || 0;
            const storeCommTotal = commTotalMap.get(sid) || 0;
            const storeCommEntries = commCountMap.get(sid) || 0;

            const totalIssues =
              pendingDeposits + pendingWithdrawals + expiringDeposits +
              pendingExpl + pendingAppr + pendingTrans + pendingIncoming +
              borrowsToApprove + borrowsToReturn + lendsToApprove + lendsToReceive;

            return {
              id: store.id,
              name: store.store_name,
              code: store.store_code || '',
              isCentral: false,
              pendingDeposits,
              pendingWithdrawals,
              expiringDeposits,
              activeDeposits,
              pendingExplanations: pendingExpl,
              pendingApprovals: pendingAppr,
              pendingTransfers: pendingTrans,
              pendingIncomingTransfers: pendingIncoming,
              lastStockCheck: lastCheckMap.get(sid) || null,
              totalIssues,
              borrowsToApprove,
              borrowsToReturn,
              lendsToApprove,
              lendsToReceive,
              commissionThisMonth: Math.round(storeCommTotal * 100) / 100,
              commissionEntries: storeCommEntries,
              depositsThisMonth: moDepMap.get(sid) || 0,
              withdrawalsThisMonth: moWdMap.get(sid) || 0,
              stockChecksThisMonth: moScMap.get(sid) || 0,
              pendingConfirm: pcMap.get(sid) || 0,
            };
          });

          storeResults.sort((a, b) => b.totalIssues - a.totalIssues);
          setStoreStatuses(storeResults);
        }
      }
    } catch (error) {
      console.error('Error fetching overview data:', error);
      toast({
        type: 'error',
        title: t('errorTitle'),
        message: t('errorLoadData'),
      });
    } finally {
      setLoading(false);
    }
  }, [isOwner, currentStoreId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);



  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const today = formatThaiDate(new Date());

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('greeting', { name: user?.displayName || user?.username || t('defaultRole') })}<span className="hidden sm:inline"> &mdash; {today}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('refresh')}
        </button>
      </div>



      {/* ---- Per-Store Status (Owner only) ---- */}
      {/* ---- Per-store comparison chart (owner only) ---- */}
      {isOwner && storeStatuses.length > 0 && (
        <Card padding="none">
          <CardHeader
            title={t('compareHeading')}
            description={t('compareDesc')}
          />
          <div className="p-4 sm:p-5">
            {/* Small multiples: per-metric ranking with horizontal bars */}
            <div className="grid grid-cols-1 divide-y divide-gray-100 dark:divide-gray-700 sm:grid-cols-2 sm:gap-5 sm:divide-y-0 lg:grid-cols-3">
              {COMPARISON_METRICS.map((m) => {
                const ranked = [...storeStatuses]
                  .map((s) => ({
                    storeId: s.id,
                    storeName: s.name,
                    value: Number(s[m.key] ?? 0),
                  }))
                  .sort((a, b) => b.value - a.value);
                const max = Math.max(...ranked.map((r) => r.value), 1);
                return (
                  <div key={String(m.key)} className="py-4 first:pt-0 last:pb-0 sm:py-0">
                    <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {t(m.labelKey)}
                    </h4>
                    <div className="space-y-1.5">
                      {ranked.map((r, idx) => {
                        const pct = max > 0 ? (r.value / max) * 100 : 0;
                        const palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4'];
                        const color = palette[idx % palette.length];
                        return (
                          <div key={r.storeId} className="flex items-center gap-2 text-xs">
                            <span className="w-20 shrink-0 truncate text-gray-700 dark:text-gray-300" title={r.storeName}>
                              {r.storeName}
                            </span>
                            <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                              <div
                                className="h-full rounded"
                                style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                              />
                            </div>
                            <span className="w-16 shrink-0 text-right font-medium tabular-nums text-gray-900 dark:text-white">
                              {m.format(r.value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Heatmap: all metrics × all stores */}
            <div className="mt-6 border-t border-gray-100 pt-5 dark:border-gray-700">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                <BarChart2 className="h-4 w-4" />
                {t('compareHeatmapTitle')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-gray-500 dark:text-gray-400">
                      <th className="py-2 pr-3 text-left font-medium">{t('compareColBranch')}</th>
                      {COMPARISON_METRICS.map((m) => (
                        <th key={String(m.key)} className="px-2 py-2 text-center font-medium">
                          {t(m.labelKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {storeStatuses.map((s) => (
                      <tr key={s.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">{s.name}</td>
                        {COMPARISON_METRICS.map((m) => {
                          const v = Number(s[m.key] ?? 0);
                          const allVals = storeStatuses.map((x) => Number(x[m.key] ?? 0));
                          const max = Math.max(...allVals, 1);
                          const pct = max > 0 ? v / max : 0;
                          const bg = `rgba(99, 102, 241, ${pct * 0.85})`;
                          const textColor = pct > 0.55 ? '#ffffff' : undefined;
                          return (
                            <td key={String(m.key)} className="px-1 py-1 text-center tabular-nums">
                              <div
                                className="rounded px-2 py-1.5 text-xs font-medium"
                                style={{ backgroundColor: bg, color: textColor }}
                              >
                                {m.format(v)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isOwner && storeStatuses.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('storeStatus.heading')}
            </h2>
            <button
              type="button"
              onClick={toggleAllStores}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
            >
              {allExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  {t('storeStatus.collapseAll')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  {t('storeStatus.expandAll')}
                </>
              )}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {storeStatuses.map((store) => {
              // Amber tint + badge reflect deposits awaiting bar confirmation —
              // the one state that actually requires someone to act right now.
              const hasIssues = store.pendingConfirm > 0;
              const isExpanded = expandedStores.has(store.id);

              return (
                <div
                  key={store.id}
                  className={cn(
                    'rounded-xl bg-white shadow-sm ring-1 dark:bg-gray-800',
                    hasIssues
                      ? 'ring-amber-200 dark:ring-amber-800'
                      : 'ring-gray-200 dark:ring-gray-700'
                  )}
                >
                  {/* Store header — click anywhere to expand/collapse */}
                  <button
                    type="button"
                    onClick={() => toggleStore(store.id)}
                    aria-expanded={isExpanded}
                    className={cn(
                      'flex w-full items-center justify-between px-4 py-3 border-b text-left transition-colors',
                      isExpanded ? 'rounded-t-xl' : 'rounded-xl border-b-transparent',
                      hasIssues
                        ? 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20 border-amber-100 dark:border-amber-900/50'
                        : 'bg-gray-50/50 hover:bg-gray-50 dark:bg-gray-800/50 dark:hover:bg-gray-800 border-gray-100 dark:border-gray-700/50'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        store.isCentral
                          ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                          : hasIssues
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      )}>
                        {store.isCentral ? (
                          <Warehouse className="h-5 w-5" />
                        ) : (
                          <Store className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">
                          {store.name}
                        </h3>
                        {store.code && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {store.code}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasIssues ? (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <CircleDot className="h-3 w-3" />
                          {t('storeStatus.pendingItems', { count: store.pendingConfirm })}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {t('storeStatus.normal')}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Store body — only rendered when expanded */}
                  {isExpanded && (store.isCentral ? (
                    <div className="p-4 grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-500">
                          <Warehouse className="h-3.5 w-3.5" />
                          {t('modules.transfer.name')}
                        </h4>
                        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/50 space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400">{t('storeStatus.hqDescription')}</span>
                          </div>
                          {store.pendingIncomingTransfers > 0 && (
                            <Link href="/hq-warehouse" className="flex justify-between items-center text-teal-600 hover:text-teal-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> {t('storeStatus.issues.pendingIncomingTransfers')}</span>
                              <span className="font-bold">{store.pendingIncomingTransfers}</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Stock Module */}
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-500">
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          {t('modules.stock.name')}
                        </h4>
                        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/50 space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400">{t('storeStatus.lastCount')}</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {store.lastStockCheck ? formatThaiDate(store.lastStockCheck) : <span className="text-gray-400">{t('storeStatus.neverCounted')}</span>}
                            </span>
                          </div>
                          {store.pendingExplanations > 0 && (
                            <Link href="/stock/comparison" className="flex justify-between items-center text-red-600 hover:text-red-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {t('storeStatus.issues.pendingExplanations')}</span>
                              <span className="font-bold">{store.pendingExplanations}</span>
                            </Link>
                          )}
                          {store.pendingApprovals > 0 && (
                            <Link href="/stock/approval" className="flex justify-between items-center text-amber-600 hover:text-amber-500 mt-1">
                              <span className="flex items-center gap-1"><FileCheck className="h-3 w-3" /> {t('storeStatus.issues.pendingApprovals')}</span>
                              <span className="font-bold">{store.pendingApprovals}</span>
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Deposit & Transfer Module */}
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-500">
                          <Wine className="h-3.5 w-3.5" />
                          {t('modules.deposit.name')} &amp; {t('modules.transfer.name')}
                        </h4>
                        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/50 space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                              <Wine className="h-3 w-3" /> {t('storeStatus.depositsInStore')}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">{store.activeDeposits}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className={cn(
                              'flex items-center gap-1',
                              store.expiringDeposits > 0
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-gray-500 dark:text-gray-400'
                            )}>
                              <CalendarClock className="h-3 w-3" /> {t('storeStatus.expired')}
                            </span>
                            <span className={cn(
                              'font-medium',
                              store.expiringDeposits > 0
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-gray-900 dark:text-white'
                            )}>
                              {store.expiringDeposits}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className={cn(
                              'flex items-center gap-1',
                              store.pendingTransfers > 0
                                ? 'text-cyan-600 dark:text-cyan-400'
                                : 'text-gray-500 dark:text-gray-400'
                            )}>
                              <ArrowRightLeft className="h-3 w-3" /> {t('storeStatus.pendingToHq')}
                            </span>
                            <span className={cn(
                              'font-medium',
                              store.pendingTransfers > 0
                                ? 'text-cyan-600 dark:text-cyan-400'
                                : 'text-gray-900 dark:text-white'
                            )}>
                              {store.pendingTransfers}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Borrow Module */}
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-500">
                          <Repeat className="h-3.5 w-3.5" />
                          {t('modules.borrow.name')}
                        </h4>
                        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/50 space-y-1.5 text-xs">
                          {/* ขอยืม - รอเขาอนุมัติ */}
                          {store.borrowsToApprove > 0 ? (
                            <Link href="/borrow" className="flex justify-between items-center text-amber-600 hover:text-amber-500">
                              <span className="flex items-center gap-1"><FileCheck className="h-3 w-3" /> ขอยืม (รออนุมัติ)</span>
                              <span className="font-bold">{store.borrowsToApprove}</span>
                            </Link>
                          ) : (
                            <div className="flex justify-between items-center text-gray-400 dark:text-gray-500">
                              <span className="flex items-center gap-1"><FileCheck className="h-3 w-3" /> ขอยืม (รออนุมัติ)</span>
                              <span>0</span>
                            </div>
                          )}
                          
                          {/* ขอยืม - ต้องส่งคืน */}
                          {store.borrowsToReturn > 0 ? (
                            <Link href="/borrow" className="flex justify-between items-center text-purple-600 hover:text-purple-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> รอส่งคืน (ยืมมา)</span>
                              <span className="font-bold">{store.borrowsToReturn}</span>
                            </Link>
                          ) : (
                            <div className="flex justify-between items-center text-gray-400 dark:text-gray-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> รอส่งคืน (ยืมมา)</span>
                              <span>0</span>
                            </div>
                          )}

                          {/* ให้ยืม - รอเราอนุมัติ */}
                          {store.lendsToApprove > 0 ? (
                            <Link href="/borrow?tab=incoming" className="flex justify-between items-center text-amber-600 hover:text-amber-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><FileCheck className="h-3 w-3" /> ให้ยืม (รออนุมัติ)</span>
                              <span className="font-bold">{store.lendsToApprove}</span>
                            </Link>
                          ) : (
                            <div className="flex justify-between items-center text-gray-400 dark:text-gray-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><FileCheck className="h-3 w-3" /> ให้ยืม (รออนุมัติ)</span>
                              <span>0</span>
                            </div>
                          )}

                          {/* ให้ยืม - รอรับคืน */}
                          {store.lendsToReceive > 0 ? (
                            <Link href="/borrow?tab=incoming" className="flex justify-between items-center text-teal-600 hover:text-teal-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> รอรับคืน (ให้ยืม)</span>
                              <span className="font-bold">{store.lendsToReceive}</span>
                            </Link>
                          ) : (
                            <div className="flex justify-between items-center text-gray-400 dark:text-gray-500 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                              <span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> รอรับคืน (ให้ยืม)</span>
                              <span>0</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Commission Module */}
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-rose-500">
                          <HandCoins className="h-3.5 w-3.5" />
                          {t('modules.commission.name')}
                        </h4>
                        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/50 space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400">{t('storeStatus.commissionThisMonth')}</span>
                            <span className="font-medium text-gray-900 dark:text-white">{formatNumber(store.commissionThisMonth, 2)} {t('storeStatus.baht')}</span>
                          </div>
                          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                            <span>{t('storeStatus.entries', { count: store.commissionEntries })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Recent Activity ---- */}
      <Card padding="none">
        <CardHeader
          title={t('activity.heading')}
          action={
            activities.length > 0 ? (
              <button
                type="button"
                onClick={fetchData}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                {t('refresh')}
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
              <Inbox className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('activity.noActivityTitle')}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
              {t('activity.noActivityDescription')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {activities.map((activity) => {
              const mapped = mapActivity(activity.action_type, activity.table_name, t);
              const ActivityIcon = mapped.icon;
              const detail = getActivityDetail(activity);
              const href = getActivityHref(activity.action_type, activity.table_name);

              const content = (
                <>
                  <div className={cn('mt-0.5 shrink-0', mapped.colorClass)}>
                    <ActivityIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {mapped.label}
                      {detail && (
                        <span className="ml-1 font-medium text-gray-600 dark:text-gray-400">
                          {detail}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {activity.changed_by_name && (
                        <span className="mr-1.5">{activity.changed_by_name}</span>
                      )}
                      {relativeTime(activity.created_at, t)}
                    </p>
                  </div>
                  {href && (
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                  )}
                </>
              );

              if (href) {
                return (
                  <Link
                    key={activity.id}
                    href={href}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-750"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 px-5 py-3.5"
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
