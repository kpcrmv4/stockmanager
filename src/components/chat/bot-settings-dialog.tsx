'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import {
  Modal,
  ModalFooter,
  Button,
  toast,
} from '@/components/ui';
import {
  Loader2,
  Wine,
  GlassWater,
  Package,
  ArrowLeftRight,
  Truck,
  BarChart3,
} from 'lucide-react';

interface BotSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BotSettings {
  chat_bot_deposit_enabled: boolean;
  chat_bot_withdrawal_enabled: boolean;
  chat_bot_stock_enabled: boolean;
  chat_bot_borrow_enabled: boolean;
  chat_bot_transfer_enabled: boolean;
  chat_bot_timeout_deposit: number;
  chat_bot_timeout_withdrawal: number;
  chat_bot_timeout_stock: number;
  chat_bot_timeout_borrow: number;
  chat_bot_timeout_transfer: number;
  chat_bot_priority_deposit: string;
  chat_bot_priority_withdrawal: string;
  chat_bot_priority_stock: string;
  chat_bot_priority_borrow: string;
  chat_bot_priority_transfer: string;
  chat_bot_daily_summary_enabled: boolean;
}

const DEFAULTS: BotSettings = {
  chat_bot_deposit_enabled: true,
  chat_bot_withdrawal_enabled: true,
  chat_bot_stock_enabled: true,
  chat_bot_borrow_enabled: true,
  chat_bot_transfer_enabled: true,
  chat_bot_timeout_deposit: 15,
  chat_bot_timeout_withdrawal: 15,
  chat_bot_timeout_stock: 60,
  chat_bot_timeout_borrow: 30,
  chat_bot_timeout_transfer: 120,
  chat_bot_priority_deposit: 'normal',
  chat_bot_priority_withdrawal: 'normal',
  chat_bot_priority_stock: 'normal',
  chat_bot_priority_borrow: 'normal',
  chat_bot_priority_transfer: 'normal',
  chat_bot_daily_summary_enabled: true,
};

const COLUMNS = Object.keys(DEFAULTS).join(', ');

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'เร่งด่วน' },
  { value: 'normal', label: 'ปกติ' },
  { value: 'low', label: 'ต่ำ' },
];

