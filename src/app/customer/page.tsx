'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCustomerAuth } from './_components/customer-provider';
import { cn } from '@/lib/utils/cn';
import { DEPOSIT_STATUS_LABELS } from '@/lib/utils/constants';
import { formatThaiDate, formatPercent, daysUntil } from '@/lib/utils/format';
import {
  Search,
  Wine,
  Clock,
  Package,
  Loader2,
  AlertCircle,
  QrCode,
} from 'lucide-react';

interface DepositItem {
  id: string;
  code: string;
  productName: string;
  remainingPercent: number;
  remainingQty: number;
  expiryDate: string | null;
  status: string;
  storeName: string;
  depositDate: string;
}

export default function CustomerPage() {
  const { lineUserId, displayName, mode, isLoading: authLoading, error: authError } = useCustomerAuth();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Auth credentials สำหรับเรียก API
  // ------------------------------------------------------------------

  const getAuthPayload = useCallback(() => {
    if (mode === 'token') {
      const token = searchParams.get('token');
      return { token };
    }
    // LIFF mode: ใช้ cached access token
    return { accessToken: sessionStorage.getItem('liff_access_token') };
  }, [mode, searchParams]);

  // ------------------------------------------------------------------
  // Load deposits (ทั้ง 2 mode ใช้ server API เหมือนกัน)
  // ------------------------------------------------------------------

  const loadDeposits = useCallback(async () => {
    if (!lineUserId) return;
    setIsLoading(true);

    try {
      const auth = getAuthPayload();
      let res: Response;

      if (auth.token) {
        // Token mode: GET with token param
        res = await fetch(`/api/customer/deposits?token=${encodeURIComponent(auth.token)}`);
      } else if (auth.accessToken) {
        // LIFF mode: POST with access token
        res = await fetch('/api/customer/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: auth.accessToken }),
        });
      } else {
        setError('ไม่สามารถโหลดข้อมูลได้');
        setIsLoading(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setDeposits(mapDeposits(data.deposits));
      } else {
        setError('ไม่สามารถโหลดข้อมูลได้');
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้');
    }

    setIsLoading(false);
  }, [lineUserId, getAuthPayload]);

  useEffect(() => {
    if (lineUserId) {
      loadDeposits();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [lineUserId, authLoading, loadDeposits]);

  // ------------------------------------------------------------------
  // Map raw deposit data to DepositItem
  // ------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mapDeposits(raw: any[]): DepositItem[] {
    return raw.map((d) => ({
      id: d.id,
      code: d.deposit_code,
      productName: d.product_name,
      remainingPercent: d.remaining_percent ?? 0,
      remainingQty: d.remaining_qty ?? 0,
      expiryDate: d.expiry_date,
      status: d.status,
      storeName: d.store?.store_name || '',
      depositDate: d.created_at,
    }));
  }

  // ------------------------------------------------------------------
  // Request withdrawal (ใช้ server API — ทั้ง token และ LIFF mode)
  // ------------------------------------------------------------------

  const handleRequestWithdrawal = async (deposit: DepositItem) => {
    setRequestingId(deposit.id);
    setError(null);

    try {
      const auth = getAuthPayload();
      const res = await fetch('/api/customer/withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositId: deposit.id,
          customerName: displayName || 'ลูกค้า',
          token: auth.token || undefined,
          accessToken: auth.accessToken || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }

      // อัพเดท UI
      setDeposits((prev) =>
        prev.map((d) =>
          d.id === deposit.id ? { ...d, status: 'pending_withdrawal' } : d,
        ),
      );
    } catch {
      setError('ไม่สามารถส่งคำขอเบิกได้ กรุณาลองใหม่');
    } finally {
      setRequestingId(null);
    }
  };

  // ------------------------------------------------------------------
  // UI Helpers
  // ------------------------------------------------------------------

  const filteredDeposits = deposits.filter(
    (d) =>
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.productName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getExpiryColor = (expiryDate: string | null) => {
    if (!expiryDate) return 'text-gray-500';
    const days = daysUntil(expiryDate);
    if (days <= 0) return 'text-red-600';
    if (days <= 7) return 'text-red-500';
    if (days <= 30) return 'text-amber-500';
    return 'text-gray-500';
  };

  const getExpiryText = (expiryDate: string | null) => {
    if (!expiryDate) return 'ไม่มีกำหนด';
    const days = daysUntil(expiryDate);
    if (days <= 0) return 'หมดอายุแล้ว';
    if (days === 1) return 'หมดอายุพรุ่งนี้';
    return `อีก ${days} วัน`;
  };

  const getRemainingBarColor = (percent: number) => {
    if (percent >= 60) return 'bg-[#06C755]';
    if (percent >= 30) return 'bg-amber-400';
    return 'bg-red-400';
  };

  // ------------------------------------------------------------------
  // Loading / Error states
  // ------------------------------------------------------------------

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
          <p className="text-sm text-gray-500">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-sm text-gray-600">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#06C755] px-6 py-2 text-sm font-medium text-white"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#EDEDED]">
      {/* Header — LINE green theme */}
      <div className="bg-[#06C755] px-4 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">
              {displayName ? `สวัสดี ${displayName}` : 'เหล้าฝากของฉัน'}
            </h1>
            <p className="text-sm text-white/80">
              {filteredDeposits.length} รายการที่ใช้งาน
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Wine className="h-5 w-5 text-white" />
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาด้วยรหัสฝากหรือชื่อเครื่องดื่ม"
            className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Deposit List */}
      <div className="space-y-3 px-4 py-4">
        {filteredDeposits.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-white py-16">
            <Wine className="mb-3 h-12 w-12 text-gray-300" />
            <p className="text-sm text-gray-500">
              {searchQuery
                ? 'ไม่พบรายการที่ค้นหา'
                : 'ยังไม่มีรายการฝากเหล้า'}
            </p>
          </div>
        ) : (
          filteredDeposits.map((deposit) => {
            const isRequesting = requestingId === deposit.id;
            const isPendingWithdrawal =
              deposit.status === 'pending_withdrawal';
            const isExpired = deposit.status === 'expired';
            const canWithdraw =
              deposit.status === 'in_store' && !isRequesting;

            return (
              <div
                key={deposit.id}
                className="overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                {/* Card Header */}
                <div className="border-b border-gray-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">
                      {deposit.productName}
                    </h3>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        deposit.status === 'in_store' &&
                          'bg-green-50 text-green-700',
                        deposit.status === 'pending_withdrawal' &&
                          'bg-amber-50 text-amber-700',
                        deposit.status === 'expired' &&
                          'bg-red-50 text-red-700',
                        deposit.status === 'pending_confirm' &&
                          'bg-gray-100 text-gray-600',
                      )}
                    >
                      {DEPOSIT_STATUS_LABELS[deposit.status] || deposit.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                    <QrCode className="h-3 w-3" />
                    {deposit.code}
                  </div>
                </div>

                {/* Card Body */}
                <div className="px-4 py-3">
                  {/* Remaining Progress */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">เหลือ</span>
                      <span className="font-semibold text-gray-900">
                        {formatPercent(deposit.remainingPercent)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          getRemainingBarColor(deposit.remainingPercent),
                        )}
                        style={{
                          width: `${deposit.remainingPercent}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-gray-400">
                        <Clock className="h-3.5 w-3.5" />
                        หมดอายุ
                      </span>
                      <span className={getExpiryColor(deposit.expiryDate)}>
                        {deposit.expiryDate
                          ? `${formatThaiDate(deposit.expiryDate)} (${getExpiryText(deposit.expiryDate)})`
                          : 'ไม่มีกำหนด'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">ร้าน</span>
                      <span className="text-gray-700">
                        {deposit.storeName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">วันที่ฝาก</span>
                      <span className="text-gray-700">
                        {formatThaiDate(deposit.depositDate)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer - Withdraw Button */}
                <div className="border-t border-gray-100 px-4 py-3">
                  {isPendingWithdrawal ? (
                    <div className="flex items-center justify-center gap-2 rounded-full bg-amber-50 py-2.5 text-sm font-medium text-amber-700">
                      <Clock className="h-4 w-4" />
                      กำลังรอเบิก
                    </div>
                  ) : isExpired ? (
                    <div className="flex items-center justify-center gap-2 rounded-full bg-red-50 py-2.5 text-sm font-medium text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      หมดอายุแล้ว
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRequestWithdrawal(deposit)}
                      disabled={!canWithdraw}
                      className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold transition-colors',
                        canWithdraw
                          ? 'bg-[#06C755] text-white active:bg-[#05a849]'
                          : 'bg-gray-100 text-gray-400',
                      )}
                    >
                      {isRequesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Package className="h-4 w-4" />
                      )}
                      {isRequesting ? 'กำลังส่งคำขอ...' : 'ขอเบิกเหล้า'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
