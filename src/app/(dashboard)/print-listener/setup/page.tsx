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
  Smartphone,
  ClipboardCopy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id: string;
  store_name: string;
  store_code: string;
}

type SetupStep = 'store' | 'pwa' | 'printer' | 'autostart' | 'test' | 'done';

const STEPS: { key: SetupStep; label: string }[] = [
  { key: 'store', label: 'เลือกสาขา' },
  { key: 'pwa', label: 'ติดตั้งแอป' },
  { key: 'printer', label: 'ต่อเครื่องปริ้น' },
  { key: 'autostart', label: 'เปิดอัตโนมัติ' },
  { key: 'test', label: 'ทดสอบ' },
  { key: 'done', label: 'เสร็จสิ้น' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrinterSetupPage() {
  const supabase = useRef(createClient()).current;
  const { user } = useAuthStore();
  const { currentStoreId, setCurrentStoreId } = useAppStore();
  const { canInstall, isInstalled, isInstalling, install } = useInstallPWA();

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
    const url = `${window.location.origin}/print-listener`;
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
          href="/print-listener"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไป Print Listener
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Settings className="h-5 w-5" />
          ตั้งค่าเครื่องปริ้น
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          ตั้งค่าคอมพิวเตอร์ที่บาร์ให้พร้อมรับงานพิมพ์อัตโนมัติ
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
                <h2 className="font-semibold text-gray-900 dark:text-white">เลือกสาขาสำหรับเครื่องนี้</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  คอมพิวเตอร์เครื่องนี้จะรับงานพิมพ์เฉพาะสาขาที่เลือก
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">รหัส: {store.store_code}</p>
                  </div>
                  {selectedStoreId === store.id && (
                    <CheckCircle2 className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                  )}
                </button>
              ))}

              {stores.length === 0 && (
                <div className="flex flex-col items-center py-8 text-gray-400">
                  <AlertCircle className="mb-2 h-8 w-8" />
                  <p className="text-sm">ไม่พบสาขาที่คุณมีสิทธิ์เข้าถึง</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ STEP 2: ติดตั้ง PWA ============ */}
        {currentStep === 'pwa' && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">ติดตั้งเป็นแอปบนคอมพิวเตอร์</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ติดตั้ง StockManager เป็นแอปเพื่อให้ใช้งานได้สะดวกขึ้น
                </p>
              </div>
            </div>

            {isInstalled ? (
              <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-900/20">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">ติดตั้งแล้ว!</span>
                </div>
                <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-500">
                  StockManager ถูกติดตั้งเป็นแอปบนเครื่องนี้แล้ว
                </p>
              </div>
            ) : canInstall ? (
              <div className="space-y-4">
                <button
                  onClick={handleInstallPWA}
                  disabled={isInstalling}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white transition-colors',
                    'bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  <Download className="h-5 w-5" />
                  {isInstalling ? 'กำลังติดตั้ง...' : 'ติดตั้ง StockManager'}
                </button>
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                  คลิกปุ่มด้านบน แล้วกด &quot;ติดตั้ง&quot; ในป๊อปอัพที่ขึ้นมา
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
                  <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">ไม่สามารถติดตั้งอัตโนมัติได้</p>
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        กรุณาติดตั้งด้วยตนเองตามขั้นตอนด้านล่าง
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    วิธีติดตั้งด้วยตนเอง (Chrome):
                  </h3>
                  <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        1
                      </span>
                      <span>
                        คลิกไอคอน <strong>ติดตั้ง</strong> (รูปจอ + ลูกศร) ที่ address bar ด้านขวา
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        2
                      </span>
                      <span>หรือคลิก <strong>เมนู ⋮</strong> → <strong>&quot;ติดตั้ง StockManager...&quot;</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        3
                      </span>
                      <span>กดปุ่ม <strong>&quot;ติดตั้ง&quot;</strong> ในป๊อปอัพที่ขึ้นมา</span>
                    </li>
                  </ol>
                </div>
              </div>
            )}
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
                <h2 className="font-semibold text-gray-900 dark:text-white">ต่อเครื่องปริ้นกับคอมพิวเตอร์</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ต่อ USB หรือ Bluetooth แล้วตั้งเป็น default printer
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
                  เครื่องปริ้น USB (แนะนำ)
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
                  เครื่องปริ้น Bluetooth
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
                  <strong>Tip:</strong> แนะนำเครื่องปริ้นความร้อน (thermal printer) ขนาด 80mm เช่น Epson TM-T82, Xprinter XP-80C
                  เพราะไม่ต้องเปลี่ยนหมึก และปริ้นเร็ว
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============ STEP 4: เปิดอัตโนมัติ ============ */}
        {currentStep === 'autostart' && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">ตั้งค่าเปิดอัตโนมัติ</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  เมื่อเปิดคอม Print Listener จะเปิดขึ้นมาเอง
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Method: PWA Shortcut in Startup */}
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  วิธีที่ 1: ใส่ shortcut ใน Startup (แนะนำ)
                </h3>
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
                      หา shortcut ของแอป <strong>StockManager</strong> ที่ Desktop → ลากไปวางใน folder Startup
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">3</span>
                    <span>ทดสอบ: รีสตาร์ทคอม → แอปควรเปิดขึ้นมาเอง</span>
                  </li>
                </ol>
              </div>

              {/* Method: Chrome Restore Tabs */}
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  วิธีที่ 2: ให้ Chrome เปิดหน้าเดิม
                </h3>
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
                      เลือก <strong>&quot;Continue where you left off&quot;</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">3</span>
                    <span>เปิดหน้า Print Listener ไว้ → เวลาเปิดคอมใหม่ Chrome จะกลับมาหน้าเดิม</span>
                  </li>
                </ol>

                <div className="mt-3 flex items-center gap-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">URL หน้า Print Listener:</p>
                  <button
                    onClick={handleCopyUrl}
                    className="flex items-center gap-1.5 rounded-md bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        คัดลอกแล้ว
                      </>
                    ) : (
                      <>
                        <ClipboardCopy className="h-3 w-3" />
                        คัดลอก URL
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Important note */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>สำคัญ:</strong> เมื่อแอปเปิดขึ้นมาอัตโนมัติ ต้องแน่ใจว่า session ยังไม่หมดอายุ
                  (login ค้างไว้) ถ้า session หมดอายุ ระบบจะพาไปหน้า login ให้เข้าระบบใหม่
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============ STEP 5: ทดสอบ ============ */}
        {currentStep === 'test' && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">ทดสอบระบบ</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ส่งงานพิมพ์ทดสอบไปที่เครื่องปริ้น
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  ขั้นตอนทดสอบ:
                </h3>
                <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">1</span>
                    <span>
                      เปิดหน้า <strong>Print Listener</strong> บนคอมเครื่องนี้ (หรือเปิด tab ใหม่)
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
                  {testResult === 'sending' ? 'กำลังส่ง...' : 'ส่งงานพิมพ์ทดสอบ'}
                </button>

                {testResult === 'success' && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    ส่งงานพิมพ์ทดสอบแล้ว! ตรวจสอบที่หน้า Print Listener
                  </div>
                )}

                {testResult === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง
                  </div>
                )}
              </div>

              <Link
                href="/print-listener"
                target="_blank"
                className="flex items-center justify-center gap-2 text-sm text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ExternalLink className="h-4 w-4" />
                เปิดหน้า Print Listener ใน tab ใหม่
              </Link>
            </div>
          </div>
        )}

        {/* ============ STEP 6: เสร็จสิ้น ============ */}
        {currentStep === 'done' && (
          <div className="p-6">
            <div className="flex flex-col items-center py-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">ตั้งค่าเสร็จเรียบร้อย!</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                เครื่องนี้พร้อมรับงานพิมพ์สำหรับสาขา <strong className="text-gray-700 dark:text-gray-300">{selectedStoreName}</strong> แล้ว
              </p>

              <div className="mt-6 space-y-3">
                <Link
                  href="/print-listener"
                  className="flex w-64 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Printer className="h-5 w-5" />
                  เปิด Print Listener
                </Link>
              </div>

              <div className="mt-8 rounded-lg bg-gray-50 p-4 text-left dark:bg-gray-900/50">
                <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  สรุปการตั้งค่า:
                </h3>
                <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    สาขา: <strong>{selectedStoreName}</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    {isInstalled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    PWA: {isInstalled ? 'ติดตั้งแล้ว' : 'ยังไม่ได้ติดตั้ง'}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ระบบพร้อมรับงานพิมพ์
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
              ย้อนกลับ
            </button>

            <button
              onClick={goNext}
              disabled={currentStep === 'store' && !selectedStoreId}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors',
                'bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {stepIndex === STEPS.length - 2 ? 'เสร็จสิ้น' : 'ถัดไป'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
