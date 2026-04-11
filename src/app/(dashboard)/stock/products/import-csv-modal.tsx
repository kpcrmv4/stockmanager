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
import { useTranslations } from 'next-intl';

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
  count_status: 'active' | 'excluded';
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
  const t = useTranslations('stock');
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
            t('importCsv.errorMinRows')
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
        const countStatusIdx = header.findIndex((h) => h === 'count_status');

        if (codeIdx === -1 || nameIdx === -1) {
          setParseError(
            t('importCsv.errorMissingColumns')
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

          const countStatusRaw =
            countStatusIdx >= 0
              ? row[countStatusIdx]?.trim().toLowerCase()
              : 'active';
          const count_status: 'active' | 'excluded' =
            countStatusRaw === 'excluded' ? 'excluded' : 'active';

          return {
            product_code: row[codeIdx]?.trim() || '',
            product_name: row[nameIdx]?.trim() || '',
            category: categoryIdx >= 0 ? row[categoryIdx]?.trim() || '' : '',
            size,
            unit,
            price: price && !isNaN(price) ? price : null,
            active,
            count_status,
          };
        });

        if (importRows.length === 0) {
          setParseError(t('importCsv.errorNoProducts'));
          return;
        }

        setRows(importRows);
        setStep('preview');
      } catch (err) {
        console.error('CSV parse error:', err);
        setParseError(t('importCsv.errorReadFile'));
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

      // Deduplicate by product_code (keep last occurrence) —
      // PostgreSQL upsert cannot handle duplicate keys in the same batch
      const deduped = new Map<string, ImportRow>();
      for (const row of rows) {
        deduped.set(row.product_code, row);
      }

      const payload = Array.from(deduped.values()).map((row) => ({
        store_id: currentStoreId,
        product_code: row.product_code,
        product_name: row.product_name,
        category: row.category || null,
        size: row.size || null,
        unit: row.unit || null,
        price: row.price,
        active: row.active,
        count_status: row.count_status,
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

      const dedupedRows = Array.from(deduped.values());
      const newCount = dedupedRows.filter(
        (r) => !existingCodes.has(r.product_code)
      ).length;
      const updateCount = dedupedRows.filter((r) =>
        existingCodes.has(r.product_code)
      ).length;

      // Audit log
      await supabase.from('audit_logs').insert({
        store_id: currentStoreId,
        action_type: 'products_imported',
        table_name: 'products',
        new_value: {
          total: dedupedRows.length,
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
        title: t('importCsv.importSuccess'),
        message: t('importCsv.importSuccessMessage', { created: newCount, updated: updateCount }),
      });

      onImported();
    } catch (error) {
      console.error('Import error:', error);
      toast({
        type: 'error',
        title: t('importCsv.importError'),
        message: t('importCsv.importErrorMessage'),
      });
    } finally {
      setImporting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Derived data for preview
  // -----------------------------------------------------------------------

  const uniqueRows = rows.length - new Map(rows.map((r) => [r.product_code, r])).size;
  const activeCount = rows.filter((r) => r.active).length;
  const inactiveCount = rows.length - activeCount;
  const excludedCount = rows.filter((r) => r.count_status === 'excluded').length;
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const sampleRows = rows.slice(0, 5);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('importCsv.title')}
      size="lg"
    >
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('importCsv.uploadDesc')}{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
              product_code
            </code>{' '}
            {t('importCsv.and')}{' '}
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
                {t('importCsv.clickToSelect')}
              </span>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('importCsv.supportedFormats')}
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
              {t('importCsv.supportedColumns')}:
            </p>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400/80">
              product_code, product_name, category, unit, cost_price,
              selling_price, active, count_status
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
                {t('importCsv.rowCount', { count: rows.length })}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-blue-50 px-3 py-2.5 dark:bg-blue-900/20">
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {rows.length}
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                {t('importCsv.total')}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2.5 dark:bg-emerald-900/20">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {activeCount}
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                {t('importCsv.active')}
              </p>
            </div>
            <div className="rounded-lg bg-gray-100 px-3 py-2.5 dark:bg-gray-700">
              <p className="text-lg font-bold text-gray-600 dark:text-gray-300">
                {inactiveCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('importCsv.inactive')}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 dark:bg-amber-900/20">
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {excludedCount}
              </p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
                {t('importCsv.excluded')}
              </p>
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('importCsv.categories', { count: categories.length })}
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
              {t('importCsv.sampleData')}
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <th className="px-3 py-2">{t('importCsv.colCode')}</th>
                    <th className="px-3 py-2">{t('importCsv.colName')}</th>
                    <th className="px-3 py-2">{t('importCsv.colCategory')}</th>
                    <th className="px-3 py-2">{t('importCsv.colUnit')}</th>
                    <th className="px-3 py-2">{t('importCsv.colSize')}</th>
                    <th className="px-3 py-2 text-right">{t('importCsv.colPrice')}</th>
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
                {t('importCsv.andMore', { count: rows.length - 5 })}
              </p>
            )}
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="text-xs text-amber-700 dark:text-amber-400">
              <p>
                {t('importCsv.duplicateWarning')}
              </p>
              {uniqueRows > 0 && (
                <p className="mt-1">
                  {t('importCsv.duplicateRows', { count: uniqueRows })}
                </p>
              )}
            </div>
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
              {t('importCsv.importDone')}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('importCsv.created')}{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {result.created}
              </span>{' '}
              {t('importCsv.items')} &middot; {t('importCsv.updated')}{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {result.updated}
              </span>{' '}
              {t('importCsv.items')}
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <ModalFooter>
        {step === 'upload' && (
          <Button variant="outline" onClick={handleClose}>
            {t('importCsv.close')}
          </Button>
        )}
        {step === 'preview' && (
          <>
            <Button variant="outline" onClick={reset}>
              {t('importCsv.selectNewFile')}
            </Button>
            <Button
              onClick={handleImport}
              isLoading={importing}
              icon={
                importing ? undefined : <Upload className="h-4 w-4" />
              }
            >
              {importing
                ? t('importCsv.importing')
                : t('importCsv.importCount', { count: rows.length })}
            </Button>
          </>
        )}
        {step === 'done' && (
          <Button onClick={handleClose}>{t('importCsv.close')}</Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
