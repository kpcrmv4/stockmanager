'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { formatThaiDate } from '@/lib/utils/format';
import {
  CheckCircle,
  XCircle,
  Wine,
  Package,
  Clock,
  User,
  Loader2,
  Inbox,
} from 'lucide-react';

type TabType = 'deposit' | 'withdrawal';

interface PendingItem {
  id: string;
  type: TabType;
  productName: string;
  customerName: string;
  quantity: string;
  tableName?: string;
  requestedBy: string;
  requestedAt: string;
  note?: string;
}

// Placeholder data — replace with real API calls
const mockDepositItems: PendingItem[] = [
  {
    id: 'd1',
    type: 'deposit',
    productName: 'Johnnie Walker Black Label',
    customerName: 'คุณสมชาย',
    quantity: '1 ขวด (750ml)',
    tableName: 'โต๊ะ 12',
    requestedBy: 'พนักงาน: สมหญิง',
    requestedAt: '2025-02-18T20:30:00',
    note: 'เหลือประมาณ 60%',
  },
  {
    id: 'd2',
    type: 'deposit',
    productName: 'Chivas Regal 18',
    customerName: 'คุณวิชัย',
    quantity: '1 ขวด (750ml)',
    tableName: 'โต๊ะ 5',
    requestedBy: 'พนักงาน: อรุณ',
    requestedAt: '2025-02-18T21:15:00',
  },
  {
    id: 'd3',
    type: 'deposit',
    productName: 'Hennessy VSOP',
    customerName: 'คุณปรีชา',
    quantity: '1 ขวด (700ml)',
    tableName: 'โต๊ะ VIP 2',
    requestedBy: 'พนักงาน: ธนา',
    requestedAt: '2025-02-18T21:45:00',
    note: 'ขวดใหม่ ยังไม่เปิด',
  },
];

const mockWithdrawalItems: PendingItem[] = [
  {
    id: 'w1',
    type: 'withdrawal',
    productName: 'Absolut Vodka',
    customerName: 'คุณกิตติ',
    quantity: 'เบิกทั้งหมด',
    requestedBy: 'ลูกค้าขอเบิกผ่าน LINE',
    requestedAt: '2025-02-18T19:00:00',
    note: 'นัดรับวันนี้',
  },
  {
    id: 'w2',
    type: 'withdrawal',
    productName: 'Macallan 12',
    customerName: 'คุณธนา',
    quantity: '1 แก้ว',
    requestedBy: 'พนักงาน: สมหญิง',
    requestedAt: '2025-02-18T20:00:00',
  },
];

export default function BarApprovalPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('deposit');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const currentItems =
    activeTab === 'deposit' ? mockDepositItems : mockWithdrawalItems;

  const depositCount = mockDepositItems.length;
  const withdrawalCount = mockWithdrawalItems.length;

  const handleApprove = async (itemId: string) => {
    setProcessingId(itemId);
    // TODO: Call API to approve
    await new Promise((r) => setTimeout(r, 1000));
    setProcessingId(null);
  };

  const handleReject = async (itemId: string) => {
    setProcessingId(itemId);
    // TODO: Call API to reject
    await new Promise((r) => setTimeout(r, 1000));
    setProcessingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          รายการรออนุมัติ
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          ตรวจสอบและอนุมัติรายการฝาก-เบิกเหล้า
        </p>
      </div>

      {/* Summary Counts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-900/20">
          <div className="flex items-center gap-2">
            <Wine className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              ฝากรอยืนยัน
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">
            {depositCount}
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              เบิกรอยืนยัน
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">
            {withdrawalCount}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <button
          onClick={() => setActiveTab('deposit')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors',
            activeTab === 'deposit'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
              : 'text-gray-500 dark:text-gray-400'
          )}
        >
          <Wine className="h-4 w-4" />
          ฝากเหล้ารอยืนยัน
          {depositCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {depositCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('withdrawal')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors',
            activeTab === 'withdrawal'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
              : 'text-gray-500 dark:text-gray-400'
          )}
        >
          <Package className="h-4 w-4" />
          เบิกเหล้ารอยืนยัน
          {withdrawalCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {withdrawalCount}
            </span>
          )}
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {currentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <Inbox className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ไม่มีรายการรออนุมัติ
            </p>
          </div>
        ) : (
          currentItems.map((item) => {
            const isProcessing = processingId === item.id;
            return (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700',
                  isProcessing && 'opacity-60'
                )}
              >
                {/* Product Info */}
                <div className="mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {item.productName}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {item.customerName}
                    </span>
                    {item.tableName && (
                      <span className="flex items-center gap-1">
                        {item.tableName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatThaiDate(item.requestedAt)}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="mb-3 space-y-1 text-sm">
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="text-gray-400 dark:text-gray-500">จำนวน: </span>
                    {item.quantity}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="text-gray-400 dark:text-gray-500">ผู้ขอ: </span>
                    {item.requestedBy}
                  </p>
                  {item.note && (
                    <p className="text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400 dark:text-gray-500">หมายเหตุ: </span>
                      {item.note}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(item.id)}
                    disabled={isProcessing}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors',
                      'hover:bg-emerald-700 active:bg-emerald-800',
                      'disabled:cursor-not-allowed disabled:opacity-60'
                    )}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    disabled={isProcessing}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-semibold text-white transition-colors',
                      'hover:bg-red-700 active:bg-red-800',
                      'disabled:cursor-not-allowed disabled:opacity-60'
                    )}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
