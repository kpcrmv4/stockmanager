'use client';

import { useTranslations } from 'next-intl';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { Button, Badge, Card, CardHeader, CardContent, EmptyState, toast } from '@/components/ui';
import { formatThaiDate, formatNumber } from '@/lib/utils/format';
import { yesterdayBangkok } from '@/lib/utils/date';
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit';
import {
  runAutoCompare,
  checkExistingPOSUpload,
  type AutoCompareResult,
} from '@/lib/stock/auto-compare';
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
  ChevronDown,
  ChevronRight,
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
  let currentCategory = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // MAT-xxx category separator (e.g. MAT-Beer, MAT-Gin)
    if (trimmed.startsWith('MAT-')) {
      currentCategory = trimmed.replace('MAT-', '').trim();
      continue;
    }

    // Tab-separated columns
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const firstCol = parts[0].trim();
    if (!firstCol) continue;

    // Skip header / subtotal / total / footer lines
    const lower = firstCol.toLowerCase();
    if (
      lower.includes('รหัส') ||
      lower.includes('สินค้า') ||
      lower.includes('code') ||
      lower.includes('product') ||
      lower.includes('ยอดขาย') ||
      lower.includes('total') ||
      lower.includes('stock date') ||
      lower.includes('branch') ||
      lower.includes('รายงาน') ||
      /^\d+\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)/.test(trimmed)
    ) {
      continue;
    }

    // Parse quantity — strip commas (thousands separator) before parsing
    const rawQty = (parts[2] || '').trim().replace(/,/g, '');
    const qty = parseFloat(rawQty);
    if (isNaN(qty)) continue; // not a data line

    const code = firstCol;
    const name = (parts[1] || '').trim();
    const unit = (parts[3] || '').trim();

    items.push({
      product_code: code,
      product_name: name,
      quantity: qty,
      unit,
      category: currentCategory,
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

// ── Grouped Preview Component ──

interface GroupConfig {
  key: 'new' | 'matched' | 'zero_qty';
  label: string;
  icon: typeof Plus;
  badgeVariant: 'info' | 'success' | 'default';
  badgeLabel: string;
  ringColor: string;
  headerBg: string;
  headerText: string;
  countBg: string;
  countText: string;
  itemBg: string;
  itemRing: string;
  textColor: string;
  qtyColor: string;
}

const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: 'new',
    label: 'new',
    icon: Plus,
    badgeVariant: 'info',
    badgeLabel: 'new',
    ringColor: 'ring-blue-200 dark:ring-blue-800',
    headerBg: 'bg-blue-50 dark:bg-blue-900/20',
    headerText: 'text-blue-700 dark:text-blue-300',
    countBg: 'bg-blue-100 dark:bg-blue-900/40',
    countText: 'text-blue-700 dark:text-blue-300',
    itemBg: 'bg-blue-50/50 dark:bg-blue-900/10',
    itemRing: 'ring-blue-100 dark:ring-blue-900/30',
    textColor: 'text-gray-900 dark:text-white',
    qtyColor: 'text-gray-900 dark:text-white',
  },
  {
    key: 'matched',
    label: 'matched',
    icon: CheckCircle2,
    badgeVariant: 'success',
    badgeLabel: 'matched',
    ringColor: 'ring-emerald-200 dark:ring-emerald-800',
    headerBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    headerText: 'text-emerald-700 dark:text-emerald-300',
    countBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    countText: 'text-emerald-700 dark:text-emerald-300',
    itemBg: 'bg-white dark:bg-gray-800',
    itemRing: 'ring-emerald-100 dark:ring-emerald-900/30',
    textColor: 'text-gray-900 dark:text-white',
    qtyColor: 'text-gray-900 dark:text-white',
  },
  {
    key: 'zero_qty',
    label: 'zeroQty',
    icon: XCircle,
    badgeVariant: 'default',
    badgeLabel: 'qty = 0',
    ringColor: 'ring-gray-200 dark:ring-gray-700',
    headerBg: 'bg-gray-100 dark:bg-gray-800',
    headerText: 'text-gray-600 dark:text-gray-400',
    countBg: 'bg-gray-200 dark:bg-gray-700',
    countText: 'text-gray-600 dark:text-gray-300',
    itemBg: 'bg-gray-50 dark:bg-gray-800/50',
    itemRing: 'ring-gray-200 dark:ring-gray-700',
    textColor: 'text-gray-400 dark:text-gray-500',
    qtyColor: 'text-gray-300 dark:text-gray-600',
  },
];