export function BotSettingsDialog({ isOpen, onClose }: BotSettingsDialogProps) {
  const { currentStoreId } = useAppStore();
  const [settings, setSettings] = useState<BotSettings>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('store_settings')
      .select(COLUMNS)
      .eq('store_id', currentStoreId)
      .single();

    if (data) {
      setSettings({ ...DEFAULTS, ...(data as Partial<BotSettings>) });
    } else {
      setSettings(DEFAULTS);
    }
    setIsLoading(false);
  }, [currentStoreId]);

  useEffect(() => {
    if (isOpen) loadSettings();
  }, [isOpen, loadSettings]);

  const handleSave = async () => {
    if (!currentStoreId) return;
    setIsSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('store_settings')
      .upsert(
        { store_id: currentStoreId, ...settings },
        { onConflict: 'store_id' }
      );

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด' });
    } else {
      toast({ type: 'success', title: 'บันทึกสำเร็จ' });
      onClose();
    }
    setIsSaving(false);
  };

  const toggle = (key: keyof BotSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setNumber = (key: keyof BotSettings, value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num > 0) {
      setSettings((prev) => ({ ...prev, [key]: num }));
    }
  };

  const setPriority = (key: keyof BotSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ตั้งค่าบอทแชท" description="กำหนดการแจ้งเตือนอัตโนมัติของแต่ละประเภทงาน" size="md">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Hint */}
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
            <p><strong>Timeout</strong> — เวลาที่ให้พนักงานทำงานให้เสร็จหลังกดรับ ถ้าเกินเวลาจะปล่อยงานให้คนอื่นรับต่อได้</p>
            <p className="mt-1"><strong>ความสำคัญ</strong> — กำหนดลำดับความสำคัญของการ์ด: <span className="text-red-500">เร่งด่วน</span> จะแสดงขอบแดงเด่นชัด, <span>ปกติ</span> แสดงตามปกติ, <span className="text-gray-400">ต่ำ</span> แสดงจางลง</p>
          </div>

          {/* Deposit */}
          <BotTypeSection
            icon={<Wine className="h-4 w-4 text-purple-500" />}
            label="ฝากเหล้า"
            description="แจ้งเตือนเมื่อมีรายการฝากใหม่"
            enabled={settings.chat_bot_deposit_enabled}
            onToggle={() => toggle('chat_bot_deposit_enabled')}
            timeout={settings.chat_bot_timeout_deposit}
            onTimeoutChange={(v) => setNumber('chat_bot_timeout_deposit', v)}
            priority={settings.chat_bot_priority_deposit}
            onPriorityChange={(v) => setPriority('chat_bot_priority_deposit', v)}
          />

          {/* Withdrawal */}
          <BotTypeSection
            icon={<GlassWater className="h-4 w-4 text-blue-500" />}
            label="เบิกเหล้า"
            description="แจ้งเตือนเมื่อลูกค้าขอเบิก"
            enabled={settings.chat_bot_withdrawal_enabled}
            onToggle={() => toggle('chat_bot_withdrawal_enabled')}
            timeout={settings.chat_bot_timeout_withdrawal}
            onTimeoutChange={(v) => setNumber('chat_bot_timeout_withdrawal', v)}
            priority={settings.chat_bot_priority_withdrawal}
            onPriorityChange={(v) => setPriority('chat_bot_priority_withdrawal', v)}
          />

          {/* Stock */}
          <BotTypeSection
            icon={<Package className="h-4 w-4 text-amber-500" />}
            label="สต๊อก"
            description="แจ้งเตือนเมื่อสต๊อกไม่ตรง"
            enabled={settings.chat_bot_stock_enabled}
            onToggle={() => toggle('chat_bot_stock_enabled')}
            timeout={settings.chat_bot_timeout_stock}
            onTimeoutChange={(v) => setNumber('chat_bot_timeout_stock', v)}
            priority={settings.chat_bot_priority_stock}
            onPriorityChange={(v) => setPriority('chat_bot_priority_stock', v)}
          />

          {/* Borrow */}
          <BotTypeSection
            icon={<ArrowLeftRight className="h-4 w-4 text-emerald-500" />}
            label="ยืมสินค้า"
            description="แจ้งเตือนเมื่อมีคำขอยืมข้ามสาขา"
            enabled={settings.chat_bot_borrow_enabled}
            onToggle={() => toggle('chat_bot_borrow_enabled')}
            timeout={settings.chat_bot_timeout_borrow}
            onTimeoutChange={(v) => setNumber('chat_bot_timeout_borrow', v)}
            priority={settings.chat_bot_priority_borrow}
            onPriorityChange={(v) => setPriority('chat_bot_priority_borrow', v)}
          />

          {/* Transfer */}
          <BotTypeSection
            icon={<Truck className="h-4 w-4 text-orange-500" />}
            label="โอนสต๊อก"
            description="แจ้งเตือนเมื่อมีการโอนเข้าคลังกลาง"
            enabled={settings.chat_bot_transfer_enabled}
            onToggle={() => toggle('chat_bot_transfer_enabled')}
            timeout={settings.chat_bot_timeout_transfer}
            onTimeoutChange={(v) => setNumber('chat_bot_timeout_transfer', v)}
            priority={settings.chat_bot_priority_transfer}
            onPriorityChange={(v) => setPriority('chat_bot_priority_transfer', v)}
          />

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700" />

          {/* Daily Summary */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    สรุปประจำวัน
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ส่งทุกวัน 06:00 (นับ 11:00-06:00)
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={settings.chat_bot_daily_summary_enabled}
                onChange={() => toggle('chat_bot_daily_summary_enabled')}
              />
            </div>
          </div>
        </div>
      )}

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button onClick={handleSave} disabled={isSaving || isLoading}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          บันทึก
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ==========================================
// Sub-components
// ==========================================

function BotTypeSection({
  icon,
  label,
  description,
  enabled,
  onToggle,
  timeout,
  onTimeoutChange,
  priority,
  onPriorityChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  timeout: number;
  onTimeoutChange: (v: string) => void;
  priority: string;
  onPriorityChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
          </div>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} />
      </div>

      {/* Settings (visible when enabled) */}
      {enabled && (
        <div className="flex gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-700/50">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              Timeout (นาที)
            </label>
            <input
              type="number"
              min="1"
              max="480"
              value={timeout}
              onChange={(e) => onTimeoutChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              ความสำคัญ
            </label>
            <select
              value={priority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
