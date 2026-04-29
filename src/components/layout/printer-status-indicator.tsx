'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Printer,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils/cn';

interface PrinterStatus {
  is_online: boolean;
  last_heartbeat: string | null;
  printer_name: string | null;
  printer_status: string | null;
  hostname: string | null;
  jobs_printed_today: number;
  error_message: string | null;
}

type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed';
interface PrintJob {
  id: string;
  job_type: string;
  status: PrintJobStatus;
  payload: { deposit_code?: string; product_name?: string; customer_name?: string };
  printed_at: string | null;
  error_message: string | null;
  created_at: string;
}

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const ago = Date.now() - new Date(iso).getTime();
  if (ago < 0) return 'เพิ่งนี้';
  const sec = Math.floor(ago / 1000);
  if (sec < 60) return `${sec} วิ`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} นาที`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.`;
  return `${Math.floor(hr / 24)} วัน`;
}

function deriveStatus(hb: string | null) {
  if (!hb) return { color: 'bg-gray-400', label: 'ยังไม่เคยออนไลน์' };
  const ago = Date.now() - new Date(hb).getTime();
  if (ago < 120_000) return { color: 'bg-emerald-500', label: 'ออนไลน์' };
  if (ago < 600_000) return { color: 'bg-amber-500', label: 'ไม่อัปเดต' };
  return { color: 'bg-red-500', label: 'ออฟไลน์' };
}

export function PrinterStatusIndicator() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [hasPrinter, setHasPrinter] = useState(false);
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    if (!currentStoreId) return;
    const supabase = createClient();
    const [{ data: stat }, { data: settings }] = await Promise.all([
      supabase.from('print_server_status').select('*').eq('store_id', currentStoreId).maybeSingle(),
      supabase.from('store_settings').select('print_server_account_id').eq('store_id', currentStoreId).maybeSingle(),
    ]);
    setStatus((stat as PrinterStatus | null) || null);
    setHasPrinter(!!settings?.print_server_account_id);
  }, [currentStoreId]);

  const loadJobs = useCallback(async () => {
    if (!currentStoreId) return;
    setLoadingJobs(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('print_queue')
      .select('id, job_type, status, payload, printed_at, error_message, created_at')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })
      .limit(20);
    setJobs((data as unknown as PrintJob[]) || []);
    setLoadingJobs(false);
  }, [currentStoreId]);

  // Background refresh of status (indicator only) every 45s
  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 45_000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // Click-outside to close (desktop)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadJobs();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshStatus(), loadJobs()]);
    setRefreshing(false);
  };

  if (!user || user.role === 'customer') return null;
  if (!currentStoreId) return null;
  if (!hasPrinter) return null;

  const s = deriveStatus(status?.last_heartbeat || null);

  const panelBody = (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', s.color)} />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            พิมพ์: {s.label}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
          title="รีเฟรช"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-700/50">
        <div>
          <p className="text-gray-500 dark:text-gray-400">heartbeat</p>
          <p className="font-medium text-gray-900 dark:text-white">{relTime(status?.last_heartbeat || null)}{status?.last_heartbeat ? ' ที่แล้ว' : ''}</p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">เครื่องพิมพ์</p>
          <p className="font-medium text-gray-900 dark:text-white">{status?.printer_name || '—'}</p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">พิมพ์วันนี้</p>
          <p className="font-medium text-gray-900 dark:text-white">{status?.jobs_printed_today ?? 0} งาน</p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">PC</p>
          <p className="truncate font-medium text-gray-900 dark:text-white" title={status?.hostname || ''}>{status?.hostname || '—'}</p>
        </div>
      </div>

      {status?.error_message && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{status.error_message}</span>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          งานล่าสุด
        </p>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {loadingJobs ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">ยังไม่มีงานพิมพ์</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {jobs.map((j) => {
                const code = j.payload?.deposit_code || j.payload?.customer_name || '';
                const Icon =
                  j.status === 'completed' ? CheckCircle2 :
                  j.status === 'failed' ? XCircle :
                  j.status === 'printing' ? Loader2 : Clock;
                const iconClass =
                  j.status === 'completed' ? 'text-emerald-500' :
                  j.status === 'failed' ? 'text-red-500' :
                  j.status === 'printing' ? 'text-indigo-500 animate-spin' : 'text-amber-500';
                const time = j.printed_at || j.created_at;
                return (
                  <li key={j.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
                    <span className="flex-1 truncate font-mono text-gray-700 dark:text-gray-300" title={code}>{code || '—'}</span>
                    <span className="shrink-0 text-[10px] text-gray-400">{relTime(time)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Link
        href="/print-listener"
        onClick={() => setOpen(false)}
        className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        เปิดหน้าควบคุมเต็ม
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        title={`เครื่องพิมพ์: ${s.label}`}
      >
        <Printer className="h-5 w-5" />
        <span className={cn('absolute bottom-1 right-1 h-2 w-2 rounded-full ring-2 ring-white dark:ring-gray-900', s.color)} />
      </button>

      {/* Desktop dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 hidden w-80 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 sm:block">
          {panelBody}
        </div>
      )}

      {/* Mobile bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl dark:bg-gray-800">
            <div className="sticky top-0 flex items-center justify-center bg-inherit pt-2 pb-1">
              <span className="h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
            {panelBody}
          </div>
        </div>
      )}
    </div>
  );
}
