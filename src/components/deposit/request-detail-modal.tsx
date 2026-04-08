'use client';

import React from 'react';
import Image from 'next/image';
import {
  User,
  Phone,
  MapPin,
  Wine,
  Hash,
  FileText,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils/cn';
import { formatThaiDateTime } from '@/lib/utils/format';
import { useTranslations } from 'next-intl';
import type { TableCardItem } from '@/components/deposit/table-card-grid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestDetailModalProps {
  item: TableCardItem | null;
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode; // Action form / buttons area
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ItemType = TableCardItem['type'];

const TYPE_GRADIENT: Record<ItemType, string> = {
  deposit_request: 'bg-gradient-to-r from-teal-500 to-emerald-500',
  deposit: 'bg-gradient-to-r from-orange-500 to-amber-500',
  withdrawal: 'bg-gradient-to-r from-red-500 to-pink-500',
};

const TYPE_LABEL_KEY: Record<ItemType, string> = {
  deposit_request: 'detailModal.depositRequest',
  deposit: 'detailModal.pendingConfirm',
  withdrawal: 'detailModal.withdrawalRequest',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium text-gray-900">
          {value}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RequestDetailModal({
  item,
  isOpen,
  onClose,
  children,
}: RequestDetailModalProps) {
  const t = useTranslations('deposit');

  if (!item) return null;

  const gradient = TYPE_GRADIENT[item.type] ?? TYPE_GRADIENT.deposit;
  const labelKey = TYPE_LABEL_KEY[item.type] ?? TYPE_LABEL_KEY.deposit;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="lg" showClose>
      {/* Scrollable content wrapper */}
      <div className="max-h-[85vh] overflow-y-auto">
        {/* ── Header with gradient ──────────────────────────────────── */}
        <div
          className={cn(
            'mx-[-1.5rem] mt-[-1.5rem] rounded-t-xl px-6 py-5 text-white',
            gradient,
          )}
        >
          <h2 className="text-lg font-bold">{t(labelKey)}</h2>
          {item.status && (
            <p className="mt-1 text-sm text-white/80">{item.status}</p>
          )}
        </div>

        {/* ── Photo section ─────────────────────────────────────────── */}
        {item.photoUrl && (
          <div className="mt-5 flex justify-center">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1">
              <div className="relative max-h-48 w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.photoUrl}
                  alt={t('detailModal.photoAlt')}
                  className="max-h-48 w-full rounded-lg object-contain"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Info rows ─────────────────────────────────────────────── */}
        <div className="mt-5 divide-y divide-gray-100">
          <InfoRow icon={User} label={t('detailModal.customerName')} value={item.customerName} />

          {item.customerPhone && (
            <InfoRow
              icon={Phone}
              label={t('detailModal.phone')}
              value={item.customerPhone}
            />
          )}

          {item.tableNumber && (
            <InfoRow icon={MapPin} label={t('detailModal.table')} value={item.tableNumber} />
          )}

          {item.productName && (
            <InfoRow icon={Wine} label={t('detailModal.product')} value={item.productName} />
          )}

          {item.quantity != null && (
            <InfoRow icon={Hash} label={t('detailModal.quantity')} value={item.quantity} />
          )}

          {item.depositCode && (
            <InfoRow
              icon={FileText}
              label={t('detailModal.depositCode')}
              value={item.depositCode}
            />
          )}

          {item.notes && (
            <InfoRow
              icon={MessageSquare}
              label={t('detailModal.notes')}
              value={item.notes}
            />
          )}

          {item.createdAt && (
            <InfoRow
              icon={Clock}
              label={t('detailModal.time')}
              value={formatThaiDateTime(item.createdAt)}
            />
          )}
        </div>

        {/* ── Children / action area ────────────────────────────────── */}
        {children && (
          <div className="mt-4 border-t border-gray-200 pt-4">{children}</div>
        )}
      </div>
    </Modal>
  );
}

export default RequestDetailModal;
