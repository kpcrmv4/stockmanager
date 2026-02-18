'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Badge, Card, CardHeader, CardContent, EmptyState, toast } from '@/components/ui';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Plus,
  XCircle,
  Loader2,
  ArrowRight,
  Trash2,
  RotateCcw,
  BarChart3,
} from 'lucide-react';

// ── Types ──

interface ParsedItem {
  product_code: string;
  product_name: string;
  quantity: number;
  unit: string;
  category: string;
}

interface ClassifiedItem extends ParsedItem {
  status: 'matched' | 'new' | 'zero_qty';
  existing_name?: string;
  existing_active?: boolean;
}

interface ProcessSummary {
  total_items: number;
  matched: number;
  new_added: number;
  zero_qty: number;
  deactivated: number;
  reactivated: number;
}

type PageStep = 'upload' | 'preview' | 'result';

// ── TXT Parser ──

function parseTxtContent(content: string): ParsedItem[] {
  const lines = content.split('\n').filter((line) => line.trim());
  const items: ParsedItem[] = [];

  for (const line of lines) {
    // Tab-separated: code, name, qty, unit, category
    const parts = line.split('\t');
    if (parts.length < 3) continue; // skip invalid lines

    // Skip header rows
    const firstCol = parts[0].toLowerCase();
    if (
      firstCol.includes('code') ||
      firstCol.includes('รหัส') ||
      firstCol.includes('product') ||
      firstCol.includes('สินค้า')
    ) {
      continue;
    }

    const code = parts[0]?.trim() || '';
    const name = parts[1]?.trim() || '';
    const qty = parseFloat(parts[2]?.trim() || '0') || 0;
    const unit = parts[3]?.trim() || '';
    const category = parts[4]?.trim() || '';

    // Skip rows with empty product code
    if (!code) continue;

    items.push({
      product_code: code,
      product_name: name,
      quantity: qty,
      unit,
      category,
    });
  }

  return items;
}

// ── Encoding helpers ──

function readFileWithEncoding(
  file: File,
  encoding: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, encoding);
  });
}

async function readTxtFile(file: File): Promise<string> {
  // Try UTF-8 first
  const utf8Content = await readFileWithEncoding(file, 'UTF-8');

  // Check if content contains Thai characters or looks valid
  // If it has replacement characters, try Windows-874 (Thai encoding)
  if (utf8Content.includes('\uFFFD')) {
    try {
      const thaiContent = await readFileWithEncoding(file, 'windows-874');
      return thaiContent;
    } catch {
      // Fallback to UTF-8 even if garbled
      return utf8Content;
    }
  }

  return utf8Content;
}

// ── Component ──

