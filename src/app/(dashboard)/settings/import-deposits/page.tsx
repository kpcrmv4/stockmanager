'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils/cn';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Select,
  Badge,
  toast,
} from '@/components/ui';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowLeft,
  Database,
  Wine,
  Trash2,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  store_name: string;
  store_code: string;
}

interface ParsedDeposit {
  deposit_code: string;
  line_user_id: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  category: string;
  quantity: number;
  remaining_percent: number;
  remaining_qty: number;
  table_number: string;
  deposit_date: string;
  expiry_date: string;
  is_vip: string;
  status: string;
  photo_url: string;
  batch_id: string;
  customer_photo_url: string;
  received_photo_url: string;
  confirm_photo_url: string;
  received_by: string;
  confirmed_by: string;
  notes: string;
  // classification
  _valid: boolean;
  _issue?: string;
}

type ImportTable = 'deposits' | 'deposit_requests' | 'withdrawals';

const TABLE_OPTIONS = [
  { value: 'deposits', label: 'Deposits (รายการฝาก)' },
  { value: 'deposit_requests', label: 'Deposit Requests (คำขอฝาก)' },
  { value: 'withdrawals', label: 'Withdrawals (ประวัติเบิก)' },
];

// Sheet column → Supabase column mapping for deposits
const DEPOSIT_COLUMN_MAP: Record<string, string> = {
  deposit_code: 'deposit_code',
  line_user_id: 'line_user_id',
  customer_name: 'customer_name',
  customer_phone: 'customer_phone',
  product_name: 'product_name',
  item_name: 'product_name', // legacy name
  category: 'category',
  quantity: 'quantity',
  remaining_percent: 'remaining_percent',
  remaining_qty: 'remaining_qty',
  table_number: 'table_number',
  deposit_date: 'created_at',
  expiry_date: 'expiry_date',
  status: 'status',
  photo_url: 'photo_url',
  customer_photo_url: 'customer_photo_url',
  received_photo_url: 'received_photo_url',
  confirm_photo_url: 'confirm_photo_url',
  notes: 'notes',
};

