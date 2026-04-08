'use client';

import { useTranslations } from 'next-intl';

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
  line_notify_enabled: boolean;
}

const defaults: CustomerNotifSettings = {
  customer_notify_expiry_enabled: true,
  customer_notify_expiry_days: 7,
  customer_notify_withdrawal_enabled: true,
  customer_notify_deposit_enabled: true,
  customer_notify_promotion_enabled: true,
  customer_notify_channels: ['pwa', 'line'],
  line_notify_enabled: false,
};

export default function NotificationSettingsPage() {
  const t = useTranslations('settings');
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
      .select('customer_notify_expiry_enabled, customer_notify_expiry_days, customer_notify_withdrawal_enabled, customer_notify_deposit_enabled, customer_notify_promotion_enabled, customer_notify_channels, line_notify_enabled')
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
        line_notify_enabled: data.line_notify_enabled ?? false,
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
      toast({ type: 'error', title: t('notif.errorSaving') });
    } else {
      toast({ type: 'success', title: t('notif.saveSuccess') });
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
        className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <ArrowLeft className="h-5 w-5" />
        {t('notif.back')}
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('notif.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('notif.subtitle')}
        </p>
      </div>

      {/* Channels */}
      <Card padding="none">
        <CardHeader title={t('notif.channelsTitle')} />
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
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
        <CardHeader title={t('notif.typesTitle')} />
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
          <ToggleRow
            label={t('notif.expiryLabel')}
            description={t('notif.expiryDesc')}
            checked={settings.customer_notify_expiry_enabled}
            onChange={() => toggle('customer_notify_expiry_enabled')}
          />
          {settings.customer_notify_expiry_enabled && (
            <div className="px-5 py-3">
              <Input
                label={t('notif.expiryDaysLabel')}
                type="number"
                value={String(settings.customer_notify_expiry_days)}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    customer_notify_expiry_days: parseInt(e.target.value) || 7,
                  }))
                }
                hint={t('notif.expiryDaysHint')}
              />
            </div>
          )}
          <ToggleRow
            label={t('notif.depositLabel')}
            description={t('notif.depositDesc')}
            checked={settings.customer_notify_deposit_enabled}
            onChange={() => toggle('customer_notify_deposit_enabled')}
          />
          <ToggleRow
            label={t('notif.withdrawalLabel')}
            description={t('notif.withdrawalDesc')}
            checked={settings.customer_notify_withdrawal_enabled}
            onChange={() => toggle('customer_notify_withdrawal_enabled')}
          />
          <ToggleRow
            label={t('notif.promotionLabel')}
            description={t('notif.promotionDesc')}
            checked={settings.customer_notify_promotion_enabled}
            onChange={() => toggle('customer_notify_promotion_enabled')}
          />
        </div>
      </Card>

      {/* LINE Staff Group Notification */}
      <Card padding="none">
        <CardHeader title={t('notif.lineStaffTitle')} />
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
          <ToggleRow
            label={t('notif.lineStaffLabel')}
            description={t('notif.lineStaffDesc')}
            checked={settings.line_notify_enabled}
            onChange={() => toggle('line_notify_enabled')}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          isLoading={isSaving}
          icon={<Save className="h-4 w-4" />}
        >
          {t('notif.saveButton')}
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
