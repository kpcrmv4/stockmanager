'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Modal, ModalFooter, Button, toast } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportRow {
  product_code: string;
  product_name: string;
  category: string;
  size: string;
  unit: string;
  price: number | null;
  active: boolean;
}

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse CSV/TSV text into 2D string array (handles quoted fields) */
function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  // Detect delimiter: if first line has tabs, use tab; else comma
  const delimiter = lines[0]?.includes('\t') ? '\t' : ',';

  return lines.map((line) => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

/** Parse unit string like "bottle(700)" into { unit, size } */
function parseUnitField(raw: string): { unit: string; size: string } {
  const match = raw.match(/^(.+?)\s*\((.+?)\)$/);
  if (match) return { unit: match[1].trim(), size: match[2].trim() };
  return { unit: raw.trim(), size: '' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportCSVModal({
  isOpen,
  onClose,
  onImported,
}: ImportCSVModalProps) {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [result, setResult] = useState({ created: 0, updated: 0 });

  function reset() {
    setRows([]);
    setFileName('');
    setParseError('');
    setStep('upload');
    setResult({ created: 0, updated: 0 });
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  // -----------------------------------------------------------------------
  // File handling
  // -----------------------------------------------------------------------

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);

        if (parsed.length < 2) {
          setParseError(
            'ไฟล์ต้องมีอย่างน้อย 1 แถวข้อมูล (นอกจากหัวตาราง)'
          );
          return;
        }

        const header = parsed[0].map((h) => h.toLowerCase().trim());

        // Find column indices
        const codeIdx = header.findIndex((h) => h === 'product_code');
        const nameIdx = header.findIndex((h) => h === 'product_name');
        const categoryIdx = header.findIndex((h) => h === 'category');
        const unitIdx = header.findIndex((h) => h === 'unit');
        const costPriceIdx = header.findIndex((h) => h === 'cost_price');
        const sellingPriceIdx = header.findIndex((h) => h === 'selling_price');
        const activeIdx = header.findIndex((h) => h === 'active');

        if (codeIdx === -1 || nameIdx === -1) {
          setParseError(
            'ไม่พบคอลัมน์ product_code หรือ product_name ในหัวตาราง'
          );
          return;
        }

        const dataRows = parsed
          .slice(1)
          .filter((row) => row[codeIdx]?.trim());

        const importRows: ImportRow[] = dataRows.map((row) => {
          const rawUnit = unitIdx >= 0 ? row[unitIdx] || '' : '';
          const { unit, size } = parseUnitField(rawUnit);

          // ใช้ cost_price ก่อน ถ้าไม่มีใช้ selling_price
          const priceStr =
            costPriceIdx >= 0 && row[costPriceIdx]
              ? row[costPriceIdx]
              : sellingPriceIdx >= 0
                ? row[sellingPriceIdx] || ''
                : '';
          const price = priceStr
            ? parseFloat(priceStr.replace(/,/g, ''))
            : null;

          const activeStr =
            activeIdx >= 0 ? row[activeIdx]?.toUpperCase() : 'TRUE';
          const active = activeStr !== 'FALSE';

          return {
            product_code: row[codeIdx]?.trim() || '',
            product_name: row[nameIdx]?.trim() || '',
            category: categoryIdx >= 0 ? row[categoryIdx]?.trim() || '' : '',
            size,
            unit,
            price: price && !isNaN(price) ? price : null,
            active,
          };
        });

        if (importRows.length === 0) {
          setParseError('ไม่พบข้อมูลสินค้าในไฟล์');
          return;
        }

        setRows(importRows);
        setStep('preview');
      } catch (err) {
        console.error('CSV parse error:', err);
        setParseError('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  // -----------------------------------------------------------------------
  // Import
  // -----------------------------------------------------------------------

  async function handleImport() {
    if (!currentStoreId || rows.length === 0) return;

    setImporting(true);
    try {
      const supabase = createClient();

      // ดึงสินค้าเดิมเพื่อนับจำนวน new vs update
      const { data: existing } = await supabase
        .from('products')
        .select('product_code')
        .eq('store_id', currentStoreId);

      const existingCodes = new Set(
        existing?.map((p) => p.product_code) || []
      );

      const payload = rows.map((row) => ({
        store_id: currentStoreId,
        product_code: row.product_code,
        product_name: row.product_name,
        category: row.category || null,
        size: row.size || null,
        unit: row.unit || null,
        price: row.price,
        active: row.active,
      }));

      // Batch upsert เพื่อไม่ให้ request ใหญ่เกินไป
      const BATCH_SIZE = 100;
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('products')
          .upsert(batch, { onConflict: 'store_id,product_code' });

        if (error) throw error;
      }

      const newCount = rows.filter(
        (r) => !existingCodes.has(r.product_code)
      ).length;
      const updateCount = rows.filter((r) =>
        existingCodes.has(r.product_code)
      ).length;

      // Audit log
      await supabase.from('audit_logs').insert({
        store_id: currentStoreId,
        action_type: 'products_imported',
        table_name: 'products',
        new_value: {
          total: rows.length,
          created: newCount,
          updated: updateCount,
          source: fileName,
        },
        changed_by: user?.id || null,
      });

      setResult({ created: newCount, updated: updateCount });
      setStep('done');

      toast({
        type: 'success',
        title: 'นำเข้าสินค้าสำเร็จ',
        message: `เพิ่มใหม่ ${newCount} รายการ, อัปเดต ${updateCount} รายการ`,
      });

      onImported();
    } catch (error) {
      console.error('Import error:', error);
      toast({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถนำเข้าข้อมูลได้ กรุณาลองใหม่',
      });
    } finally {
      setImporting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Derived data for preview
  // -----------------------------------------------------------------------

  const activeCount = rows.filter((r) => r.active).length;
  const inactiveCount = rows.length - activeCount;
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const sampleRows = rows.slice(0, 5);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="นำเข้าสินค้าจาก CSV"
      size="lg"
    >
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            ส่งออกข้อมูลจาก Google Sheets เป็น CSV แล้วอัปโหลดที่นี่
            ไฟล์ต้องมีคอลัมน์{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
              product_code
            </code>{' '}
            และ{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
              product_name
            </code>
          </p>

          {/* Dropzone */}
          <label
            htmlFor="csv-file"
            className={cn(
              'flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors',
              'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50',
              'dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/10'
            )}
          >
            <Upload className="h-10 w-10 text-gray-400" />
            <div className="text-center">
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                คลิกเลือกไฟล์
              </span>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                รองรับ .csv และ .tsv
              </p>
            </div>
            <input
              ref={fileRef}
              id="csv-file"
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-400">
                {parseError}
              </p>
            </div>
          )}

          {/* Supported columns */}
          <div className="rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
              คอลัมน์ที่รองรับ:
            </p>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400/80">
              product_code, product_name, category, unit, cost_price,
              selling_price, active
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {fileName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {rows.length} รายการ
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-blue-50 px-3 py-2.5 dark:bg-blue-900/20">
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {rows.length}
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                ทั้งหมด
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2.5 dark:bg-emerald-900/20">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {activeCount}
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                เปิดใช้
              </p>
            </div>
            <div className="rounded-lg bg-gray-100 px-3 py-2.5 dark:bg-gray-700">
              <p className="text-lg font-bold text-gray-600 dark:text-gray-300">
                {inactiveCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ปิดใช้
              </p>
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                หมวดหมู่ ({categories.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sample data */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              ตัวอย่างข้อมูล (5 รายการแรก)
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <th className="px-3 py-2">รหัส</th>
                    <th className="px-3 py-2">ชื่อ</th>
                    <th className="px-3 py-2">หมวด</th>
                    <th className="px-3 py-2">หน่วย</th>
                    <th className="px-3 py-2">ขนาด</th>
                    <th className="px-3 py-2 text-right">ราคา</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sampleRows.map((row, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">
                        {row.product_code}
                      </td>
                      <td className="px-3 py-1.5 text-gray-900 dark:text-white">
                        {row.product_name}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
                        {row.category || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
                        {row.unit || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
                        {row.size || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">
                        {row.price != null ? `฿${row.price.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                ... และอีก {rows.length - 5} รายการ
              </p>
            )}
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              สินค้าที่มี product_code ซ้ำจะถูก
              <strong>อัปเดตทับ</strong>ข้อมูลเดิม
            </p>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              นำเข้าสำเร็จ!
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              เพิ่มใหม่{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {result.created}
              </span>{' '}
              รายการ &middot; อัปเดต{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {result.updated}
              </span>{' '}
              รายการ
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <ModalFooter>
        {step === 'upload' && (
          <Button variant="outline" onClick={handleClose}>
            ปิด
          </Button>
        )}
        {step === 'preview' && (
          <>
            <Button variant="outline" onClick={reset}>
              เลือกไฟล์ใหม่
            </Button>
            <Button
              onClick={handleImport}
              isLoading={importing}
              icon={
                importing ? undefined : <Upload className="h-4 w-4" />
              }
            >
              {importing
                ? 'กำลังนำเข้า...'
                : `นำเข้า ${rows.length} รายการ`}
            </Button>
          </>
        )}
        {step === 'done' && (
          <Button onClick={handleClose}>ปิด</Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
