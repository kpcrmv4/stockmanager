'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils/format';
import { ArrowLeft, Package, Loader2, AlertCircle } from 'lucide-react';

interface DepositInfo {
  id: string;
  deposit_code: string;
  product_name: string;
  remaining_qty: number;
  store_id: string;
  store?: { store_name: string };
}

function WithdrawContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const depositId = searchParams.get('depositId');

  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestedQty, setRequestedQty] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (depositId) loadDeposit(depositId);
    else setIsLoading(false);
  }, [depositId]);

  const loadDeposit = async (id: string) => {
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('deposits')
      .select('id, deposit_code, product_name, remaining_qty, store_id, store:stores(store_name)')
      .eq('id', id)
      .eq('status', 'in_store')
      .single();

    if (data) setDeposit(data as unknown as DepositInfo);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deposit || !requestedQty) return;

    const qty = parseFloat(requestedQty);
    if (qty <= 0 || qty > deposit.remaining_qty) {
      setError(`จำนวนต้องอยู่ระหว่าง 1-${deposit.remaining_qty}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('กรุณาเข้าสู่ระบบ');
      setIsSubmitting(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('line_user_id, display_name, username')
      .eq('id', user.id)
      .single();

    const { error: insertError } = await supabase.from('withdrawals').insert({
      deposit_id: deposit.id,
      store_id: deposit.store_id,
      line_user_id: profile?.line_user_id,
      customer_name: profile?.display_name || profile?.username || 'ลูกค้า',
      product_name: deposit.product_name,
      requested_qty: qty,
      table_number: tableNumber || null,
      notes: notes || null,
      status: 'pending',
    });

    if (insertError) {
      setError('ไม่สามารถส่งคำขอเบิกได้ กรุณาลองใหม่');
    } else {
      await supabase
        .from('deposits')
        .update({ status: 'pending_withdrawal' })
        .eq('id', deposit.id);
      setSuccess(true);
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <Package className="h-8 w-8 text-[#06C755]" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">ส่งคำขอเบิกสำเร็จ</h2>
        <p className="text-sm text-gray-500">รอการอนุมัติจากทางร้าน</p>
        <button
          onClick={() => router.push('/customer')}
          className="mt-2 rounded-full bg-[#06C755] px-8 py-2.5 text-sm font-semibold text-white active:bg-[#05a849]"
        >
          กลับหน้าหลัก
        </button>
      </div>
    );
  }

  if (!deposit) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-gray-400">
        <Package className="h-12 w-12" />
        <p className="text-sm">ไม่พบข้อมูลการฝาก หรือรายการนี้ไม่สามารถเบิกได้</p>
        <button
          onClick={() => router.push('/customer')}
          className="rounded-full border border-gray-300 px-6 py-2 text-sm font-medium text-gray-600"
        >
          กลับหน้าหลัก
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับ
      </button>

      <h2 className="text-lg font-bold text-gray-900">ขอเบิกเหล้า</h2>
      <p className="mt-0.5 text-sm text-gray-500">{deposit.deposit_code}</p>

      {/* Deposit Info */}
      <div className="mt-4 rounded-2xl bg-green-50 p-4">
        <p className="font-semibold text-gray-900">{deposit.product_name}</p>
        <p className="mt-1 text-sm text-gray-600">
          คงเหลือ: {formatNumber(deposit.remaining_qty)} | {deposit.store?.store_name}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">จำนวนที่ต้องการเบิก</label>
          <input
            type="number"
            value={requestedQty}
            onChange={(e) => setRequestedQty(e.target.value)}
            placeholder="0"
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
          <p className="mt-1 text-xs text-gray-400">สูงสุด {formatNumber(deposit.remaining_qty)}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">หมายเลขโต๊ะ</label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="เช่น โต๊ะ 5"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">หมายเหตุ</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !requestedQty}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white disabled:opacity-60 active:bg-[#05a849]"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          {isSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอเบิก'}
        </button>
      </form>
    </div>
  );
}

export default function CustomerWithdrawPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
        </div>
      }
    >
      <WithdrawContent />
    </Suspense>
  );
}
