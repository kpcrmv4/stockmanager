'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { useInstallPWA } from '@/hooks/use-install-pwa';
import { cn } from '@/lib/utils/cn';
import {
  Printer,
  Download,
  CheckCircle2,
  ChevronRight,
  Monitor,
  Wifi,
  Settings,
  ArrowLeft,
  ClipboardCopy,
  Check,
  AlertCircle,
  ExternalLink,
  Play,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  store_name: string;
  store_code: string;
}

type SetupStep = 'store' | 'install' | 'printer' | 'test' | 'done';

// STEPS labels moved inside component for i18n

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const STEP_KEYS: SetupStep[] = ['store', 'install', 'printer', 'test', 'done'];

export default function PrinterSetupPage() {
  const t = useTranslations('printSetup');
  const supabase = useRef(createClient()).current;
  const { user } = useAuthStore();
  const { currentStoreId, setCurrentStoreId } = useAppStore();
  const { canInstall, isInstalled, isInstalling, install } = useInstallPWA();

  const STEPS: { key: SetupStep; label: string }[] = [
    { key: 'store', label: t('stepStore') },
    { key: 'install', label: t('stepInstall') },
    { key: 'printer', label: t('stepPrinter') },
    { key: 'test', label: t('stepTest') },
    { key: 'done', label: t('stepDone') },
  ];

  const [currentStep, setCurrentStep] = useState<SetupStep>('store');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(currentStoreId || '');
  const [selectedStoreName, setSelectedStoreName] = useState('');
  const [testResult, setTestResult] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch user's stores
  // -----------------------------------------------------------------------

  const fetchStores = useCallback(async () => {
    if (!user) return;
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
      setStores(list);

      // Pre-select if currentStoreId is set
      if (currentStoreId) {
        const found = list.find((s) => s.id === currentStoreId);
        if (found) {
          setSelectedStoreId(found.id);
          setSelectedStoreName(found.store_name);
        }
      }
    }
  }, [user, supabase, currentStoreId]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // -----------------------------------------------------------------------
  // Step handlers
  // -----------------------------------------------------------------------

  const handleSelectStore = (store: StoreOption) => {
    setSelectedStoreId(store.id);
    setSelectedStoreName(store.store_name);
    setCurrentStoreId(store.id);
  };

  const handleInstallPWA = async () => {
    await install();
  };

  const handleTestPrint = async () => {
    if (!selectedStoreId || !user) return;
    setTestResult('sending');

    const payload = {
      deposit_code: 'TEST-0000',
      customer_name: 'ทดสอบระบบ',
      customer_phone: null,
      product_name: 'ทดสอบพิมพ์',
      category: null,
      quantity: 1,
      remaining_qty: 1,
      table_number: null,
      expiry_date: null,
      created_at: new Date().toISOString(),
      store_name: selectedStoreName,
      received_by_name: null,
    };

    const { error } = await supabase.from('print_queue').insert({
      store_id: selectedStoreId,
      deposit_id: null,
      job_type: 'receipt',
      status: 'pending',
      copies: 1,
      payload,
      requested_by: user.id,
    });

    setTestResult(error ? 'error' : 'success');
  };

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/print-station`;
    await navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const goNext = () => {
    const idx = STEPS.findIndex((s) => s.key === currentStep);
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1].key);
  };

  const goPrev = () => {
    const idx = STEPS.findIndex((s) => s.key === currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1].key);
  };

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/print-station"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToPrintStation')}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Settings className="h-5 w-5" />
          {t('title')}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {t('subtitle')}
        </p>
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex flex-1 items-center">
            <button
              onClick={() => setCurrentStep(step.key)}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                i < stepIndex
                  ? 'bg-emerald-500 text-white'
                  : i === stepIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
              )}
            >
              {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-1 h-0.5 flex-1',
                  i < stepIndex
                    ? 'bg-emerald-500'
                    : 'bg-gray-200 dark:bg-gray-700',
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Labels */}
      <div className="flex">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex-1 text-center">
            <span
              className={cn(
                'text-[10px]',
                i === stepIndex
                  ? 'font-medium text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-500',
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        {/* ============ STEP 1: เลือกสาขา ============ */}
        {currentStep === 'store' && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{t('selectStoreTitle')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('selectStoreDesc')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border-2 p-4 text-left transition-colors',
                    selectedStoreId === store.id
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500',
                  )}
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{store.store_name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{store.store_code}</p>
                  </div>
                  {selectedStoreId === store.id && (
                    <CheckCircle2 className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                  )}
                </button>
              ))}

              {stores.length === 0 && (
                <div className="flex flex-col items-center py-8 text-gray-400">
                  <AlertCircle className="mb-2 h-8 w-8" />
                  <p className="text-sm">{t('noStoreAccess')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ STEP 2: ติดตั้งแอปและตั้งค่าเปิดอัตโนมัติ ============ */}
        {currentStep === 'install' && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{t('installTitle')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('installDesc')}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* --- ส่วนที่ 1: ติดตั้ง PWA --- */}
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                  {t('installPwaStep')}
                </h3>

                {isInstalled ? (
                  <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">{t('installed')}</span>
                    </div>
                    <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-500">
                      {t('installedDesc')}
                    </p>
                  </div>
                ) : canInstall ? (
                  <div className="space-y-3">
                    <button
                      onClick={handleInstallPWA}
                      disabled={isInstalling}
                      className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white transition-colors',
                        'bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60',
                      )}
                    >
                      <Download className="h-5 w-5" />
                      {isInstalling ? t('installing') : t('installButton')}
                    </button>
                    <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                      {t('installPopupHint')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                      <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{t('cannotAutoInstall')}</p>
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                            {t('manualInstallHint')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* --- ส่วนที่ 2: ตั้งค่าเปิดอัตโนมัติ --- */}
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
                  {t('autoStartStep')}
                </h3>

                {isInstalled ? (
                  <>
                    {/* วิธีสำหรับ PWA ที่ติดตั้งแล้ว */}
                    <ol className="space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">1</span>
                        <span>
                          กดปุ่ม <strong>Win + R</strong> → พิมพ์ <code className="rounded bg-gray-200 px-1.5 py-0.5 text-xs dark:bg-gray-700">shell:startup</code> → กด Enter
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">2</span>
                        <span>
                          หา shortcut ของแอป <strong>StockManager</strong> ที่ Desktop → <strong>คลิกขวา → Copy</strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">3</span>
                        <span>
                          กลับไปที่ folder Startup → <strong>คลิกขวา → Paste shortcut</strong>
                        </span>
                      </li>
                    </ol>
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        {t('autoStartDone')}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* วิธีสำหรับ Chrome (ยังไม่ได้ติดตั้ง PWA) */}
                    <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                      {t('notInstalledHint')}
                    </p>
                    <ol className="space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">1</span>
                        <span>
                          เปิด Chrome → Settings → <strong>On startup</strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">2</span>
                        <span>
                          เลือก <strong>&quot;Open a specific page or set of pages&quot;</strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">3</span>
                        <span>
                          กด <strong>&quot;Add a new page&quot;</strong> → วาง URL ด้านล่าง
                        </span>
                      </li>
                    </ol>

                    <div className="mt-3 flex items-center gap-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">URL:</p>
                      <button
                        onClick={handleCopyUrl}
                        className="flex items-center gap-1.5 rounded-md bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            {t('copied')}
                          </>
                        ) : (
                          <>
                            <ClipboardCopy className="h-3 w-3" />
                            {t('copyUrl')}
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Important note */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t('sessionWarning')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============ STEP 3: ต่อเครื่องปริ้น ============ */}
        {currentStep === 'printer' && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{t('printerTitle')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('printerDesc')}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* USB Printer */}
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    USB
                  </span>
                  {t('usbRecommended')}
                </h3>
                <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">1</span>
                    <span>เสียบสาย USB เครื่องปริ้นกับคอม</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">2</span>
                    <span>ลง driver เครื่องปริ้น (ถ้ามี CD หรือดาวน์โหลดจากเว็บ)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">3</span>
                    <span>
                      เปิด <strong>Settings → Printers & scanners</strong> → ตั้งเครื่องปริ้นเป็น <strong>Default</strong>
                    </span>
                  </li>
                </ol>
              </div>

              {/* Bluetooth Printer */}
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                    BT
                  </span>
                  {t('btPrinter')}
                </h3>
                <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">1</span>
                    <span>เปิด Bluetooth ที่คอมและเครื่องปริ้น</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">2</span>
                    <span>Pair เครื่องปริ้นใน <strong>Settings → Bluetooth</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">3</span>
                    <span>ตั้งเป็น <strong>Default printer</strong></span>
                  </li>
                </ol>
              </div>

              {/* Tip */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {t('printerTip')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============ STEP 4: ทดสอบ ============ */}
        {currentStep === 'test' && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">{t('testTitle')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('testDesc')}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('testSteps')}
                </h3>
                <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">1</span>
                    <span>
                      เปิดหน้า <strong>Print Station</strong> บนคอมเครื่องนี้ (หรือเปิด tab ใหม่)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">2</span>
                    <span>ดูว่าสถานะเป็น <span className="font-medium text-emerald-600">&quot;เชื่อมต่อแล้ว&quot;</span></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">3</span>
                    <span>กดปุ่ม &quot;ส่งงานพิมพ์ทดสอบ&quot; ด้านล่าง</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">4</span>
                    <span>ใบเสร็จทดสอบควรปริ้นออกมาจากเครื่องปริ้น</span>
                  </li>
                </ol>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleTestPrint}
                  disabled={testResult === 'sending' || !selectedStoreId}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white transition-colors',
                    'bg-teal-600 hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  <Printer className="h-5 w-5" />
                  {testResult === 'sending' ? t('sending') : t('sendTestPrint')}
                </button>

                {testResult === 'success' && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('testSuccess')}
                  </div>
                )}

                {testResult === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {t('testError')}
                  </div>
                )}
              </div>

              <Link
                href="/print-station"
                target="_blank"
                className="flex items-center justify-center gap-2 text-sm text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ExternalLink className="h-4 w-4" />
                {t('openPrintStation')}
              </Link>
            </div>
          </div>
        )}

        {/* ============ STEP 5: เสร็จสิ้น ============ */}
        {currentStep === 'done' && (
          <div className="p-6">
            <div className="flex flex-col items-center py-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('doneTitle')}</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('doneDesc', { store: selectedStoreName })}
              </p>

              <div className="mt-6 space-y-3">
                <Link
                  href="/print-station"
                  className="flex w-64 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Printer className="h-5 w-5" />
                  {t('openStation')}
                </Link>
              </div>

              <div className="mt-8 rounded-lg bg-gray-50 p-4 text-left dark:bg-gray-900/50">
                <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('setupSummary')}
                </h3>
                <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    {t('stepStore')}: <strong>{selectedStoreName}</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    {isInstalled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    {isInstalled ? t('summaryAppInstalled') : t('summaryAppChrome')}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    {t('summaryReady')}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ============ Navigation Buttons ============ */}
        {currentStep !== 'done' && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            <button
              onClick={goPrev}
              disabled={stepIndex === 0}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700',
                'disabled:invisible',
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              {t('goBack')}
            </button>

            <button
              onClick={goNext}
              disabled={currentStep === 'store' && !selectedStoreId}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors',
                'bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {stepIndex === STEPS.length - 2 ? t('finish') : t('nextStep')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