export default function TxtUploadPage() {
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [step, setStep] = useState<PageStep>('upload');
  const [isDragActive, setIsDragActive] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Parsed data
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [classifiedItems, setClassifiedItems] = useState<ClassifiedItem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // Options
  const [includeZeroQty, setIncludeZeroQty] = useState(false);
  const [autoCompareAfterSave, setAutoCompareAfterSave] = useState(true);

  // Result
  const [summary, setSummary] = useState<ProcessSummary | null>(null);
  const [ocrLogId, setOcrLogId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  // ── Classify items against existing products ──
  const classifyItems = useCallback(
    async (items: ParsedItem[]) => {
      if (!currentStoreId) return;

      setLoading(true);
      try {
        const supabase = createClient();
        const { data: existingProducts, error } = await supabase
          .from('products')
          .select('product_code, product_name, active')
          .eq('store_id', currentStoreId);

        if (error) throw error;

        // Build lookup map
        const productMap = new Map<
          string,
          { product_name: string; active: boolean }
        >();
        (existingProducts || []).forEach((p) => {
          productMap.set(p.product_code, {
            product_name: p.product_name,
            active: p.active,
          });
        });

        // Classify each item
        const classified: ClassifiedItem[] = items.map((item) => {
          const existing = productMap.get(item.product_code);

          if (item.quantity === 0) {
            return {
              ...item,
              status: 'zero_qty' as const,
              existing_name: existing?.product_name,
              existing_active: existing?.active,
            };
          }

          if (existing) {
            return {
              ...item,
              status: 'matched' as const,
              existing_name: existing.product_name,
              existing_active: existing.active,
            };
          }

          return {
            ...item,
            status: 'new' as const,
          };
        });

        setClassifiedItems(classified);
        setStep('preview');
      } catch (error) {
        console.error('Error classifying items:', error);
        toast({
          type: 'error',
          title: 'เกิดข้อผิดพลาด',
          message: 'ไม่สามารถตรวจสอบรายการสินค้าจากระบบได้',
        });
      } finally {
        setLoading(false);
      }
    },
    [currentStoreId]
  );

  // ── Handle file processing ──
  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.txt')) {
        toast({
          type: 'error',
          title: 'ไฟล์ไม่ถูกต้อง',
          message: 'กรุณาอัพโหลดไฟล์ .txt เท่านั้น',
        });
        return;
      }

      setFileName(file.name);
      setParsing(true);
      setParseErrors([]);

      try {
        const content = await readTxtFile(file);
        const items = parseTxtContent(content);

        if (items.length === 0) {
          setParseErrors([
            'ไม่พบข้อมูลสินค้าในไฟล์ กรุณาตรวจสอบรูปแบบไฟล์ (tab-separated: รหัส, ชื่อ, จำนวน, หน่วย, หมวด)',
          ]);
          setParsing(false);
          return;
        }

        setParsedItems(items);

        // Check for potential issues
        const errors: string[] = [];
        const noNameItems = items.filter((i) => !i.product_name);
        if (noNameItems.length > 0) {
          errors.push(
            `${noNameItems.length} รายการไม่มีชื่อสินค้า`
          );
        }
        const noUnitItems = items.filter((i) => !i.unit);
        if (noUnitItems.length > 0) {
          errors.push(
            `${noUnitItems.length} รายการไม่มีหน่วยนับ`
          );
        }
        setParseErrors(errors);

        // Classify items against existing products
        await classifyItems(items);
      } catch (error) {
        console.error('Error reading file:', error);
        toast({
          type: 'error',
          title: 'อ่านไฟล์ไม่สำเร็จ',
          message: 'ไม่สามารถอ่านข้อมูลจากไฟล์ได้ ลองใหม่อีกครั้ง',
        });
      } finally {
        setParsing(false);
      }
    },
    [classifyItems]
  );

  // ── Drag & drop handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [processFile]
  );

  // ── Save to API ──
  const handleSave = async () => {
    if (!currentStoreId) {
      toast({
        type: 'error',
        title: 'ไม่พบร้านค้า',
        message: 'กรุณาเลือกร้านค้าก่อนบันทึก',
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/stock/process-txt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: currentStoreId,
          items: parsedItems,
          upload_date: today,
          include_zero_qty: includeZeroQty,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process data');
      }

      setSummary(result.summary);
      setOcrLogId(result.ocr_log_id);
      setStep('result');

      toast({
        type: 'success',
        title: 'บันทึกสำเร็จ',
        message: `นำเข้าข้อมูล ${result.summary.total_items} รายการเรียบร้อย`,
      });
    } catch (error) {
      console.error('Error saving TXT data:', error);
      toast({
        type: 'error',
        title: 'บันทึกไม่สำเร็จ',
        message:
          error instanceof Error
            ? error.message
            : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Reset ──
  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setParsedItems([]);
    setClassifiedItems([]);
    setParseErrors([]);
    setSummary(null);
    setOcrLogId(null);
  };

  // ── Stats for preview ──
  const previewStats = useMemo(() => {
    const matchedCount = classifiedItems.filter(
      (i) => i.status === 'matched'
    ).length;
    const newCount = classifiedItems.filter((i) => i.status === 'new').length;
    const zeroCount = classifiedItems.filter(
      (i) => i.status === 'zero_qty'
    ).length;
    return { matched: matchedCount, new: newCount, zero: zeroCount };
  }, [classifiedItems]);

  // ── Render: Upload Step ──
  const renderUploadStep = () => (
    <>
      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          isDragActive
            ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/20'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-gray-500 dark:hover:bg-gray-800'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-xl',
              isDragActive
                ? 'bg-indigo-100 dark:bg-indigo-900/30'
                : 'bg-gray-100 dark:bg-gray-700'
            )}
          >
            {parsing ? (
              <Loader2
                className={cn(
                  'h-7 w-7 animate-spin',
                  isDragActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-400 dark:text-gray-500'
                )}
              />
            ) : (
              <Upload
                className={cn(
                  'h-7 w-7',
                  isDragActive
                    ? 'text-indigo-600 dark:text-indigo-400'
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
                  : 'ลากไฟล์มาวาง หรือ คลิกเพื่อเลือกไฟล์'}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              รองรับไฟล์ .txt (Tab-separated) ทั้ง UTF-8 และ Windows-874
            </p>
          </div>
        </div>
      </div>

      {/* File format guide */}
      <Card>
        <CardHeader title="รูปแบบไฟล์ที่รองรับ" />
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ไฟล์ .txt แบบ Tab-separated (คั่นด้วย Tab) ตามรูปแบบ:
            </p>
            <div className="overflow-x-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
              <code className="whitespace-pre text-xs text-gray-700 dark:text-gray-300">
                {`รหัส\tชื่อสินค้า\tจำนวน\tหน่วย\tหมวด\n`}
                {`B001\tเบียร์ช้าง\t24\tขวด\tเบียร์\n`}
                {`W001\tไวน์แดง\t5\tขวด\tไวน์\n`}
                {`S001\tเหล้าขาว\t0\tขวด\tสุรา`}
              </code>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                คอลัมน์ 1: รหัสสินค้า
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                คอลัมน์ 2: ชื่อสินค้า
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                คอลัมน์ 3: จำนวน
              </span>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                คอลัมน์ 4: หน่วย
              </span>
              <span className="rounded-full bg-pink-50 px-2 py-0.5 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
                คอลัมน์ 5: หมวดหมู่
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );

  // ── Render: Preview Step ──
  const renderPreviewStep = () => (
    <>
      {/* File info */}
      <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
            <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {fileName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {parsedItems.length} รายการ -- {formatThaiDate(today)}
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

      {/* Parse warnings */}
      {parseErrors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                พบข้อสังเกต
              </p>
              {parseErrors.map((err, i) => (
                <p
                  key={i}
                  className="text-xs text-amber-700 dark:text-amber-400"
                >
                  {err}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center dark:bg-emerald-900/20">
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {previewStats.matched}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
            ตรงกับระบบ
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 px-3 py-3 text-center dark:bg-blue-900/20">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
            {previewStats.new}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-500">
            สินค้าใหม่
          </p>
        </div>
        <div className="rounded-xl bg-gray-100 px-3 py-3 text-center dark:bg-gray-700">
          <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
            {previewStats.zero}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            จำนวน = 0
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          ตัวเลือก
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={includeZeroQty}
            onChange={(e) => setIncludeZeroQty(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
          />
          <span className="text-gray-700 dark:text-gray-300">
            รวมสินค้า qty = 0
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={autoCompareAfterSave}
            onChange={(e) => setAutoCompareAfterSave(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
          />
          <span className="text-gray-700 dark:text-gray-300">
            เปรียบเทียบอัตโนมัติหลังบันทึก
          </span>
        </label>
      </div>

      {/* Preview Table — Desktop */}
      <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                  #
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                  รหัส
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                  ชื่อสินค้า
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                  จำนวน
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                  หน่วย
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                  หมวด
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">
                  สถานะ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {classifiedItems.map((item, idx) => (
                <tr
                  key={idx}
                  className={cn(
                    'transition-colors',
                    item.status === 'matched' &&
                      'bg-white hover:bg-emerald-50/50 dark:bg-gray-800 dark:hover:bg-emerald-900/10',
                    item.status === 'new' &&
                      'bg-blue-50/30 hover:bg-blue-50 dark:bg-blue-900/10 dark:hover:bg-blue-900/20',
                    item.status === 'zero_qty' &&
                      'bg-gray-50 text-gray-400 hover:bg-gray-100 dark:bg-gray-800/50 dark:text-gray-500 dark:hover:bg-gray-700/50'
                  )}
                >
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                    {item.product_code}
                  </td>
                  <td className="px-4 py-3">
                    <p
                      className={cn(
                        'font-medium',
                        item.status === 'zero_qty'
                          ? 'text-gray-400 dark:text-gray-500'
                          : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {item.product_name || '-'}
                    </p>
                    {item.existing_name &&
                      item.existing_name !== item.product_name && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          ระบบ: {item.existing_name}
                        </p>
                      )}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right font-medium',
                      item.status === 'zero_qty'
                        ? 'text-gray-400 dark:text-gray-500'
                        : 'text-gray-900 dark:text-white'
                    )}
                  >
                    {formatNumber(item.quantity)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {item.unit || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {item.category || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.status === 'matched' && (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        ตรงกัน
                      </Badge>
                    )}
                    {item.status === 'new' && (
                      <Badge variant="info">
                        <Plus className="mr-1 h-3 w-3" />
                        ใหม่
                      </Badge>
                    )}
                    {item.status === 'zero_qty' && (
                      <Badge variant="default">
                        <XCircle className="mr-1 h-3 w-3" />
                        qty=0
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Cards — Mobile */}
      <div className="space-y-2 md:hidden">
        {classifiedItems.map((item, idx) => (
          <div
            key={idx}
            className={cn(
              'rounded-xl p-4 shadow-sm ring-1',
              item.status === 'matched' &&
                'bg-white ring-emerald-200 dark:bg-gray-800 dark:ring-emerald-800',
              item.status === 'new' &&
                'bg-blue-50/50 ring-blue-200 dark:bg-blue-900/10 dark:ring-blue-800',
              item.status === 'zero_qty' &&
                'bg-gray-50 ring-gray-200 dark:bg-gray-800/50 dark:ring-gray-700'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    item.status === 'zero_qty'
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-900 dark:text-white'
                  )}
                >
                  {item.product_name || item.product_code}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                  <span className="font-mono">{item.product_code}</span>
                  {item.category && <span>{item.category}</span>}
                  {item.unit && <span>({item.unit})</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'text-lg font-bold',
                    item.status === 'zero_qty'
                      ? 'text-gray-300 dark:text-gray-600'
                      : 'text-gray-900 dark:text-white'
                  )}
                >
                  {formatNumber(item.quantity)}
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              {item.status === 'matched' && (
                <Badge variant="success" size="sm">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  ตรงกัน
                </Badge>
              )}
              {item.status === 'new' && (
                <Badge variant="info" size="sm">
                  <Plus className="mr-1 h-3 w-3" />
                  สินค้าใหม่
                </Badge>
              )}
              {item.status === 'zero_qty' && (
                <Badge variant="default" size="sm">
                  <XCircle className="mr-1 h-3 w-3" />
                  qty = 0
                </Badge>
              )}
              {item.existing_name &&
                item.existing_name !== item.product_name && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    ระบบ: {item.existing_name}
                  </span>
                )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">
              {classifiedItems.length}
            </span>{' '}
            รายการ
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
              onClick={handleSave}
            >
              บันทึกข้อมูล
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  // ── Render: Result Step ──
  const renderResultStep = () => {
    if (!summary) return null;

    const resultCards = [
      {
        label: 'ทั้งหมด',
        value: summary.total_items,
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        text: 'text-blue-700 dark:text-blue-400',
        subText: 'text-blue-600 dark:text-blue-500',
      },
      {
        label: 'ตรงกัน',
        value: summary.matched,
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        text: 'text-emerald-700 dark:text-emerald-400',
        subText: 'text-emerald-600 dark:text-emerald-500',
      },
      {
        label: 'เพิ่มใหม่',
        value: summary.new_added,
        bg: 'bg-indigo-50 dark:bg-indigo-900/20',
        text: 'text-indigo-700 dark:text-indigo-400',
        subText: 'text-indigo-600 dark:text-indigo-500',
      },
      {
        label: 'qty = 0',
        value: summary.zero_qty,
        bg: 'bg-gray-100 dark:bg-gray-700',
        text: 'text-gray-700 dark:text-gray-300',
        subText: 'text-gray-500 dark:text-gray-400',
      },
      {
        label: 'ปิดใช้งาน',
        value: summary.deactivated,
        bg: 'bg-red-50 dark:bg-red-900/20',
        text: 'text-red-700 dark:text-red-400',
        subText: 'text-red-600 dark:text-red-500',
      },
      {
        label: 'เปิดใช้งานใหม่',
        value: summary.reactivated,
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        text: 'text-amber-700 dark:text-amber-400',
        subText: 'text-amber-600 dark:text-amber-500',
      },
    ];

    return (
      <>
        {/* Success banner */}
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              นำเข้าข้อมูลสำเร็จ
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              ไฟล์ {fileName} -- {formatThaiDate(today)}
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {resultCards.map((card) => (
            <div
              key={card.label}
              className={cn('rounded-xl px-3 py-3 text-center', card.bg)}
            >
              <p className={cn('text-lg font-bold', card.text)}>
                {formatNumber(card.value)}
              </p>
              <p className={cn('text-[10px]', card.subText)}>{card.label}</p>
            </div>
          ))}
        </div>

        {/* Detail breakdown */}
        <Card>
          <CardHeader title="สรุปผลการนำเข้า" />
          <CardContent>
            <div className="space-y-3">
              {summary.new_added > 0 && (
                <div className="flex items-start gap-2">
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    เพิ่มสินค้าใหม่ {summary.new_added} รายการ เข้าสู่ระบบอัตโนมัติ
                  </p>
                </div>
              )}
              {summary.deactivated > 0 && (
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    ปิดใช้งาน {summary.deactivated} รายการ (จำนวน = 0)
                  </p>
                </div>
              )}
              {summary.reactivated > 0 && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    เปิดใช้งานใหม่ {summary.reactivated} รายการ (มีจำนวนเข้ามา)
                  </p>
                </div>
              )}
              {summary.new_added === 0 &&
                summary.deactivated === 0 &&
                summary.reactivated === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ไม่มีการเปลี่ยนแปลงสินค้าในระบบ
                  </p>
                )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/stock/comparison" className="flex-1">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              icon={<BarChart3 className="h-5 w-5" />}
            >
              ดูผลเปรียบเทียบ
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </a>
          <Button
            variant="outline"
            size="lg"
            icon={<RotateCcw className="h-5 w-5" />}
            onClick={handleReset}
          >
            อัพโหลดไฟล์ใหม่
          </Button>
        </div>
      </>
    );
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ── Main render ──
  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <a
              href="/stock"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <ArrowLeft className="h-5 w-5" />
            </a>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              นำเข้าข้อมูล TXT
            </h1>
          </div>
          <p className="mt-0.5 ml-9 text-sm text-gray-500 dark:text-gray-400">
            {step === 'upload' && 'อัพโหลดไฟล์ .txt จากระบบ POS'}
            {step === 'preview' && `ตรวจสอบข้อมูลก่อนบันทึก -- ${formatThaiDate(today)}`}
            {step === 'result' && 'ผลการนำเข้าข้อมูล'}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { key: 'upload', label: 'อัพโหลด' },
          { key: 'preview', label: 'ตรวจสอบ' },
          { key: 'result', label: 'ผลลัพธ์' },
        ].map((s, idx) => (
          <div key={s.key} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={cn(
                  'h-px w-6',
                  step === s.key || (s.key === 'result' && step === 'result') || (s.key === 'preview' && step === 'result')
                    ? 'bg-indigo-400 dark:bg-indigo-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                )}
              />
            )}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                step === s.key
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : (s.key === 'upload' && (step === 'preview' || step === 'result')) ||
                      (s.key === 'preview' && step === 'result')
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              )}
            >
              {((s.key === 'upload' && (step === 'preview' || step === 'result')) ||
                (s.key === 'preview' && step === 'result')) && (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 'upload' && renderUploadStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'result' && renderResultStep()}
    </div>
  );
}