// Valid deposit statuses in the new system
const VALID_STATUSES = [
  'pending_confirm',
  'in_store',
  'pending_withdrawal',
  'withdrawn',
  'expired',
  'transferred_out',
];

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect separator: comma or tab
  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t' : ',';

  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const rows = lines.slice(1).map((line) =>
    line.split(sep).map((cell) => cell.trim().replace(/^["']|["']$/g, ''))
  );

  return { headers, rows };
}

function formatDateForSupabase(dateStr: string): string | null {
  if (!dateStr) return null;
  // Handle various date formats
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Try DD/MM/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return null;
  }
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ImportDepositsPage() {
  const { user } = useAuthStore();

  // Step management
  const [step, setStep] = useState<'config' | 'preview' | 'result'>('config');

  // Config
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [importTable, setImportTable] = useState<ImportTable>('deposits');

  // File
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedDeposit[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // Import
  const [saving, setSaving] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Fetch stores
  useEffect(() => {
    const fetchStores = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('stores')
        .select('id, store_name, store_code')
        .eq('active', true)
        .order('store_name');
      if (data) setStores(data);
    };
    fetchStores();
  }, []);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  // ── Parse file ──
  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt') && !file.name.endsWith('.tsv')) {
        toast({ type: 'error', title: 'รองรับเฉพาะไฟล์ .csv, .txt, .tsv' });
        return;
      }
      setParsing(true);
      setFileName(file.name);

      try {
        const text = await file.text();
        const { headers, rows } = parseCSV(text);

        if (headers.length === 0 || rows.length === 0) {
          toast({ type: 'error', title: 'ไฟล์ว่างเปล่าหรือไม่มีข้อมูล' });
          setParsing(false);
          return;
        }

        setCsvHeaders(headers);
        const warnings: string[] = [];

        // Check for required columns
        const hasProductName =
          headers.includes('product_name') || headers.includes('item_name');
        const hasCustomerName = headers.includes('customer_name');
        const hasStatus = headers.includes('status');

        if (!hasProductName) warnings.push('ไม่พบคอลัมน์ product_name');
        if (!hasCustomerName) warnings.push('ไม่พบคอลัมน์ customer_name');
        if (!hasStatus) warnings.push('ไม่พบคอลัมน์ status');

        const getCol = (row: string[], colName: string): string => {
          const idx = headers.indexOf(colName);
          return idx >= 0 ? (row[idx] || '') : '';
        };

        const parsed: ParsedDeposit[] = rows
          .filter((row) => row.some((cell) => cell.trim()))
          .map((row) => {
            const productName =
              getCol(row, 'product_name') || getCol(row, 'item_name');
            const customerName = getCol(row, 'customer_name');
            const status = getCol(row, 'status').toLowerCase().trim();
            const qty = Number(getCol(row, 'quantity')) || 0;
            const remainQty = Number(getCol(row, 'remaining_qty')) || qty;
            const remainPct = Number(getCol(row, 'remaining_percent')) || (qty > 0 ? Math.round((remainQty / qty) * 100) : 100);

            let _valid = true;
            let _issue: string | undefined;
            if (!productName) { _valid = false; _issue = 'ไม่มีชื่อสินค้า'; }
            else if (!customerName) { _valid = false; _issue = 'ไม่มีชื่อลูกค้า'; }
            else if (!VALID_STATUSES.includes(status) && status !== 'cancelled') {
              _issue = `สถานะ "${status}" ไม่รู้จัก`;
            }

            return {
              deposit_code: getCol(row, 'deposit_code'),
              line_user_id: getCol(row, 'line_user_id'),
              customer_name: customerName,
              customer_phone: getCol(row, 'customer_phone'),
              product_name: productName,
              category: getCol(row, 'category'),
              quantity: qty,
              remaining_percent: remainPct,
              remaining_qty: remainQty,
              table_number: getCol(row, 'table_number'),
              deposit_date: getCol(row, 'deposit_date'),
              expiry_date: getCol(row, 'expiry_date'),
              is_vip: getCol(row, 'is_vip'),
              status,
              photo_url: getCol(row, 'photo_url'),
              batch_id: getCol(row, 'batch_id'),
              customer_photo_url: getCol(row, 'customer_photo_url'),
              received_photo_url: getCol(row, 'received_photo_url'),
              confirm_photo_url: getCol(row, 'confirm_photo_url'),
              received_by: getCol(row, 'received_by'),
              confirmed_by: getCol(row, 'confirmed_by'),
              notes: getCol(row, 'notes'),
              _valid,
              _issue,
            };
          });

        const invalidCount = parsed.filter((r) => !r._valid).length;
        if (invalidCount > 0) {
          warnings.push(`${invalidCount} แถวมีข้อมูลไม่ครบ (จะข้าม)`);
        }

        const cancelledCount = parsed.filter((r) => r.status === 'cancelled').length;
        if (cancelledCount > 0) {
          warnings.push(`${cancelledCount} แถวมีสถานะ "cancelled" (จะข้าม)`);
        }

        setParsedRows(parsed);
        setParseWarnings(warnings);
        setStep('preview');
      } catch {
        toast({ type: 'error', title: 'ไม่สามารถอ่านไฟล์ได้' });
      } finally {
        setParsing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [importTable]
  );

  // ── File handlers ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };
  const handleDragLeave = () => setIsDragActive(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleReset = () => {
    setStep('config');
    setParsedRows([]);
    setCsvHeaders([]);
    setParseWarnings([]);
    setFileName('');
    setImportResult(null);
  };

  // ── Preview stats ──
  const stats = useMemo(() => {
    const valid = parsedRows.filter((r) => r._valid && r.status !== 'cancelled');
    const invalid = parsedRows.filter((r) => !r._valid);
    const skipped = parsedRows.filter((r) => r.status === 'cancelled');
    const inStore = valid.filter((r) => r.status === 'in_store').length;
    const pending = valid.filter((r) => r.status === 'pending_confirm').length;
    const expired = valid.filter((r) => r.status === 'expired').length;
    const withdrawn = valid.filter((r) => r.status === 'withdrawn').length;
    const other = valid.length - inStore - pending - expired - withdrawn;
    return { valid: valid.length, invalid: invalid.length, skipped: skipped.length, inStore, pending, expired, withdrawn, other };
  }, [parsedRows]);

  // ── Import ──
  const handleImport = async () => {
    if (!selectedStoreId || !user) return;

    setSaving(true);
    const supabase = createClient();
    let successCount = 0;
    let skippedCount = 0;
    const errorList: string[] = [];

    const validRows = parsedRows.filter(
      (r) => r._valid && r.status !== 'cancelled'
    );

    // Batch insert (50 at a time)
    const BATCH = 50;
    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH);

      const records = batch.map((row) => ({
        store_id: selectedStoreId,
        deposit_code: row.deposit_code || `IMPORT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        line_user_id: row.line_user_id || null,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone || null,
        product_name: row.product_name,
        category: row.category || null,
        quantity: row.quantity,
        remaining_qty: row.remaining_qty,
        remaining_percent: row.remaining_percent,
        table_number: row.table_number || null,
        status: VALID_STATUSES.includes(row.status) ? row.status : 'in_store',
        expiry_date: formatDateForSupabase(row.expiry_date),
        notes: row.notes || null,
        photo_url: row.photo_url || null,
        customer_photo_url: row.customer_photo_url || null,
        received_photo_url: row.received_photo_url || null,
        confirm_photo_url: row.confirm_photo_url || null,
        received_by: user.id,
      }));

      const { error } = await supabase.from('deposits').insert(records);

      if (error) {
        errorList.push(
          `แถว ${i + 1}-${i + batch.length}: ${error.message}`
        );
        skippedCount += batch.length;
      } else {
        successCount += batch.length;
      }
    }

    setImportResult({
      success: successCount,
      skipped: skippedCount + parsedRows.filter((r) => !r._valid || r.status === 'cancelled').length,
      errors: errorList,
    });
    setStep('result');
    setSaving(false);
  };

  // ── Status badge helper ──
  const statusBadge = (status: string) => {
    const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string }> = {
      in_store: { variant: 'success', label: 'ในร้าน' },
      pending_confirm: { variant: 'warning', label: 'รอยืนยัน' },
      pending_withdrawal: { variant: 'info', label: 'รอเบิก' },
      withdrawn: { variant: 'default', label: 'เบิกแล้ว' },
      expired: { variant: 'danger', label: 'หมดอายุ' },
      transferred_out: { variant: 'info', label: 'โอนคลัง' },
      cancelled: { variant: 'default', label: 'ยกเลิก' },
    };
    const cfg = map[status] || { variant: 'default' as const, label: status };
    return <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>;
  };

  // =====================================================================
  // RENDER
  // =====================================================================

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <a
          href="/settings"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับหน้าตั้งค่า
        </a>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/20">
            <Database className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              นำเข้าข้อมูลฝากเหล้า
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Import ข้อมูลจาก Google Sheet (CSV) เข้าสู่ระบบใหม่
            </p>
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/* Step: Config & Upload                                          */}
      {/* ============================================================= */}
      {step === 'config' && (
        <>
          {/* Store & Table selector */}
          <Card padding="none">
            <CardHeader
              title="ตั้งค่าการนำเข้า"
              description="เลือกร้านปลายทางและประเภทข้อมูล"
            />
            <CardContent>
              <div className="space-y-4">
                <Select
                  label="ร้านปลายทาง *"
                  options={stores.map((s) => ({
                    value: s.id,
                    label: `${s.store_name} (${s.store_code})`,
                  }))}
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  placeholder="เลือกร้าน"
                />
                <Select
                  label="ประเภทข้อมูล"
                  options={TABLE_OPTIONS}
                  value={importTable}
                  onChange={(e) => setImportTable(e.target.value as ImportTable)}
                />
                {selectedStore && (
                  <div className="rounded-lg bg-violet-50 p-3 text-sm dark:bg-violet-900/10">
                    <p className="font-medium text-violet-700 dark:text-violet-400">
                      ข้อมูลจะถูก import เข้าร้าน: {selectedStore.store_name}
                    </p>
                    <p className="mt-0.5 text-xs text-violet-600 dark:text-violet-500">
                      store_id เดิมในไฟล์จะถูกแทนที่ด้วย UUID: {selectedStoreId.slice(0, 8)}...
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => selectedStoreId ? fileInputRef.current?.click() : toast({ type: 'warning', title: 'กรุณาเลือกร้านก่อน' })}
            className={cn(
              'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              !selectedStoreId && 'opacity-50',
              isDragActive
                ? 'border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-900/20'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-gray-500'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-xl',
                  isDragActive
                    ? 'bg-violet-100 dark:bg-violet-900/30'
                    : 'bg-gray-100 dark:bg-gray-700'
                )}
              >
                {parsing ? (
                  <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
                ) : (
                  <Upload
                    className={cn(
                      'h-7 w-7',
                      isDragActive
                        ? 'text-violet-600 dark:text-violet-400'
                        : 'text-gray-400 dark:text-gray-500'
                    )}
                  />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDragActive
                    ? 'ปล่อยไฟล์เพื่ออัพโหลด'
                    : parsing
                      ? 'กำลังอ่านไฟล์...'
                      : 'ลากไฟล์ CSV มาวาง หรือ คลิกเพื่อเลือกไฟล์'}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  รองรับ .csv, .txt, .tsv — Export จาก Google Sheets ได้เลย
                </p>
              </div>
            </div>
          </div>

          {/* Format guide */}
          <Card>
            <CardHeader title="คอลัมน์ที่รองรับ (Deposits)" />
            <CardContent>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[
                  'deposit_code', 'customer_name', 'customer_phone', 'product_name',
                  'category', 'quantity', 'remaining_qty', 'remaining_percent',
                  'table_number', 'deposit_date', 'expiry_date', 'status',
                  'line_user_id', 'photo_url', 'notes',
                ].map((col) => (
                  <span
                    key={col}
                    className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                * store_id ในไฟล์จะถูกแทนที่ด้วย UUID ของร้านที่เลือก
                <br />
                * deposit_id เดิมจะไม่ถูกใช้ — ระบบจะสร้าง UUID ใหม่อัตโนมัติ
                <br />
                * สถานะ &quot;cancelled&quot; จะถูกข้าม
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ============================================================= */}
      {/* Step: Preview                                                   */}
      {/* ============================================================= */}
      {step === 'preview' && (
        <>
          {/* File info */}
          <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/30">
                <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {fileName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {parsedRows.length} แถว → ร้าน {selectedStore?.store_name}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={handleReset}
            >
              เปลี่ยนไฟล์
            </Button>
          </div>

          {/* Warnings */}
          {parseWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    ข้อสังเกต
                  </p>
                  {parseWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center dark:bg-emerald-900/20">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {stats.valid}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
                จะ Import
              </p>
            </div>
            <div className="rounded-xl bg-red-50 px-3 py-3 text-center dark:bg-red-900/20">
              <p className="text-lg font-bold text-red-700 dark:text-red-400">
                {stats.invalid + stats.skipped}
              </p>
              <p className="text-[10px] text-red-600 dark:text-red-500">
                ข้าม
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 px-3 py-3 text-center dark:bg-blue-900/20">
              <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                {stats.inStore}
              </p>
              <p className="text-[10px] text-blue-600 dark:text-blue-500">
                ในร้าน
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-3 text-center dark:bg-gray-800">
              <p className="text-lg font-bold text-gray-700 dark:text-gray-400">
                {stats.expired + stats.withdrawn}
              </p>
              <p className="text-[10px] text-gray-600 dark:text-gray-500">
                หมดอายุ/เบิก
              </p>
            </div>
          </div>

          {/* Detected columns */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            คอลัมน์ที่พบ: {csvHeaders.join(', ')}
          </div>

          {/* Preview Table — Desktop */}
          <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">รหัส</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">ลูกค้า</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">สินค้า</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">หมวด</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">จำนวน</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">เหลือ</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">สถานะ</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">หมดอายุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={cn(
                        'transition-colors',
                        !row._valid && 'bg-red-50/50 text-red-400 dark:bg-red-900/10 dark:text-red-500',
                        row.status === 'cancelled' && 'bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500',
                        row._valid && row.status !== 'cancelled' && 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      )}
                    >
                      <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.deposit_code || '-'}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.customer_name || '-'}</p>
                        {row.customer_phone && (
                          <p className="text-[10px] text-gray-400">{row.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{row.product_name || '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{row.category || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">{row.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        {row.remaining_qty}
                        <span className="ml-1 text-[10px] text-gray-400">({row.remaining_percent}%)</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row._issue && !row._valid ? (
                          <Badge variant="danger" size="sm">
                            <XCircle className="mr-1 h-3 w-3" />
                            {row._issue}
                          </Badge>
                        ) : (
                          statusBadge(row.status)
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {row.expiry_date || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Preview Cards — Mobile */}
          <div className="space-y-2 md:hidden">
            {parsedRows.map((row, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-xl p-3 shadow-sm ring-1',
                  !row._valid
                    ? 'bg-red-50/50 ring-red-200 dark:bg-red-900/10 dark:ring-red-800'
                    : row.status === 'cancelled'
                      ? 'bg-gray-50 ring-gray-200 dark:bg-gray-800/50 dark:ring-gray-700'
                      : 'bg-white ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {row.product_name || '-'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {row.customer_name} {row.deposit_code && `• ${row.deposit_code}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {row.remaining_qty}/{row.quantity}
                    </span>
                    {row._issue && !row._valid ? (
                      <Badge variant="danger" size="sm">{row._issue}</Badge>
                    ) : (
                      statusBadge(row.status)
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Action Bar */}
          <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-white">{stats.valid}</span>{' '}
                รายการที่จะ Import
                {stats.invalid + stats.skipped > 0 && (
                  <span className="ml-2 text-red-500">
                    ({stats.invalid + stats.skipped} ข้าม)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={handleReset}
                >
                  เริ่มใหม่
                </Button>
                <Button
                  size="sm"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  isLoading={saving}
                  onClick={handleImport}
                  disabled={stats.valid === 0}
                >
                  Import {stats.valid} รายการ
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================= */}
      {/* Step: Result                                                    */}
      {/* ============================================================= */}
      {step === 'result' && importResult && (
        <>
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                {importResult.errors.length === 0 ? (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Import สำเร็จ!
                      </h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        นำเข้า {importResult.success} รายการเข้าร้าน {selectedStore?.store_name}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        Import บางส่วนสำเร็จ
                      </h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        สำเร็จ {importResult.success} | ข้าม {importResult.skipped}
                      </p>
                    </div>
                  </>
                )}

                <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-50 p-3 text-center dark:bg-emerald-900/20">
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {importResult.success}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500">
                      สำเร็จ
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-800">
                    <p className="text-2xl font-bold text-gray-700 dark:text-gray-400">
                      {importResult.skipped}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-500">
                      ข้าม
                    </p>
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <div className="w-full max-w-sm rounded-lg border border-red-200 bg-red-50 p-3 text-left dark:border-red-800 dark:bg-red-900/20">
                    <p className="mb-1 text-xs font-medium text-red-700 dark:text-red-400">
                      ข้อผิดพลาด:
                    </p>
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">
                        {err}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={handleReset}>
                    Import เพิ่ม
                  </Button>
                  <Button
                    onClick={() => window.location.href = '/deposit'}
                    icon={<Wine className="h-4 w-4" />}
                  >
                    ไปหน้าฝากเหล้า
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