const GROUP_LABEL_MAP: Record<string, string> = {
  new: 'txtUpload.newProducts',
  matched: 'txtUpload.matchedSystem',
  zeroQty: 'txtUpload.zeroQty',
};

const GROUP_BADGE_MAP: Record<string, string> = {
  new: 'txtUpload.badgeNew',
  matched: 'txtUpload.badgeMatched',
};

function GroupedPreview({
  classifiedItems,
  previewStats,
}: {
  classifiedItems: ClassifiedItem[];
  previewStats: { matched: number; new: number; zero: number };
}) {
  const t = useTranslations('stock');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    new: false,
    matched: false,
    zero_qty: false,
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getCount = (key: string) => {
    if (key === 'new') return previewStats.new;
    if (key === 'matched') return previewStats.matched;
    return previewStats.zero;
  };

  const getItems = (key: string) =>
    classifiedItems.filter((i) => i.status === key);

  return (
    <div className="space-y-3">
      {GROUP_CONFIGS.map((group) => {
        const count = getCount(group.key);
        if (count === 0) return null;

        const items = getItems(group.key);
        const isExpanded = expandedGroups[group.key];
        const Icon = group.icon;

        return (
          <div
            key={group.key}
            className={cn(
              'overflow-hidden rounded-xl ring-1 shadow-sm',
              group.ringColor
            )}
          >
            {/* Group Header — clickable */}
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={cn(
                'flex w-full items-center justify-between px-4 py-3 transition-colors',
                group.headerBg
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={cn('h-4.5 w-4.5', group.headerText)} />
                <span className={cn('text-sm font-semibold', group.headerText)}>
                  {t(GROUP_LABEL_MAP[group.label] || group.label)}
                </span>
                <span
                  className={cn(
                    'flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold',
                    group.countBg,
                    group.countText
                  )}
                >
                  {count}
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className={cn('h-5 w-5', group.headerText)} />
              ) : (
                <ChevronRight className={cn('h-5 w-5', group.headerText)} />
              )}
            </button>

            {/* Collapsible content */}
            {isExpanded && (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          #
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t('txtUpload.codeCol')}
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t('txtUpload.productNameCol')}
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t('txtUpload.quantityCol')}
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t('txtUpload.unitCol')}
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t('txtUpload.categoryCol')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {items.map((item, idx) => (
                        <tr
                          key={idx}
                          className={cn('transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/30', group.itemBg)}
                        >
                          <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">
                            {item.product_code}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className={cn('font-medium', group.textColor)}>
                              {item.product_name || '-'}
                            </p>
                            {item.existing_name &&
                              item.existing_name !== item.product_name && (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {t('txtUpload.systemLabel')}: {item.existing_name}
                                </p>
                              )}
                          </td>
                          <td className={cn('px-4 py-2.5 text-right font-medium', group.qtyColor)}>
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                            {item.unit || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                            {item.category || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="space-y-1.5 p-2 md:hidden">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'rounded-lg p-3 ring-1',
                        group.itemBg,
                        group.itemRing
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm font-medium', group.textColor)}>
                            {item.product_name || item.product_code}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                            <span className="font-mono">{item.product_code}</span>
                            {item.category && <span>{item.category}</span>}
                            {item.unit && <span>({item.unit})</span>}
                          </div>
                          {item.existing_name &&
                            item.existing_name !== item.product_name && (
                              <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                                {t('txtUpload.systemLabel')}: {item.existing_name}
                              </p>
                            )}
                        </div>
                        <span className={cn('text-lg font-bold', group.qtyColor)}>
                          {formatNumber(item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Component ──

const UPLOAD_ROLES = ['owner', 'manager', 'accountant'];

export default function TxtUploadPage() {
  const t = useTranslations('stock');
  const { user } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Role guard — เฉพาะ owner/manager/accountant เท่านั้น
  if (user && !UPLOAD_ROLES.includes(user.role)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <Upload className="h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('txtUpload.noPermission')}</p>
        <a href="/stock" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">{t('txtUpload.backToStock')}</a>
      </div>
    );
  }

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
  const [rawContent, setRawContent] = useState('');
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  // Auto-compare result
  const [autoCompareResult, setAutoCompareResult] =
    useState<AutoCompareResult | null>(null);
  const [comparingAuto, setComparingAuto] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Business date = yesterday (bars operate past midnight)
  const businessDate = yesterdayBangkok();

  // ── Check for existing POS upload on page load ──
  useEffect(() => {
    if (!currentStoreId) return;
    checkExistingPOSUpload(currentStoreId, businessDate).then(({ exists }) => {
      setDuplicateWarning(exists);
    });
  }, [currentStoreId, businessDate]);

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
          title: t('txtUpload.errorTitle'),
          message: t('txtUpload.errorClassify'),
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
          title: t('txtUpload.invalidFile'),
          message: t('txtUpload.onlyTxtAllowed'),
        });
        return;
      }

      setFileName(file.name);
      setParsing(true);
      setParseErrors([]);

      try {
        const content = await readTxtFile(file);
        setRawContent(content);
        const items = parseTxtContent(content);

        if (items.length === 0) {
          setParseErrors([
            t('txtUpload.noDataInFile'),
          ]);
          setParsing(false);
          return;
        }

        setParsedItems(items);

        // Check for duplicate POS upload for this date
        if (currentStoreId) {
          const { exists } = await checkExistingPOSUpload(
            currentStoreId,
            businessDate,
          );
          if (exists) {
            setDuplicateWarning(true);
          }
        }

        // Check for potential issues
        const errors: string[] = [];
        const noNameItems = items.filter((i) => !i.product_name);
        if (noNameItems.length > 0) {
          errors.push(
            t('txtUpload.noNameWarning', { count: noNameItems.length })
          );
        }
        const noUnitItems = items.filter((i) => !i.unit);
        if (noUnitItems.length > 0) {
          errors.push(
            t('txtUpload.noUnitWarning', { count: noUnitItems.length })
          );
        }
        setParseErrors(errors);

        // Classify items against existing products
        await classifyItems(items);
      } catch (error) {
        console.error('Error reading file:', error);
        toast({
          type: 'error',
          title: t('txtUpload.readFileFailed'),
          message: t('txtUpload.readFileFailedMsg'),
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
        title: t('txtUpload.noStore'),
        message: t('txtUpload.selectStoreFirst'),
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
          upload_date: businessDate,
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

      // Audit log
      await logAudit({
        store_id: currentStoreId,
        action_type: AUDIT_ACTIONS.STOCK_TXT_UPLOADED,
        table_name: 'ocr_logs',
        record_id: result.ocr_log_id,
        new_value: {
          upload_date: businessDate,
          file_name: fileName,
          total_items: result.summary.total_items,
          new_added: result.summary.new_added,
        },
      });

      toast({
        type: 'success',
        title: t('txtUpload.saveSuccess'),
        message: t('txtUpload.saveSuccessMsg', { count: result.summary.total_items }),
      });

      // Upload original TXT file to Supabase Storage (non-blocking)
      if (rawContent) {
        try {
          const supabase = createClient();
          const ts = Date.now();
          const rnd = Math.random().toString(36).substring(2, 8);
          const filePath = `pos-txt/${currentStoreId}/${ts}-${rnd}.txt`;
          const fileBlob = new Blob([rawContent], { type: 'text/plain; charset=utf-8' });

          const { data: uploadData } = await supabase.storage
            .from('deposit-photos')
            .upload(filePath, fileBlob, {
              contentType: 'text/plain; charset=utf-8',
              cacheControl: '31536000',
              upsert: false,
            });

          if (uploadData) {
            const { data: urlData } = supabase.storage
              .from('deposit-photos')
              .getPublicUrl(uploadData.path);

            const fileUrl = urlData.publicUrl;
            setUploadedFileUrl(fileUrl);

            await supabase
              .from('ocr_logs')
              .update({ file_urls: [fileUrl] })
              .eq('id', result.ocr_log_id);
          }
        } catch (uploadErr) {
          console.error('File upload error:', uploadErr);
          // Non-fatal — data already saved successfully
        }
      }

      // Auto-compare after save
      if (autoCompareAfterSave) {
        setComparingAuto(true);
        try {
          const compareResult = await runAutoCompare(
            currentStoreId,
            businessDate,
          );
          setAutoCompareResult(compareResult);

          if (compareResult.compared) {
            toast({
              type: 'success',
              title: t('txtUpload.autoCompareSuccess'),
              message: t('txtUpload.autoCompareSuccessMsg', { match: compareResult.summary?.match || 0, overTolerance: compareResult.summary?.over_tolerance || 0 }),
            });
          } else if (compareResult.reason === 'no_manual') {
            toast({
              type: 'info',
              title: t('txtUpload.waitingManual'),
              message: t('txtUpload.waitingManualMsg'),
            });
          }

          // Notify about supplementary items
          if (
            compareResult.missingItems &&
            compareResult.missingItems.length > 0
          ) {
            toast({
              type: 'warning',
              title: t('txtUpload.missingManualItems'),
              message: t('txtUpload.missingManualItemsMsg', { count: compareResult.missingItems.length }),
            });
          }
        } catch (err) {
          console.error('Auto-compare error:', err);
          toast({
            type: 'warning',
            title: t('txtUpload.autoCompareFailed'),
            message: t('txtUpload.autoCompareFailedMsg'),
          });
        } finally {
          setComparingAuto(false);
        }
      }
    } catch (error) {
      console.error('Error saving TXT data:', error);
      toast({
        type: 'error',
        title: t('txtUpload.saveFailed'),
        message:
          error instanceof Error
            ? error.message
            : t('txtUpload.saveFailedMsg'),
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
    setAutoCompareResult(null);
    setDuplicateWarning(false);
    setRawContent('');
    setUploadedFileUrl(null);
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
      {/* Duplicate upload warning — shown on page load */}
      {duplicateWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {t('txtUpload.duplicateWarningTitle')}
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                {t('txtUpload.duplicateWarningDetail', { date: formatThaiDate(businessDate) })}
              </p>
            </div>
          </div>
        </div>
      )}

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
                ? t('txtUpload.dropToUpload')
                : parsing
                  ? t('txtUpload.readingFile')
                  : t('txtUpload.dragOrClick')}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('txtUpload.supportedFormats')}
            </p>
          </div>
        </div>
      </div>

      {/* File format guide */}
      <Card>
        <CardHeader title={t('txtUpload.fileFormatTitle')} />
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('txtUpload.fileFormatDesc')}
            </p>
            <div className="overflow-x-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
              <code className="whitespace-pre text-xs text-gray-700 dark:text-gray-300">
                {`${t('txtUpload.codeCol')}\t${t('txtUpload.productNameCol')}\t${t('txtUpload.quantityCol')}\t${t('txtUpload.unitCol')}\t${t('txtUpload.categoryCol')}\n`}
                {`B001\t${t('txtUpload.sampleBeer')}\t24\t${t('txtUpload.sampleBottle')}\t${t('txtUpload.sampleBeerCat')}\n`}
                {`W001\t${t('txtUpload.sampleWine')}\t5\t${t('txtUpload.sampleBottle')}\t${t('txtUpload.sampleWineCat')}\n`}
                {`S001\t${t('txtUpload.sampleSpirit')}\t0\t${t('txtUpload.sampleBottle')}\t${t('txtUpload.sampleSpiritCat')}`}
              </code>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                {t('txtUpload.col1')}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {t('txtUpload.col2')}
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {t('txtUpload.col3')}
              </span>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                {t('txtUpload.col4')}
              </span>
              <span className="rounded-full bg-pink-50 px-2 py-0.5 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
                {t('txtUpload.col5')}
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
              {t('txtUpload.fileItemCount', { count: parsedItems.length, date: formatThaiDate(businessDate) })}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={handleReset}
        >
          {t('txtUpload.changeFile')}
        </Button>
      </div>

      {/* Duplicate upload warning */}
      {duplicateWarning && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-300">
                {t('txtUpload.duplicatePreviewTitle')}
              </p>
              <p className="text-xs text-red-700 dark:text-red-400">
                {t('txtUpload.duplicatePreviewDetail', { date: formatThaiDate(businessDate) })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Parse warnings */}
      {parseErrors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t('txtUpload.parseWarnings')}
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
            {t('txtUpload.matchedSystem')}
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 px-3 py-3 text-center dark:bg-blue-900/20">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
            {previewStats.new}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-500">
            {t('txtUpload.newProducts')}
          </p>
        </div>
        <div className="rounded-xl bg-gray-100 px-3 py-3 text-center dark:bg-gray-700">
          <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
            {previewStats.zero}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            {t('txtUpload.zeroQty')}
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {t('txtUpload.options')}
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={includeZeroQty}
            onChange={(e) => setIncludeZeroQty(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
          />
          <span className="text-gray-700 dark:text-gray-300">
            {t('txtUpload.includeZeroQty')}
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
            {t('txtUpload.autoCompareAfterSave')}
          </span>
        </label>
      </div>

      {/* Grouped collapsible sections */}
      <GroupedPreview classifiedItems={classifiedItems} previewStats={previewStats} />

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">
              {classifiedItems.length}
            </span>{' '}
            {t('txtUpload.itemsLabel')}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={handleReset}
            >
              {t('txtUpload.startOver')}
            </Button>
            <Button
              size="sm"
              icon={<CheckCircle2 className="h-4 w-4" />}
              isLoading={saving}
              onClick={() => {
                if (duplicateWarning) {
                  setShowOverwriteConfirm(true);
                } else {
                  handleSave();
                }
              }}
            >
              {duplicateWarning ? t('txtUpload.overwriteSave') : t('txtUpload.saveData')}
            </Button>
          </div>
        </div>
      </div>

      {/* Overwrite confirmation dialog */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('txtUpload.confirmOverwrite')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('txtUpload.overwriteConfirmDetail', { date: formatThaiDate(businessDate) })}
              </p>
              <div className="mt-2 flex w-full gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowOverwriteConfirm(false)}
                >
                  {t('txtUpload.cancel')}
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  isLoading={saving}
                  onClick={() => {
                    setShowOverwriteConfirm(false);
                    handleSave();
                  }}
                >
                  {t('txtUpload.confirmReplace')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── Render: Result Step ──
  const renderResultStep = () => {
    if (!summary) return null;

    const resultCards = [
      {
        label: t('txtUpload.totalLabel'),
        value: summary.total_items,
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        text: 'text-blue-700 dark:text-blue-400',
        subText: 'text-blue-600 dark:text-blue-500',
      },
      {
        label: t('txtUpload.matchedLabel'),
        value: summary.matched,
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        text: 'text-emerald-700 dark:text-emerald-400',
        subText: 'text-emerald-600 dark:text-emerald-500',
      },
      {
        label: t('txtUpload.newAdded'),
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
        label: t('txtUpload.deactivated'),
        value: summary.deactivated,
        bg: 'bg-red-50 dark:bg-red-900/20',
        text: 'text-red-700 dark:text-red-400',
        subText: 'text-red-600 dark:text-red-500',
      },
      {
        label: t('txtUpload.reactivated'),
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
              {t('txtUpload.importSuccess')}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              {t('txtUpload.fileImported', { file: fileName, date: formatThaiDate(businessDate) })}
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
          <CardHeader title={t('txtUpload.importSummary')} />
          <CardContent>
            <div className="space-y-3">
              {summary.new_added > 0 && (
                <div className="flex items-start gap-2">
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {t('txtUpload.newAddedDetail', { count: summary.new_added })}
                  </p>
                </div>
              )}
              {summary.deactivated > 0 && (
                <div className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {t('txtUpload.deactivatedDetail', { count: summary.deactivated })}
                  </p>
                </div>
              )}
              {summary.reactivated > 0 && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {t('txtUpload.reactivatedDetail', { count: summary.reactivated })}
                  </p>
                </div>
              )}
              {summary.new_added === 0 &&
                summary.deactivated === 0 &&
                summary.reactivated === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('txtUpload.noChanges')}
                  </p>
                )}
            </div>
          </CardContent>
        </Card>

        {/* Auto-compare result */}
        {comparingAuto && (
          <div className="flex items-center gap-2 rounded-xl bg-indigo-50 p-4 dark:bg-indigo-900/20">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm text-indigo-700 dark:text-indigo-300">
              {t('txtUpload.autoComparing')}
            </span>
          </div>
        )}

        {autoCompareResult?.compared && (
          <Card>
            <CardHeader title={t('txtUpload.autoCompareResultTitle')} />
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center dark:bg-emerald-900/20">
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {autoCompareResult.summary?.match || 0}
                  </p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
                    {t('txtUpload.matchedLabel')}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-center dark:bg-amber-900/20">
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {autoCompareResult.summary?.within_tolerance || 0}
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500">
                    {t('txtUpload.withinTolerance')}
                  </p>
                </div>
                <div className="rounded-lg bg-red-50 px-3 py-2 text-center dark:bg-red-900/20">
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">
                    {autoCompareResult.summary?.over_tolerance || 0}
                  </p>
                  <p className="text-[10px] text-red-600 dark:text-red-500">
                    {t('txtUpload.overTolerance')}
                  </p>
                </div>
              </div>
              {autoCompareResult.missingItems &&
                autoCompareResult.missingItems.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t('txtUpload.foundMissingItems', { count: autoCompareResult.missingItems.length })}
                      {t('txtUpload.staffNotCountedYet')}
                    </p>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {autoCompareResult && !autoCompareResult.compared && (
          <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
            <AlertTriangle className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {autoCompareResult.reason === 'no_manual'
                ? t('txtUpload.waitingManualMsg')
                : t('txtUpload.cannotAutoCompare')}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/stock/comparison" className="flex-1">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              icon={<BarChart3 className="h-5 w-5" />}
            >
              {t('txtUpload.viewComparison')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </a>
          {uploadedFileUrl && (
            <a href={uploadedFileUrl} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                size="lg"
                icon={<FileText className="h-5 w-5" />}
              >
                {t('txtUpload.viewOriginalFile')}
              </Button>
            </a>
          )}
          <Button
            variant="outline"
            size="lg"
            icon={<RotateCcw className="h-5 w-5" />}
            onClick={handleReset}
          >
            {t('txtUpload.uploadNewFile')}
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
              {t('txtUpload.title')}
            </h1>
          </div>
          <p className="mt-0.5 ml-9 text-sm text-gray-500 dark:text-gray-400">
            {step === 'upload' && t('txtUpload.stepUploadDesc')}
            {step === 'preview' && t('txtUpload.stepPreviewDesc', { date: formatThaiDate(businessDate) })}
            {step === 'result' && t('txtUpload.stepResultDesc')}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { key: 'upload', label: t('txtUpload.stepUpload') },
          { key: 'preview', label: t('txtUpload.stepPreview') },
          { key: 'result', label: t('txtUpload.stepResult') },
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
