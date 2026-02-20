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
  is_central: boolean;
}

type ImportTable = 'deposits' | 'deposit_requests' | 'withdrawals' | 'transfers';

const TABLE_OPTIONS: { value: ImportTable; label: string }[] = [
  { value: 'deposits', label: '① Deposits (รายการฝาก) — import ก่อน' },
  { value: 'withdrawals', label: '② Withdrawals (ประวัติเบิก)' },
  { value: 'transfers', label: '③ Transfers (โอนคลังกลาง)' },
  { value: 'deposit_requests', label: 'Deposit Requests (คำขอฝาก)' },
];

interface ParsedRow {
  _valid: boolean;
  _issue?: string;
  _linked?: boolean;
  _depositUUID?: string;
  _depositProductName?: string;
  _depositCustomerName?: string;
  _depositQuantity?: number;
  _subRows?: ParsedRow[];
  raw: Record<string, string>;
}

// Valid statuses per table
const VALID_DEPOSIT_STATUSES = [
  'pending_confirm', 'in_store', 'pending_withdrawal',
  'withdrawn', 'expired', 'transferred_out',
];
const VALID_WITHDRAWAL_STATUSES = ['pending', 'approved', 'completed', 'rejected'];
const VALID_TRANSFER_STATUSES = ['pending', 'confirmed', 'rejected'];

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0]
    .split(sep)
    .map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const rows = lines.slice(1).map((line) =>
    line.split(sep).map((cell) => cell.trim().replace(/^["']|["']$/g, ''))
  );
  return { headers, rows };
}

function formatDateForSupabase(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const parsed = new Date(
        `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      );
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return null;
  }
  return d.toISOString();
}

function mapDepositStatus(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (VALID_DEPOSIT_STATUSES.includes(s)) return s;
  if (s === 'active' || s === 'ฝากอยู่') return 'in_store';
  if (s === 'pending' || s === 'รอยืนยัน') return 'pending_confirm';
  return 'in_store';
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ImportDepositsPage() {
  const { user } = useAuthStore();

  // Step
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
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);

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
        .select('id, store_name, store_code, is_central')
        .eq('active', true)
        .order('store_name');
      if (data) setStores(data);
    };
    fetchStores();
  }, []);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const centralStore = stores.find((s) => s.is_central);
  const needsResolution =
    importTable === 'withdrawals' || importTable === 'transfers';

  // ── Resolve deposit_codes → UUIDs ──
  const resolveDepositCodes = useCallback(
    async (rows: ParsedRow[]): Promise<ParsedRow[]> => {
      const codes = new Set<string>();
      rows.forEach((row) => {
        if (importTable === 'transfers') {
          const ids = (row.raw.deposit_ids || row.raw.deposit_code || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          ids.forEach((c) => codes.add(c));
        } else {
          const code = row.raw.deposit_code;
          if (code) codes.add(code);
        }
      });

      if (codes.size === 0) return rows;

      const supabase = createClient();
      const codeArr = Array.from(codes);
      // Supabase .in() limit is ~300; chunk if needed
      const depositMap = new Map<
        string,
        {
          id: string;
          product_name: string;
          customer_name: string;
          quantity: number;
        }
      >();

      for (let i = 0; i < codeArr.length; i += 200) {
        const chunk = codeArr.slice(i, i + 200);
        const { data } = await supabase
          .from('deposits')
          .select('id, deposit_code, product_name, customer_name, quantity')
          .eq('store_id', selectedStoreId)
          .in('deposit_code', chunk);
        (data || []).forEach((d) => {
          depositMap.set(d.deposit_code, {
            id: d.id,
            product_name: d.product_name,
            customer_name: d.customer_name,
            quantity: d.quantity,
          });
        });
      }

      return rows.map((row) => {
        if (importTable === 'transfers') {
          const ids = (row.raw.deposit_ids || row.raw.deposit_code || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const subRows: ParsedRow[] = ids.map((code) => {
            const dep = depositMap.get(code);
            return {
              _valid: !!dep,
              _issue: dep ? undefined : `ไม่พบ deposit: ${code}`,
              _linked: !!dep,
              _depositUUID: dep?.id,
              _depositProductName: dep?.product_name,
              _depositCustomerName: dep?.customer_name,
              _depositQuantity: dep?.quantity,
              raw: { ...row.raw, _resolved_code: code },
            };
          });
          const linkedCount = subRows.filter((sr) => sr._linked).length;
          return {
            ...row,
            _valid: subRows.length > 0 && linkedCount > 0,
            _issue:
              linkedCount === ids.length
                ? undefined
                : `เชื่อมได้ ${linkedCount}/${ids.length}`,
            _linked: linkedCount === ids.length,
            _subRows: subRows,
          };
        } else {
          const code = row.raw.deposit_code;
          const dep = depositMap.get(code);
          return {
            ...row,
            _linked: !!dep,
            _depositUUID: dep?.id,
            _depositProductName: dep?.product_name,
            _depositCustomerName: dep?.customer_name,
            _depositQuantity: dep?.quantity,
            _valid: row._valid && !!dep,
            _issue: dep
              ? row._issue
              : `ไม่พบ deposit_code "${code}" ในร้านนี้`,
          };
        }
      });
    },
    [importTable, selectedStoreId]
  );

  // ── Parse file ──
  const processFile = useCallback(
    async (file: File) => {
      if (
        !file.name.endsWith('.csv') &&
        !file.name.endsWith('.txt') &&
        !file.name.endsWith('.tsv')
      ) {
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

        const parsed: ParsedRow[] = rows
          .filter((row) => row.some((cell) => cell.trim()))
          .map((row) => {
            const raw: Record<string, string> = {};
            headers.forEach((h, i) => {
              raw[h] = row[i] || '';
            });

            let _valid = true;
            let _issue: string | undefined;

            if (importTable === 'deposits') {
              const pn = raw.product_name || raw.item_name || '';
              const cn = raw.customer_name || '';
              if (!pn) {
                _valid = false;
                _issue = 'ไม่มีชื่อสินค้า';
              } else if (!cn) {
                _valid = false;
                _issue = 'ไม่มีชื่อลูกค้า';
              }
            } else if (importTable === 'withdrawals') {
              if (!raw.deposit_code) {
                _valid = false;
                _issue = 'ไม่มี deposit_code';
              }
            } else if (importTable === 'transfers') {
              if (!raw.deposit_ids && !raw.deposit_code) {
                _valid = false;
                _issue = 'ไม่มี deposit_ids';
              }
            } else if (importTable === 'deposit_requests') {
              if (!raw.customer_name) {
                _valid = false;
                _issue = 'ไม่มีชื่อลูกค้า';
              }
            }

            return { _valid, _issue, raw };
          });

        const invalidCount = parsed.filter((r) => !r._valid).length;
        if (invalidCount > 0) {
          warnings.push(`${invalidCount} แถวมีข้อมูลไม่ครบ`);
        }

        if (importTable === 'deposits') {
          const cancelledCount = parsed.filter(
            (r) => (r.raw.status || '').toLowerCase().trim() === 'cancelled'
          ).length;
          if (cancelledCount > 0) {
            warnings.push(
              `${cancelledCount} แถวมีสถานะ "cancelled" (จะข้าม)`
            );
          }
        }

        // For withdrawals/transfers → resolve deposit codes
        if (needsResolution && parsed.some((r) => r._valid)) {
          setParsedRows(parsed);
          setParseWarnings(warnings);
          setStep('preview');
          setParsing(false);
          setResolving(true);

          try {
            const resolved = await resolveDepositCodes(parsed);
            const linked = resolved.filter((r) => r._linked).length;
            const total = resolved.filter(
              (r) =>
                r.raw.deposit_code ||
                r.raw.deposit_ids
            ).length;
            warnings.push(
              `เชื่อมโยง deposit สำเร็จ ${linked}/${total} รายการ`
            );
            const unlinked = resolved.filter(
              (r) => r._issue?.includes('ไม่พบ')
            ).length;
            if (unlinked > 0) {
              warnings.push(`${unlinked} แถวไม่พบ deposit ในร้านนี้ (จะข้าม)`);
            }
            setParsedRows(resolved);
            setParseWarnings([...warnings]);
          } finally {
            setResolving(false);
          }
          return;
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
    [importTable, needsResolution, resolveDepositCodes]
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

  // ── Stats ──
  const stats = useMemo(() => {
    if (importTable === 'deposits') {
      const valid = parsedRows.filter(
        (r) =>
          r._valid &&
          (r.raw.status || '').toLowerCase().trim() !== 'cancelled'
      );
      const invalid = parsedRows.filter((r) => !r._valid);
      const skipped = parsedRows.filter(
        (r) => (r.raw.status || '').toLowerCase().trim() === 'cancelled'
      );
      const inStore = valid.filter(
        (r) => mapDepositStatus(r.raw.status) === 'in_store'
      ).length;
      const pending = valid.filter(
        (r) => mapDepositStatus(r.raw.status) === 'pending_confirm'
      ).length;
      const expired = valid.filter(
        (r) => mapDepositStatus(r.raw.status) === 'expired'
      ).length;
      const withdrawn = valid.filter(
        (r) => mapDepositStatus(r.raw.status) === 'withdrawn'
      ).length;
      return {
        valid: valid.length,
        invalid: invalid.length,
        skipped: skipped.length,
        inStore,
        pending,
        expired,
        withdrawn,
        linked: 0,
        unlinked: 0,
      };
    } else {
      const valid = parsedRows.filter((r) => r._valid);
      const invalid = parsedRows.filter((r) => !r._valid);
      const linked = parsedRows.filter((r) => r._linked).length;
      const unlinked = parsedRows.filter(
        (r) => r._linked === false
      ).length;
      return {
        valid: valid.length,
        invalid: invalid.length,
        skipped: 0,
        inStore: 0,
        pending: 0,
        expired: 0,
        withdrawn: 0,
        linked,
        unlinked,
      };
    }
  }, [parsedRows, importTable]);

  // ── Import ──
  const handleImport = async () => {
    if (!selectedStoreId || !user) return;
    setSaving(true);
    const supabase = createClient();
    let successCount = 0;
    let skippedCount = 0;
    const errorList: string[] = [];
    const BATCH = 50;

    if (importTable === 'deposits') {
      const validRows = parsedRows.filter(
        (r) =>
          r._valid &&
          (r.raw.status || '').toLowerCase().trim() !== 'cancelled'
      );

      for (let i = 0; i < validRows.length; i += BATCH) {
        const batch = validRows.slice(i, i + BATCH);
        const records = batch.map((row) => {
          const qty = Number(row.raw.quantity) || 0;
          const remQty = Number(row.raw.remaining_qty) || qty;
          const remPct =
            Number(row.raw.remaining_percent) ||
            (qty > 0 ? Math.round((remQty / qty) * 100) : 100);
          return {
            store_id: selectedStoreId,
            deposit_code:
              row.raw.deposit_code ||
              `IMPORT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            line_user_id: row.raw.line_user_id || null,
            customer_name: row.raw.customer_name,
            customer_phone: row.raw.customer_phone || null,
            product_name: row.raw.product_name || row.raw.item_name,
            category: row.raw.category || null,
            quantity: qty,
            remaining_qty: remQty,
            remaining_percent: remPct,
            table_number: row.raw.table_number || null,
            status: mapDepositStatus(row.raw.status),
            is_vip: (row.raw.is_vip || '').toUpperCase() === 'TRUE',
            expiry_date:
              (row.raw.is_vip || '').toUpperCase() === 'TRUE'
                ? null
                : formatDateForSupabase(row.raw.expiry_date),
            notes: row.raw.notes || null,
            photo_url: row.raw.photo_url || null,
            customer_photo_url: row.raw.customer_photo_url || null,
            received_photo_url: row.raw.received_photo_url || null,
            confirm_photo_url: row.raw.confirm_photo_url || null,
            received_by: user.id,
            created_at:
              formatDateForSupabase(
                row.raw.deposit_date || row.raw.created_at
              ) || new Date().toISOString(),
          };
        });

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
    } else if (importTable === 'withdrawals') {
      const validRows = parsedRows.filter(
        (r) => r._valid && r._linked && r._depositUUID
      );

      for (let i = 0; i < validRows.length; i += BATCH) {
        const batch = validRows.slice(i, i + BATCH);
        const records = batch.map((row) => ({
          deposit_id: row._depositUUID!,
          store_id: selectedStoreId,
          line_user_id: row.raw.line_user_id || null,
          customer_name:
            row.raw.customer_name || row._depositCustomerName || null,
          product_name:
            row._depositProductName || row.raw.product_name || null,
          requested_qty: Number(row.raw.requested_qty) || null,
          actual_qty:
            Number(row.raw.actual_qty) ||
            Number(row.raw.requested_qty) ||
            null,
          table_number: row.raw.table_number || null,
          status: VALID_WITHDRAWAL_STATUSES.includes(
            (row.raw.status || '').toLowerCase().trim()
          )
            ? (row.raw.status || '').toLowerCase().trim()
            : 'completed',
          processed_by: user.id,
          notes: row.raw.notes || null,
          created_at:
            formatDateForSupabase(
              row.raw.withdrawal_date || row.raw.created_at
            ) || new Date().toISOString(),
        }));

        const { error } = await supabase.from('withdrawals').insert(records);
        if (error) {
          errorList.push(
            `แถว ${i + 1}-${i + batch.length}: ${error.message}`
          );
          skippedCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }
    } else if (importTable === 'transfers') {
      // Flatten: each resolved deposit → one transfer record
      const allSubRows: ParsedRow[] = [];
      parsedRows.forEach((row) => {
        if (row._subRows) {
          row._subRows
            .filter((sr) => sr._linked && sr._depositUUID)
            .forEach((sr) => allSubRows.push(sr));
        } else if (row._linked && row._depositUUID) {
          allSubRows.push(row);
        }
      });

      const toStoreId = centralStore?.id;
      if (!toStoreId) {
        errorList.push(
          'ไม่พบร้านคลังกลาง (is_central) ในระบบ — กรุณาสร้างร้านคลังกลางก่อน'
        );
      } else {
        for (let i = 0; i < allSubRows.length; i += BATCH) {
          const batch = allSubRows.slice(i, i + BATCH);
          const records = batch.map((row) => ({
            from_store_id: selectedStoreId,
            to_store_id: toStoreId,
            deposit_id: row._depositUUID!,
            product_name: row._depositProductName || null,
            quantity: row._depositQuantity || null,
            status: VALID_TRANSFER_STATUSES.includes(
              (row.raw.status || '').toLowerCase().trim()
            )
              ? (row.raw.status || '').toLowerCase().trim()
              : 'confirmed',
            requested_by: user.id,
            notes: row.raw.notes || null,
            photo_url: row.raw.photo_url || null,
            confirm_photo_url: row.raw.confirm_photo_url || null,
            created_at:
              formatDateForSupabase(
                row.raw.transfer_date || row.raw.created_at
              ) || new Date().toISOString(),
          }));

          const { error } = await supabase.from('transfers').insert(records);
          if (error) {
            errorList.push(
              `แถว ${i + 1}-${i + batch.length}: ${error.message}`
            );
            skippedCount += batch.length;
          } else {
            successCount += batch.length;
          }
        }
      }
    } else if (importTable === 'deposit_requests') {
      const validRows = parsedRows.filter((r) => r._valid);

      for (let i = 0; i < validRows.length; i += BATCH) {
        const batch = validRows.slice(i, i + BATCH);
        const records = batch.map((row) => ({
          store_id: selectedStoreId,
          line_user_id: row.raw.line_user_id || 'imported',
          customer_name: row.raw.customer_name || null,
          customer_phone: row.raw.customer_phone || null,
          product_name: row.raw.product_name || null,
          quantity: Number(row.raw.quantity) || null,
          table_number: row.raw.table_number || null,
          notes: row.raw.notes || null,
          status: row.raw.status || 'pending',
          created_at:
            formatDateForSupabase(
              row.raw.request_date || row.raw.created_at
            ) || new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('deposit_requests')
          .insert(records);
        if (error) {
          errorList.push(
            `แถว ${i + 1}-${i + batch.length}: ${error.message}`
          );
          skippedCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }
    }

    const totalSkipped =
      skippedCount +
      parsedRows.filter(
        (r) =>
          !r._valid ||
          (importTable === 'deposits' &&
            (r.raw.status || '').toLowerCase().trim() === 'cancelled')
      ).length;

    setImportResult({
      success: successCount,
      skipped: totalSkipped,
      errors: errorList,
    });
    setStep('result');
    setSaving(false);
  };

  // ── Badge helpers ──
  const statusBadge = (status: string) => {
    const map: Record<
      string,
      {
        variant: 'success' | 'warning' | 'danger' | 'info' | 'default';
        label: string;
      }
    > = {
      in_store: { variant: 'success', label: 'ในร้าน' },
      pending_confirm: { variant: 'warning', label: 'รอยืนยัน' },
      pending_withdrawal: { variant: 'info', label: 'รอเบิก' },
      withdrawn: { variant: 'default', label: 'เบิกแล้ว' },
      expired: { variant: 'danger', label: 'หมดอายุ' },
      transferred_out: { variant: 'info', label: 'โอนคลัง' },
      cancelled: { variant: 'default', label: 'ยกเลิก' },
      pending: { variant: 'warning', label: 'รอ' },
      approved: { variant: 'info', label: 'อนุมัติ' },
      completed: { variant: 'success', label: 'เสร็จสิ้น' },
      rejected: { variant: 'danger', label: 'ปฏิเสธ' },
      confirmed: { variant: 'success', label: 'ยืนยันแล้ว' },
    };
    const cfg = map[status] || {
      variant: 'default' as const,
      label: status || '-',
    };
    return (
      <Badge variant={cfg.variant} size="sm">
        {cfg.label}
      </Badge>
    );
  };

  const linkBadge = (row: ParsedRow) => {
    if (row._linked === true)
      return (
        <Badge variant="success" size="sm">
          เชื่อมแล้ว
        </Badge>
      );
    if (row._linked === false)
      return (
        <Badge variant="danger" size="sm">
          ไม่พบ
        </Badge>
      );
    return null;
  };

  // Column guide
  const columnGuide: Record<ImportTable, string[]> = {
    deposits: [
      'deposit_code', 'customer_name', 'customer_phone', 'product_name',
      'category', 'quantity', 'remaining_qty', 'remaining_percent',
      'table_number', 'deposit_date', 'expiry_date', 'is_vip', 'status',
      'line_user_id', 'photo_url', 'notes',
    ],
    deposit_requests: [
      'customer_name', 'customer_phone', 'product_name', 'quantity',
      'table_number', 'line_user_id', 'notes', 'status', 'request_date',
    ],
    withdrawals: [
      'deposit_code', 'customer_name', 'requested_qty', 'actual_qty',
      'table_number', 'line_user_id', 'notes', 'withdrawal_date',
    ],
    transfers: [
      'deposit_ids', 'status', 'notes', 'photo_url',
      'confirm_photo_url', 'transfer_date', 'confirm_date',
    ],
  };

  const columnGuideNotes: Record<ImportTable, string> = {
    deposits: `* deposit_id เดิมจะไม่ใช้ — ระบบสร้าง UUID ใหม่
* store_id จะถูกแทนที่ด้วย UUID ร้านที่เลือก
* is_vip = TRUE → ไม่มีวันหมดอายุ (VIP)
* สถานะ "cancelled" จะถูกข้าม`,
    deposit_requests: '* line_user_id ถ้าไม่มีจะใส่ "imported"',
    withdrawals: `* deposit_code จะถูกใช้ค้นหา UUID ของ deposit ในร้านที่เลือก
* ต้อง Import Deposits ก่อน ไม่งั้นจะ resolve ไม่ได้
* status เดิมจะ map เป็น "completed" ถ้าไม่ตรง`,
    transfers: `* deposit_ids อาจมีหลายรหัส (คั่นด้วย ,) → จะแยกเป็นหลาย record
* to_store_id จะใช้ร้านคลังกลาง (is_central) อัตโนมัติ
* ต้อง Import Deposits ก่อน`,
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
          {/* Import Order Hint */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              ลำดับการ Import ที่ถูกต้อง
            </p>
            <ol className="mt-2 space-y-1 text-xs text-blue-700 dark:text-blue-400">
              <li>
                <strong>① Deposits</strong> — import ก่อน เพื่อสร้าง
                deposit_code → UUID ในระบบ
              </li>
              <li>
                <strong>② Withdrawals</strong> — ใช้ deposit_code ค้นหา UUID
                อัตโนมัติ
              </li>
              <li>
                <strong>③ Transfers</strong> — ใช้ deposit_ids ค้นหา UUID
                + ส่งไปคลังกลาง
              </li>
            </ol>
          </div>

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
                    label: `${s.store_name} (${s.store_code})${s.is_central ? ' — คลังกลาง' : ''}`,
                  }))}
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  placeholder="เลือกร้าน"
                />
                <Select
                  label="ประเภทข้อมูล"
                  options={TABLE_OPTIONS}
                  value={importTable}
                  onChange={(e) =>
                    setImportTable(e.target.value as ImportTable)
                  }
                />

                {/* Warnings for table selection */}
                {needsResolution && (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-900/10">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      {importTable === 'withdrawals'
                        ? 'Withdrawals ต้อง Import Deposits เข้าร้านนี้ก่อน'
                        : 'Transfers ต้อง Import Deposits เข้าร้านนี้ก่อน'}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
                      ระบบจะใช้ deposit_code ค้นหา UUID ของ deposit อัตโนมัติ
                      — ถ้าไม่พบจะข้ามแถวนั้น
                    </p>
                  </div>
                )}

                {importTable === 'transfers' && !centralStore && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm dark:bg-red-900/10">
                    <p className="font-medium text-red-700 dark:text-red-400">
                      ไม่พบร้านคลังกลาง (is_central) ในระบบ
                    </p>
                    <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">
                      กรุณาสร้างร้านคลังกลางในหน้าตั้งค่าก่อน Import
                      Transfers
                    </p>
                  </div>
                )}

                {selectedStore && (
                  <div className="rounded-lg bg-violet-50 p-3 text-sm dark:bg-violet-900/10">
                    <p className="font-medium text-violet-700 dark:text-violet-400">
                      ข้อมูลจะถูก import เข้าร้าน: {selectedStore.store_name}
                    </p>
                    <p className="mt-0.5 text-xs text-violet-600 dark:text-violet-500">
                      store_id เดิมในไฟล์จะถูกแทนที่ด้วย UUID:{' '}
                      {selectedStoreId.slice(0, 8)}...
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
            onClick={() =>
              selectedStoreId
                ? fileInputRef.current?.click()
                : toast({ type: 'warning', title: 'กรุณาเลือกร้านก่อน' })
            }
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
            <CardHeader
              title={`คอลัมน์ที่รองรับ (${TABLE_OPTIONS.find((t) => t.value === importTable)?.label.split('(')[0].replace(/①|②|③/g, '').trim() || importTable})`}
            />
            <CardContent>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {columnGuide[importTable].map((col) => (
                  <span
                    key={col}
                    className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <p className="mt-3 whitespace-pre-line text-xs text-gray-500 dark:text-gray-400">
                {columnGuideNotes[importTable]}
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
          {/* Resolving indicator */}
          {resolving && (
            <div className="flex items-center gap-3 rounded-xl bg-violet-50 p-4 dark:bg-violet-900/20">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600 dark:text-violet-400" />
              <div>
                <p className="text-sm font-medium text-violet-800 dark:text-violet-300">
                  กำลังเชื่อมโยง deposit_code → UUID...
                </p>
                <p className="text-xs text-violet-600 dark:text-violet-500">
                  ค้นหา deposit ที่ตรงกันในร้าน {selectedStore?.store_name}
                </p>
              </div>
            </div>
          )}

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
                  {parsedRows.length} แถว →{' '}
                  {TABLE_OPTIONS.find((t) => t.value === importTable)
                    ?.label.split('(')[0]
                    .replace(/①|②|③/g, '')
                    .trim()}{' '}
                  → ร้าน {selectedStore?.store_name}
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
                    <p
                      key={i}
                      className="text-xs text-amber-700 dark:text-amber-400"
                    >
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          {importTable === 'deposits' ? (
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
          ) : (
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
                  {stats.invalid}
                </p>
                <p className="text-[10px] text-red-600 dark:text-red-500">
                  ข้าม
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 px-3 py-3 text-center dark:bg-blue-900/20">
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                  {stats.linked}
                </p>
                <p className="text-[10px] text-blue-600 dark:text-blue-500">
                  เชื่อมโยงสำเร็จ
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-3 text-center dark:bg-amber-900/20">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                  {stats.unlinked}
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500">
                  ไม่พบ Deposit
                </p>
              </div>
            </div>
          )}

          {/* Detected columns */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            คอลัมน์ที่พบ: {csvHeaders.join(', ')}
          </div>

          {/* ── Preview Table: Deposits ── */}
          {importTable === 'deposits' && (
            <>
              <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          รหัส
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          ลูกค้า
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          สินค้า
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          หมวด
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                          จำนวน
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                          เหลือ
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                          สถานะ
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          หมดอายุ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {parsedRows.map((row, idx) => {
                        const status = (row.raw.status || '')
                          .toLowerCase()
                          .trim();
                        const qty = Number(row.raw.quantity) || 0;
                        const remQty =
                          Number(row.raw.remaining_qty) || qty;
                        const remPct =
                          Number(row.raw.remaining_percent) ||
                          (qty > 0
                            ? Math.round((remQty / qty) * 100)
                            : 100);
                        return (
                          <tr
                            key={idx}
                            className={cn(
                              'transition-colors',
                              !row._valid &&
                                'bg-red-50/50 text-red-400 dark:bg-red-900/10 dark:text-red-500',
                              status === 'cancelled' &&
                                'bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500',
                              row._valid &&
                                status !== 'cancelled' &&
                                'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            )}
                          >
                            <td className="px-3 py-2 text-xs text-gray-400">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {row.raw.deposit_code || '-'}
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-medium">
                                {row.raw.customer_name || '-'}
                              </p>
                              {row.raw.customer_phone && (
                                <p className="text-[10px] text-gray-400">
                                  {row.raw.customer_phone}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {row.raw.product_name ||
                                row.raw.item_name ||
                                '-'}
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {row.raw.category || '-'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {qty}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {remQty}
                              <span className="ml-1 text-[10px] text-gray-400">
                                ({remPct}%)
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row._issue && !row._valid ? (
                                <Badge variant="danger" size="sm">
                                  <XCircle className="mr-1 h-3 w-3" />
                                  {row._issue}
                                </Badge>
                              ) : (
                                statusBadge(
                                  mapDepositStatus(row.raw.status)
                                )
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {row.raw.expiry_date || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="space-y-2 md:hidden">
                {parsedRows.map((row, idx) => {
                  const status = (row.raw.status || '')
                    .toLowerCase()
                    .trim();
                  const qty = Number(row.raw.quantity) || 0;
                  const remQty = Number(row.raw.remaining_qty) || qty;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'rounded-xl p-3 shadow-sm ring-1',
                        !row._valid
                          ? 'bg-red-50/50 ring-red-200 dark:bg-red-900/10 dark:ring-red-800'
                          : status === 'cancelled'
                            ? 'bg-gray-50 ring-gray-200 dark:bg-gray-800/50 dark:ring-gray-700'
                            : 'bg-white ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {row.raw.product_name ||
                              row.raw.item_name ||
                              '-'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {row.raw.customer_name}{' '}
                            {row.raw.deposit_code &&
                              `• ${row.raw.deposit_code}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {remQty}/{qty}
                          </span>
                          {row._issue && !row._valid ? (
                            <Badge variant="danger" size="sm">
                              {row._issue}
                            </Badge>
                          ) : (
                            statusBadge(mapDepositStatus(row.raw.status))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Preview Table: Withdrawals ── */}
          {importTable === 'withdrawals' && (
            <>
              <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          Deposit Code
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          ลูกค้า
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          สินค้า (จาก Deposit)
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                          ขอเบิก
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                          เบิกจริง
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                          เชื่อมโยง
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {parsedRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className={cn(
                            'transition-colors',
                            !row._valid &&
                              'bg-red-50/50 text-red-400 dark:bg-red-900/10 dark:text-red-500',
                            row._valid &&
                              'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          )}
                        >
                          <td className="px-3 py-2 text-xs text-gray-400">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.raw.deposit_code || '-'}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium">
                              {row.raw.customer_name ||
                                row._depositCustomerName ||
                                '-'}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                            {row._depositProductName || row.raw.product_name || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {row.raw.requested_qty || '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.raw.actual_qty ||
                              row.raw.requested_qty ||
                              '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {!row._valid && row._issue ? (
                              <Badge variant="danger" size="sm">
                                {row._issue}
                              </Badge>
                            ) : (
                              linkBadge(row)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile */}
              <div className="space-y-2 md:hidden">
                {parsedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-xl p-3 shadow-sm ring-1',
                      !row._valid
                        ? 'bg-red-50/50 ring-red-200 dark:bg-red-900/10 dark:ring-red-800'
                        : 'bg-white ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {row.raw.deposit_code}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {row.raw.customer_name ||
                            row._depositCustomerName}{' '}
                          •{' '}
                          {row._depositProductName || row.raw.product_name}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {row.raw.actual_qty || row.raw.requested_qty}
                        </span>
                        {!row._valid && row._issue ? (
                          <Badge variant="danger" size="sm">
                            {row._issue}
                          </Badge>
                        ) : (
                          linkBadge(row)
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Preview Table: Transfers ── */}
          {importTable === 'transfers' && (
            <>
              <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          Deposit IDs
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                          จำนวน
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                          สถานะ
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                          เชื่อมโยง
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          โน้ต
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {parsedRows.map((row, idx) => {
                        const ids =
                          row.raw.deposit_ids || row.raw.deposit_code || '';
                        const idList = ids
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const linkedSub = row._subRows
                          ? row._subRows.filter((sr) => sr._linked).length
                          : row._linked
                            ? 1
                            : 0;
                        return (
                          <tr
                            key={idx}
                            className={cn(
                              'transition-colors',
                              !row._valid &&
                                'bg-red-50/50 text-red-400 dark:bg-red-900/10 dark:text-red-500',
                              row._valid &&
                                'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            )}
                          >
                            <td className="px-3 py-2 text-xs text-gray-400">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {idList.map((id, i) => {
                                  const sub = row._subRows?.[i];
                                  return (
                                    <span
                                      key={i}
                                      className={cn(
                                        'inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-gray-700',
                                        sub?._linked &&
                                          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                                        sub &&
                                          !sub._linked &&
                                          'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                      )}
                                    >
                                      {id}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {row.raw.total_items || idList.length}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {statusBadge(
                                (row.raw.status || '').toLowerCase().trim() ||
                                  'confirmed'
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row._issue && !row._valid ? (
                                <Badge variant="danger" size="sm">
                                  {row._issue}
                                </Badge>
                              ) : (
                                <Badge
                                  variant={
                                    linkedSub === idList.length
                                      ? 'success'
                                      : 'warning'
                                  }
                                  size="sm"
                                >
                                  {linkedSub}/{idList.length}
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {row.raw.notes || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile */}
              <div className="space-y-2 md:hidden">
                {parsedRows.map((row, idx) => {
                  const ids =
                    row.raw.deposit_ids || row.raw.deposit_code || '';
                  const idList = ids
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const linkedSub = row._subRows
                    ? row._subRows.filter((sr) => sr._linked).length
                    : row._linked
                      ? 1
                      : 0;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'rounded-xl p-3 shadow-sm ring-1',
                        !row._valid
                          ? 'bg-red-50/50 ring-red-200 dark:bg-red-900/10 dark:ring-red-800'
                          : 'bg-white ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-1">
                            {idList.map((id, i) => (
                              <span
                                key={i}
                                className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-gray-700"
                              >
                                {id}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {row.raw.notes || '-'}
                          </p>
                        </div>
                        <Badge
                          variant={
                            linkedSub === idList.length
                              ? 'success'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {linkedSub}/{idList.length}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Preview Table: Deposit Requests ── */}
          {importTable === 'deposit_requests' && (
            <>
              <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          ลูกค้า
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          สินค้า
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                          จำนวน
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                          สถานะ
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          โน้ต
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {parsedRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className={cn(
                            'transition-colors',
                            !row._valid &&
                              'bg-red-50/50 text-red-400 dark:bg-red-900/10 dark:text-red-500',
                            row._valid &&
                              'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          )}
                        >
                          <td className="px-3 py-2 text-xs text-gray-400">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium">
                              {row.raw.customer_name || '-'}
                            </p>
                            {row.raw.customer_phone && (
                              <p className="text-[10px] text-gray-400">
                                {row.raw.customer_phone}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.raw.product_name || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {row.raw.quantity || '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row._issue && !row._valid ? (
                              <Badge variant="danger" size="sm">
                                {row._issue}
                              </Badge>
                            ) : (
                              statusBadge(
                                (row.raw.status || '').toLowerCase().trim() ||
                                  'pending'
                              )
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {row.raw.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile */}
              <div className="space-y-2 md:hidden">
                {parsedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-xl p-3 shadow-sm ring-1',
                      !row._valid
                        ? 'bg-red-50/50 ring-red-200 dark:bg-red-900/10 dark:ring-red-800'
                        : 'bg-white ring-gray-200 dark:bg-gray-800 dark:ring-gray-700'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {row.raw.customer_name || '-'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {row.raw.product_name || '-'} • qty:{' '}
                          {row.raw.quantity || '-'}
                        </p>
                      </div>
                      {row._issue && !row._valid ? (
                        <Badge variant="danger" size="sm">
                          {row._issue}
                        </Badge>
                      ) : (
                        statusBadge(
                          (row.raw.status || '').toLowerCase().trim() ||
                            'pending'
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Bottom Action Bar */}
          <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-white">
                  {stats.valid}
                </span>{' '}
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
                  disabled={stats.valid === 0 || resolving}
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
                      นำเข้า {importResult.success} รายการเข้าร้าน{' '}
                      {selectedStore?.store_name}
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
                      สำเร็จ {importResult.success} | ข้าม{' '}
                      {importResult.skipped}
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
                    <p
                      key={i}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
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
                  onClick={() => (window.location.href = '/deposit')}
                  icon={<Wine className="h-4 w-4" />}
                >
                  ไปหน้าฝากเหล้า
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
