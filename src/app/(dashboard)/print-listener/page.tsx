'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils/cn';
import { formatThaiDateTime, formatThaiDate, formatNumber } from '@/lib/utils/format';
import type { PrintJob, PrintPayload, ReceiptSettings } from '@/types/database';
import {
  Printer,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RotateCcw,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  pending: 'รอพิมพ์',
  printing: 'กำลังพิมพ์',
  completed: 'พิมพ์แล้ว',
  failed: 'ล้มเหลว',
};

const STATUS_VARIANTS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  printing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  receipt: 'ใบรับ',
  label: 'ป้ายขวด',
};

const DASHED_LINE = '--------------------------------';
const MAX_RECENT_JOBS = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrintListenerPage() {
  const supabase = useRef(createClient()).current;
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();

  const [connected, setConnected] = useState(false);
  const [storeName, setStoreName] = useState<string>('');
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);
  const [activePrintJob, setActivePrintJob] = useState<PrintJob | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [jobCounts, setJobCounts] = useState({ completed: 0, failed: 0, pending: 0 });

  const printAreaRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Fetch store info & receipt settings
  // -----------------------------------------------------------------------

  const fetchStoreInfo = useCallback(async () => {
    if (!currentStoreId) return;

    const [storeRes, settingsRes] = await Promise.all([
      supabase.from('stores').select('store_name').eq('id', currentStoreId).single(),
      supabase
        .from('store_settings')
        .select('receipt_settings')
        .eq('store_id', currentStoreId)
        .single(),
    ]);

    if (storeRes.data) {
      setStoreName(storeRes.data.store_name);
    }

    if (settingsRes.data?.receipt_settings) {
      setReceiptSettings(settingsRes.data.receipt_settings as unknown as ReceiptSettings);
    }
  }, [currentStoreId, supabase]);

  // -----------------------------------------------------------------------
  // Fetch recent jobs
  // -----------------------------------------------------------------------

  const fetchRecentJobs = useCallback(async () => {
    if (!currentStoreId) return;

    const { data } = await supabase
      .from('print_queue')
      .select('*')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })
      .limit(MAX_RECENT_JOBS);

    if (data) {
      const jobs = data as PrintJob[];
      setRecentJobs(jobs);
      setJobCounts({
        completed: jobs.filter((j) => j.status === 'completed').length,
        failed: jobs.filter((j) => j.status === 'failed').length,
        pending: jobs.filter((j) => j.status === 'pending').length,
      });
    }
  }, [currentStoreId, supabase]);

  // -----------------------------------------------------------------------
  // Update job status helper
  // -----------------------------------------------------------------------

  const updateJobStatus = useCallback(
    async (jobId: string, status: string, errorMessage?: string) => {
      const update: Record<string, unknown> = { status };
      if (status === 'completed' || status === 'failed') {
        update.printed_at = new Date().toISOString();
      }
      if (errorMessage) {
        update.error_message = errorMessage;
      }
      await supabase.from('print_queue').update(update).eq('id', jobId);
    },
    [supabase],
  );

  // -----------------------------------------------------------------------
  // Print execution
  // -----------------------------------------------------------------------

  const executePrint = useCallback(
    async (job: PrintJob) => {
      setIsPrinting(true);
      setActivePrintJob(job);

      // Mark as printing
      await updateJobStatus(job.id, 'printing');
      setRecentJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: 'printing' as const } : j)),
      );

      // Short delay to allow the print area to render
      await new Promise((r) => setTimeout(r, 300));

      try {
        window.print();

        // After print dialog closes, mark as completed
        await updateJobStatus(job.id, 'completed');
        setRecentJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, status: 'completed' as const, printed_at: new Date().toISOString() }
              : j,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ';
        await updateJobStatus(job.id, 'failed', message);
        setRecentJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: 'failed' as const, error_message: message } : j,
          ),
        );
      } finally {
        setIsPrinting(false);
        setActivePrintJob(null);
      }
    },
    [updateJobStatus],
  );

  // -----------------------------------------------------------------------
  // Handle new job from realtime
  // -----------------------------------------------------------------------

  const handleNewJob = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const job = payload.new as unknown as PrintJob;
      if (job.status !== 'pending') return;

      // Add to top of recent list
      setRecentJobs((prev) => [job, ...prev].slice(0, MAX_RECENT_JOBS));

      // Auto-print
      executePrint(job);
    },
    [executePrint],
  );

  // -----------------------------------------------------------------------
  // Reprint handler
  // -----------------------------------------------------------------------

  const handleReprint = useCallback(
    async (job: PrintJob) => {
      setReprintingId(job.id);
      await executePrint(job);
      setReprintingId(null);
    },
    [executePrint],
  );

  // -----------------------------------------------------------------------
  // Initialize: fetch data + subscribe
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!currentStoreId) return;

    fetchStoreInfo();
    fetchRecentJobs();

    const channel = supabase
      .channel('print-queue-listener')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'print_queue',
          filter: `store_id=eq.${currentStoreId}`,
        },
        handleNewJob,
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStoreId, supabase, fetchStoreInfo, fetchRecentJobs, handleNewJob]);

  // -----------------------------------------------------------------------
  // Guard: no store selected
  // -----------------------------------------------------------------------

  if (!currentStoreId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Printer className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            กรุณาเลือกสาขาก่อนเริ่มใช้งาน Print Listener
          </p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* ====== PRINT-ONLY STYLES ====== */}
      <style>{`
        #print-area {
          display: none;
        }

        @media print {
          /* Hide everything on screen */
          body * {
            visibility: hidden;
          }

          /* Show only the print area */
          #print-area,
          #print-area * {
            visibility: visible;
          }

          #print-area {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 302px;
            max-width: 302px;
            padding: 8px 4px;
            margin: 0;
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            line-height: 1.4;
            color: #000;
            background: #fff;
          }

          /* Label-specific overrides */
          #print-area.print-label {
            width: 70mm;
            max-width: 70mm;
            height: 40mm;
            padding: 2mm 3mm;
            border: 1px dashed #000;
            box-sizing: border-box;
            font-family: 'Sarabun', sans-serif;
            font-size: 9pt;
          }

          @page {
            margin: 0;
          }
        }
      `}</style>

      {/* ====== HIDDEN PRINT AREA ====== */}
      <div
        ref={printAreaRef}
        id="print-area"
        className={activePrintJob?.job_type === 'label' ? 'print-label' : undefined}
      >
        {activePrintJob && (
          <>
            {activePrintJob.job_type === 'receipt' ? (
              <ReceiptContent
                payload={activePrintJob.payload}
                settings={receiptSettings}
                storeName={storeName}
              />
            ) : (
              <LabelContent
                payload={activePrintJob.payload}
                storeName={storeName}
              />
            )}
          </>
        )}
      </div>

      {/* ====== SCREEN UI ====== */}
      <div className="space-y-4">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
              <Printer className="h-5 w-5" />
              Print Listener
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              ระบบรับงานพิมพ์อัตโนมัติ
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Setup Link */}
            <Link
              href="/print-listener/setup"
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <Settings className="h-4 w-4" />
              ตั้งค่า
            </Link>

          {/* Connection Status */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium',
              connected
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            )}
          >
            {connected ? (
              <>
                <Wifi className="h-4 w-4" />
                เชื่อมต่อแล้ว
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4" />
                ไม่ได้เชื่อมต่อ
              </>
            )}
          </div>
          </div>
        </div>

        {/* Info Cards Row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Store Name */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">สาขา</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {storeName || '-'}
            </p>
          </div>

          {/* Connection */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">สถานะ</p>
            <p
              className={cn(
                'mt-1 text-lg font-semibold',
                connected
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {connected ? 'กำลังรอรับงาน' : 'ขาดการเชื่อมต่อ'}
            </p>
          </div>

          {/* Completed Count */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">พิมพ์สำเร็จ</p>
            <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatNumber(jobCounts.completed)}
            </p>
          </div>

          {/* Failed Count */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">ล้มเหลว / รอพิมพ์</p>
            <p className="mt-1 text-lg font-semibold text-red-600 dark:text-red-400">
              {formatNumber(jobCounts.failed)}
              <span className="mx-1 text-gray-300 dark:text-gray-600">/</span>
              <span className="text-amber-600 dark:text-amber-400">
                {formatNumber(jobCounts.pending)}
              </span>
            </p>
          </div>
        </div>

        {/* Printing indicator */}
        {isPrinting && (
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              กำลังพิมพ์ {activePrintJob ? JOB_TYPE_LABELS[activePrintJob.job_type] : ''}...
            </span>
          </div>
        )}

        {/* Recent Jobs Section */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              งานพิมพ์ล่าสุด
            </h2>
            <button
              onClick={fetchRecentJobs}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              รีเฟรช
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Printer className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ยังไม่มีงานพิมพ์
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {recentJobs.map((job) => {
                const isReprinting = reprintingId === job.id;
                const canReprint = job.status === 'completed' || job.status === 'failed';

                return (
                  <div
                    key={job.id}
                    className={cn(
                      'flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4',
                      isReprinting && 'opacity-60',
                    )}
                  >
                    {/* Time */}
                    <div className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 sm:w-36">
                      <Clock className="h-3 w-3" />
                      {formatThaiDateTime(job.created_at)}
                    </div>

                    {/* Type badge */}
                    <span className="inline-flex w-fit shrink-0 items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {JOB_TYPE_LABELS[job.job_type] ?? job.job_type}
                    </span>

                    {/* Deposit code + customer */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {job.payload.deposit_code}
                        <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
                          {job.payload.customer_name}
                        </span>
                      </p>
                      <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                        {job.payload.product_name}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span
                      className={cn(
                        'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                        STATUS_VARIANTS[job.status] ?? STATUS_VARIANTS.pending,
                      )}
                    >
                      <StatusIcon status={job.status} />
                      {STATUS_LABELS[job.status] ?? job.status}
                    </span>

                    {/* Reprint button */}
                    {canReprint && (
                      <button
                        onClick={() => handleReprint(job)}
                        disabled={isPrinting || isReprinting}
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                          'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                      >
                        {isReprinting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        พิมพ์ซ้ำ
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Status icon helper
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-3 w-3" />;
    case 'failed':
      return <XCircle className="h-3 w-3" />;
    case 'printing':
      return <Loader2 className="h-3 w-3 animate-spin" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
}

// ---------------------------------------------------------------------------
// Inline receipt renderer (for print area)
// ---------------------------------------------------------------------------

function ReceiptContent({
  payload,
  settings,
  storeName,
}: {
  payload: PrintPayload;
  settings: ReceiptSettings | null;
  storeName: string;
}) {
  return (
    <div>
      {/* Store Name */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
        {storeName}
      </div>

      {/* Header text */}
      {settings?.header_text && (
        <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '4px' }}>
          {settings.header_text}
        </div>
      )}

      {/* Separator */}
      <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

      {/* Title */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', margin: '4px 0' }}>
        ใบรับฝากเหล้า
      </div>

      {/* Deposit Code */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '18px',
          margin: '4px 0',
          letterSpacing: '1px',
        }}
      >
        {payload.deposit_code}
      </div>

      {/* Separator */}
      <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

      {/* Customer info */}
      <div style={{ margin: '6px 0' }}>
        <ReceiptRow label="ชื่อลูกค้า:" value={payload.customer_name} bold />
        {payload.customer_phone && (
          <ReceiptRow label="เบอร์โทร:" value={payload.customer_phone} />
        )}
        {payload.table_number && (
          <ReceiptRow label="โต๊ะ:" value={payload.table_number} />
        )}
      </div>

      {/* Product info */}
      <div style={{ margin: '6px 0' }}>
        <ReceiptRow label="สินค้า:" value={payload.product_name} bold />
        {payload.category && <ReceiptRow label="หมวด:" value={payload.category} />}
        <ReceiptRow
          label="จำนวน:"
          value={`${formatNumber(payload.remaining_qty)} / ${formatNumber(payload.quantity)}`}
        />
      </div>

      {/* Dates */}
      <div style={{ margin: '6px 0' }}>
        <ReceiptRow label="วันที่ฝาก:" value={formatThaiDate(payload.created_at)} />
        {payload.expiry_date && (
          <ReceiptRow label="วันหมดอายุ:" value={formatThaiDate(payload.expiry_date)} />
        )}
      </div>

      {/* Received by */}
      {payload.received_by_name && (
        <div style={{ margin: '6px 0' }}>
          <ReceiptRow label="ผู้รับฝาก:" value={payload.received_by_name} />
        </div>
      )}

      {/* Separator */}
      <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>

      {/* QR Code + LINE Claim Instructions */}
      {settings?.show_qr && payload.qr_code_image_url && (
        <>
          <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={payload.qr_code_image_url}
              alt="LINE QR Code"
              style={{ width: '120px', height: '120px', margin: '0 auto' }}
            />
          </div>
          {payload.line_oa_id && (
            <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', margin: '2px 0' }}>
              LINE: {payload.line_oa_id}
            </div>
          )}
          <div style={{ textAlign: 'center', letterSpacing: '-1px', margin: '4px 0' }}>{DASHED_LINE}</div>
          <div style={{ fontSize: '11px', margin: '4px 0', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '2px' }}>
              ตรวจสอบข้อมูลเหล้าฝาก:
            </div>
            <div>1. สแกน QR Code เพิ่มเพื่อน</div>
            <div>2. พิมพ์รหัสฝากในแชท</div>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', margin: '2px 0' }}>
              &quot;{payload.deposit_code}&quot;
            </div>
          </div>
        </>
      )}

      {/* Footer text */}
      {settings?.footer_text && (
        <div style={{ textAlign: 'center', fontSize: '11px', margin: '4px 0' }}>
          {settings.footer_text}
        </div>
      )}

      {/* Thank you */}
      <div style={{ textAlign: 'center', margin: '6px 0 4px' }}>ขอบคุณที่ใช้บริการ</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline label renderer (for print area)
// ---------------------------------------------------------------------------

function LabelContent({
  payload,
  storeName,
}: {
  payload: PrintPayload;
  storeName: string;
}) {
  return (
    <div>
      {/* Store */}
      <div style={{ textAlign: 'center', fontSize: '7pt', lineHeight: 1.2, marginBottom: '1mm', color: '#333' }}>
        {storeName}
      </div>

      {/* Deposit Code */}
      <div
        style={{
          textAlign: 'center',
          fontSize: '16pt',
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '0.5px',
          marginBottom: '1.5mm',
        }}
      >
        {payload.deposit_code}
      </div>

      <hr style={{ border: 'none', borderTop: '0.5px solid #999', margin: '1mm 0' }} />

      {/* Customer */}
      <LabelRow label="ลูกค้า:" value={payload.customer_name} />

      {/* Product */}
      <LabelRow label="สินค้า:" value={payload.product_name} />

      {/* Expiry */}
      {payload.expiry_date && (
        <LabelRow label="หมดอายุ:" value={formatThaiDate(payload.expiry_date)} />
      )}

      {/* Deposit date */}
      <LabelRow label="วันที่ฝาก:" value={formatThaiDate(payload.created_at)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper sub-components
// ---------------------------------------------------------------------------

function ReceiptRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={bold ? { fontWeight: 'bold' } : undefined}>{value}</span>
    </div>
  );
}

function LabelRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: '7pt',
        lineHeight: 1.4,
      }}
    >
      <span style={{ color: '#555', flexShrink: 0, marginRight: '1mm' }}>{label}</span>
      <span
        style={{
          fontWeight: 500,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}
