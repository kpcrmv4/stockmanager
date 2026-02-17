'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
  toast,
} from '@/components/ui';
import { ArrowLeft, Bell, Save, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CustomerNotifSettings {
  customer_notify_expiry_enabled: boolean;
  customer_notify_expiry_days: number;
  customer_notify_withdrawal_enabled: boolean;
  customer_notify_deposit_enabled: boolean;
  customer_notify_promotion_enabled: boolean;
  customer_notify_channels: string[];
}

const defaults: CustomerNotifSettings = {
  customer_notify_expiry_enabled: true,
  customer_notify_expiry_days: 7,
  customer_notify_withdrawal_enabled: true,
  customer_notify_deposit_enabled: true,
  customer_notify_promotion_enabled: true,
  customer_notify_channels: ['pwa', 'line'],
};

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { currentStoreId } = useAppStore();
  const [settings, setSettings] = useState<CustomerNotifSettings>(defaults);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('store_settings')
      .select('customer_notify_expiry_enabled, customer_notify_expiry_days, customer_notify_withdrawal_enabled, customer_notify_deposit_enabled, customer_notify_promotion_enabled, customer_notify_channels')
      .eq('store_id', currentStoreId)
      .single();

    if (data) {
      setSettings({
        customer_notify_expiry_enabled: data.customer_notify_expiry_enabled ?? true,
        customer_notify_expiry_days: data.customer_notify_expiry_days ?? 7,
        customer_notify_withdrawal_enabled: data.customer_notify_withdrawal_enabled ?? true,
        customer_notify_deposit_enabled: data.customer_notify_deposit_enabled ?? true,
        customer_notify_promotion_enabled: data.customer_notify_promotion_enabled ?? true,
        customer_notify_channels: data.customer_notify_channels ?? ['pwa', 'line'],
      });
    }
    setIsLoading(false);
  }, [currentStoreId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
    }
    setIsSaving(false);
  };

  const toggle = (key: keyof CustomerNotifSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleChannel = (channel: string) => {
    setSettings((prev) => {
      const channels = prev.customer_notify_channels.includes(channel)
        ? prev.customer_notify_channels.filter((c) => c !== channel)
        : [...prev.customer_notify_channels, channel];
      return { ...prev, customer_notify_channels: channels };
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับ
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ตั้งค่าแจ้งเตือนลูกค้า</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          กำหนดว่าจะส่งแจ้งเตือนอะไรไปยังลูกค้าในสาขานี้
        </p>
      </div>

      {/* Channels */}
      <Card padding="none">
        <CardHeader title="ช่องทางการส่งแจ้งเตือน" />
        <CardContent>
          <div className="flex gap-3">
            <button
              onClick={() => toggleChannel('pwa')}
              className={`flex flex-1 items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                settings.customer_notify_channels.includes('pwa')
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/20 dark:text-indigo-300'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              <Bell className="h-4 w-4" />
              PWA Push
            </button>
            <button
              onClick={() => toggleChannel('line')}
              className={`flex flex-1 items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                settings.customer_notify_channels.includes('line')
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              LINE
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Types */}
      <Card padding="none">
        <CardHeader title="ประเภทแจ้งเตือน" />
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
          <ToggleRow
            label="แจ้งเตือนเหล้าใกล้หมดอายุ"
            description="ส่งแจ้งเตือนอัตโนมัติเมื่อเหล้าใกล้หมดอายุ"
            checked={settings.customer_notify_expiry_enabled}
            onChange={() => toggle('customer_notify_expiry_enabled')}
          />
          {settings.customer_notify_expiry_enabled && (
            <div className="px-5 py-3">
              <Input
                label="แจ้งเตือนก่อนหมดอายุ (วัน)"
                type="number"
                value={String(settings.customer_notify_expiry_days)}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    customer_notify_expiry_days: parseInt(e.target.value) || 7,
                  }))
                }
                hint="จะส่งแจ้งเตือนล่วงหน้ากี่วันก่อนหมดอายุ"
              />
            </div>
          )}
          <ToggleRow
            label="แจ้งเตือนฝากเหล้าสำเร็จ"
            description="ส่งแจ้งเตือนเมื่อการฝากเหล้าได้รับการยืนยัน"
            checked={settings.customer_notify_deposit_enabled}
            onChange={() => toggle('customer_notify_deposit_enabled')}
          />
          <ToggleRow
            label="แจ้งเตือนเบิกเหล้าสำเร็จ"
            description="ส่งแจ้งเตือนเมื่อเบิกเหล้าเรียบร้อย"
            checked={settings.customer_notify_withdrawal_enabled}
            onChange={() => toggle('customer_notify_withdrawal_enabled')}
          />
          <ToggleRow
            label="ส่งโปรโมชั่น"
            description="อนุญาตให้ส่งโปรโมชั่นและประกาศไปยังลูกค้า"
            checked={settings.customer_notify_promotion_enabled}
            onChange={() => toggle('customer_notify_promotion_enabled')}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          isLoading={isSaving}
          icon={<Save className="h-4 w-4" />}
        >
          บันทึกการตั้งค่า
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
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
    </div>
  );
}
