'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useSessionRefresh } from '@/hooks/use-session-refresh';
import { useInstallPWA } from '@/hooks/use-install-pwa';
import { cn } from '@/lib/utils/cn';
import { formatThaiDateTime, formatThaiDate, formatNumber } from '@/lib/utils/format';
import type { PrintJob, PrintPayload, ReceiptSettings } from '@/types/database';
import {
  Printer,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RotateCcw,
  ChevronDown,
  Package,
  Download,
} from 'lucide-react';

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
const MAX_RECENT_JOBS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  store_name: string;
  store_code: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrintStationPage() {
  const supabase = useRef(createClient()).current;
  const { currentStoreId, setCurrentStoreId } = useAppStore();

  // Session refresh to keep alive
  useSessionRefresh();

  // PWA install
  const { canInstall, isInstalled, isInstalling, install: installPWA } = useInstallPWA();

  // State
  const [userId, setUserId] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeName, setStoreName] = useState('');
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
  const [connected, setConnected] = useState(false);
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);
  const [activePrintJob, setActivePrintJob] = useState<PrintJob | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [jobCounts, setJobCounts] = useState({ completed: 0, failed: 0, pending: 0 });
  const [showStoreSelector, setShowStoreSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const printAreaRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // -----------------------------------------------------------------------
  // Init: fetch user + stores
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Fetch user's stores
      const { data } = await supabase
        .from('user_stores')
        .select('store_id, stores(id, store_name, store_code)')
        .eq('user_id', user.id);

      if (data) {
        const list: StoreOption[] = data
          .map((row: Record<string, unknown>) => {
            const store = row.stores as unknown as StoreOption | null;
            return store ? { id: store.id, store_name: store.store_name, store_code: store.store_code } : null;
          })
          .filter(Boolean) as StoreOption[];

        // If owner/accountant/hq, fetch all stores
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile && ['owner', 'accountant', 'hq'].includes(profile.role)) {
          const { data: allStores } = await supabase
            .from('stores')
            .select('id, store_name, store_code')
            .eq('active', true)
            .order('store_name');
          if (allStores) {
            setStores(allStores);
            setIsLoading(false);
            return;
          }
        }

        setStores(list);
      }
      setIsLoading(false);
    }
    init();
  }, [supabase]);

  // -----------------------------------------------------------------------
  // Fetch store info + receipt settings when store changes
  // -----------------------------------------------------------------------

  const fetchStoreInfo = useCallback(async () => {
    if (!currentStoreId) return;

    const [storeRes, settingsRes] = await Promise.all([
      supabase.from('stores').select('store_name').eq('id', currentStoreId).single(),
      supabase.from('store_settings').select('receipt_settings').eq('store_id', currentStoreId).single(),
    ]);

    if (storeRes.data) setStoreName(storeRes.data.store_name);
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
  // Update job status
  // -----------------------------------------------------------------------

  const updateJobStatus = useCallback(
    async (jobId: string, status: string, errorMessage?: string) => {
      const update: Record<string, unknown> = { status };
      if (status === 'completed' || status === 'failed') {
        update.printed_at = new Date().toISOString();
      }
      if (errorMessage) update.error_message = errorMessage;
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

      await updateJobStatus(job.id, 'printing');
      setRecentJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: 'printing' as const } : j)),
      );

      await new Promise((r) => setTimeout(r, 300));

      try {
        window.print();
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
      setRecentJobs((prev) => [job, ...prev].slice(0, MAX_RECENT_JOBS));
      executePrint(job);
    },
    [executePrint],
  );

  // -----------------------------------------------------------------------
  // Subscribe to realtime when store changes
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!currentStoreId) return;

    fetchStoreInfo();
    fetchRecentJobs();

    // Cleanup previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`print-station-${currentStoreId}`)
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

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentStoreId, supabase, fetchStoreInfo, fetchRecentJobs, handleNewJob]);

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
  // Select store
  // -----------------------------------------------------------------------

  const handleSelectStore = (store: StoreOption) => {
    setCurrentStoreId(store.id);
    setStoreName(store.store_name);
    setShowStoreSelector(false);
    setRecentJobs([]);
    setJobCounts({ completed: 0, failed: 0, pending: 0 });
  };

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
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
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
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
          @page { margin: 0; }
        }
      `}</style>

      {/* ====== HIDDEN PRINT AREA ====== */}
      <div
        ref={printAreaRef}
        id="print-area"
        className={activePrintJob?.job_type === 'label' ? 'print-label' : undefined}
      >
        {activePrintJob && (
          activePrintJob.job_type === 'receipt' ? (
            <ReceiptContent payload={activePrintJob.payload} settings={receiptSettings} storeName={storeName} />
          ) : (
            <LabelContent payload={activePrintJob.payload} storeName={storeName} />
          )
        )}
      </div>

      {/* ====== SCREEN UI ====== */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* ---- Header ---- */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Print Station</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">สแตนบายรับงานพิมพ์อัตโนมัติ</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* PWA Install button */}
            {canInstall && (
              <button
                onClick={() => installPWA()}
                disabled={isInstalling}
                className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                {isInstalling ? 'กำลังติดตั้ง...' : 'ติดตั้งแอป'}
              </button>
            )}
            {isInstalled && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">แอปติดตั้งแล้ว</span>
              </span>
            )}

            {/* Connection status */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
                connected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : currentStoreId
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
              )}
            >
              {connected ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">เชื่อมต่อแล้ว</span>
                </>
              ) : currentStoreId ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">ไม่ได้เชื่อมต่อ</span>
                </>
              ) : (
                <>
                  <Clock className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">เลือกสาขา</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ---- Store Selector ---- */}
        <div className="relative mb-4">
          <button
            onClick={() => setShowStoreSelector(!showStoreSelector)}
            className="flex w-full items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:ring-gray-700 dark:hover:bg-gray-750"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                currentStoreId
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
              )}>
                <Printer className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {storeName || 'เลือกสาขา'}
                </p>
                {currentStoreId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {stores.find((s) => s.id === currentStoreId)?.store_code || ''}
                  </p>
                )}
              </div>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', showStoreSelector && 'rotate-180')} />
          </button>

          {showStoreSelector && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl bg-white shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  className={cn(
                    'flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    currentStoreId === store.id && 'bg-blue-50 dark:bg-blue-900/20',
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{store.store_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">รหัส: {store.store_code}</p>
                  </div>
                  {currentStoreId === store.id && (
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---- No store selected ---- */}
        {!currentStoreId && (
          <div className="flex flex-col items-center justify-center rounded-xl bg-white py-20 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <Printer className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              เลือกสาขาด้านบนเพื่อเริ่มรับงานพิมพ์
            </p>
          </div>
        )}

        {/* ---- Stats Row ---- */}
        {currentStoreId && (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">สำเร็จ</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatNumber(jobCounts.completed)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">ล้มเหลว</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {formatNumber(jobCounts.failed)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">รอพิมพ์</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {formatNumber(jobCounts.pending)}
              </p>
            </div>
          </div>
        )}

        {/* ---- Printing indicator ---- */}
        {isPrinting && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              กำลังพิมพ์ {activePrintJob ? JOB_TYPE_LABELS[activePrintJob.job_type] : ''}...
            </span>
          </div>
        )}

        {/* ---- Job List ---- */}
        {currentStoreId && (
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                งานพิมพ์ล่าสุด
              </h2>
            </div>

            {recentJobs.length === 0 ? (
              <div className="flex flex-col items-center py-16">
                <Printer className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  กำลังรองานพิมพ์...
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

                      {/* Info */}
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

                      {/* Status */}
                      <span
                        className={cn(
                          'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          STATUS_VARIANTS[job.status] ?? STATUS_VARIANTS.pending,
                        )}
                      >
                        <StatusIcon status={job.status} />
                        {STATUS_LABELS[job.status] ?? job.status}
                      </span>

                      {/* Reprint */}
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
        )}

        {/* ---- Footer ---- */}
        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Print Station &middot; StockManager &middot; เปิดหน้านี้ค้างไว้เพื่อรับงานพิมพ์อัตโนมัติ
        </p>
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
// Receipt renderer (for print area)
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
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
        {storeName}
      </div>
      {settings?.header_text && (
        <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '4px' }}>
          {settings.header_text}
        </div>
      )}
      <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', margin: '4px 0' }}>
        ใบรับฝากเหล้า
      </div>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', margin: '4px 0', letterSpacing: '1px' }}>
        {payload.deposit_code}
      </div>
      <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>
      <div style={{ margin: '6px 0' }}>
        <ReceiptRow label="ชื่อลูกค้า:" value={payload.customer_name} bold />
        {payload.customer_phone && <ReceiptRow label="เบอร์โทร:" value={payload.customer_phone} />}
        {payload.table_number && <ReceiptRow label="โต๊ะ:" value={payload.table_number} />}
      </div>
      <div style={{ margin: '6px 0' }}>
        <ReceiptRow label="สินค้า:" value={payload.product_name} bold />
        {payload.category && <ReceiptRow label="หมวด:" value={payload.category} />}
        <ReceiptRow label="จำนวน:" value={`${formatNumber(payload.remaining_qty)} / ${formatNumber(payload.quantity)}`} />
      </div>
      <div style={{ margin: '6px 0' }}>
        <ReceiptRow label="วันที่ฝาก:" value={formatThaiDate(payload.created_at)} />
        {payload.expiry_date && <ReceiptRow label="วันหมดอายุ:" value={formatThaiDate(payload.expiry_date)} />}
      </div>
      {payload.received_by_name && (
        <div style={{ margin: '6px 0' }}>
          <ReceiptRow label="ผู้รับฝาก:" value={payload.received_by_name} />
        </div>
      )}
      <div style={{ textAlign: 'center', letterSpacing: '-1px' }}>{DASHED_LINE}</div>
      {settings?.show_qr && payload.qr_code_image_url && (
        <>
          <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={payload.qr_code_image_url} alt="LINE QR Code" style={{ width: '120px', height: '120px', margin: '0 auto' }} />
          </div>
          {payload.line_oa_id && (
            <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', margin: '2px 0' }}>
              LINE: {payload.line_oa_id}
            </div>
          )}
          <div style={{ textAlign: 'center', letterSpacing: '-1px', margin: '4px 0' }}>{DASHED_LINE}</div>
          <div style={{ fontSize: '11px', margin: '4px 0', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '2px' }}>ตรวจสอบข้อมูลเหล้าฝาก:</div>
            <div>1. สแกน QR Code เพิ่มเพื่อน</div>
            <div>2. พิมพ์รหัสฝากในแชท</div>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', margin: '2px 0' }}>
              &quot;{payload.deposit_code}&quot;
            </div>
          </div>
        </>
      )}
      {settings?.footer_text && (
        <div style={{ textAlign: 'center', fontSize: '11px', margin: '4px 0' }}>{settings.footer_text}</div>
      )}
      <div style={{ textAlign: 'center', margin: '6px 0 4px' }}>ขอบคุณที่ใช้บริการ</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label renderer (for print area)
// ---------------------------------------------------------------------------

function LabelContent({ payload, storeName }: { payload: PrintPayload; storeName: string }) {
  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: '7pt', lineHeight: 1.2, marginBottom: '1mm', color: '#333' }}>
        {storeName}
      </div>
      <div style={{ textAlign: 'center', fontSize: '16pt', fontWeight: 700, lineHeight: 1.1, letterSpacing: '0.5px', marginBottom: '1.5mm' }}>
        {payload.deposit_code}
      </div>
      <hr style={{ border: 'none', borderTop: '0.5px solid #999', margin: '1mm 0' }} />
      <LabelRow label="ลูกค้า:" value={payload.customer_name} />
      <LabelRow label="สินค้า:" value={payload.product_name} />
      {payload.expiry_date && <LabelRow label="หมดอายุ:" value={formatThaiDate(payload.expiry_date)} />}
      <LabelRow label="วันที่ฝาก:" value={formatThaiDate(payload.created_at)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

function ReceiptRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={bold ? { fontWeight: 'bold' } : undefined}>{value}</span>
    </div>
  );
}

function LabelRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '7pt', lineHeight: 1.4 }}>
      <span style={{ color: '#555', flexShrink: 0, marginRight: '1mm' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}
