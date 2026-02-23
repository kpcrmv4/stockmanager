'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  toast,
} from '@/components/ui';
import {
  User,
  Bell,
  BellOff,
  MessageCircle,
  Save,
  Loader2,
  Shield,
  Smartphone,
} from 'lucide-react';
import { ROLE_LABELS } from '@/types/roles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotifPrefs {
  pwa_enabled: boolean;
  line_enabled: boolean;
  notify_deposit_confirmed: boolean;
  notify_withdrawal_completed: boolean;
  notify_expiry_warning: boolean;
  notify_promotions: boolean;
  notify_stock_alert: boolean;
  notify_approval_request: boolean;
}

const defaultPrefs: NotifPrefs = {
  pwa_enabled: true,
  line_enabled: true,
  notify_deposit_confirmed: true,
  notify_withdrawal_completed: true,
  notify_expiry_warning: true,
  notify_promotions: true,
  notify_stock_alert: true,
  notify_approval_request: true,
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { user } = useAuthStore();
  const pushSub = usePushSubscription();

  const [prefs, setPrefs] = useState<NotifPrefs>(defaultPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Load preferences
  // ---------------------------------------------------------------------------

  const loadPrefs = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', authUser.id)
      .single();

    if (data) {
      setPrefs({
        pwa_enabled: data.pwa_enabled ?? true,
        line_enabled: data.line_enabled ?? true,
        notify_deposit_confirmed: data.notify_deposit_confirmed ?? true,
        notify_withdrawal_completed: data.notify_withdrawal_completed ?? true,
        notify_expiry_warning: data.notify_expiry_warning ?? true,
        notify_promotions: data.notify_promotions ?? true,
        notify_stock_alert: data.notify_stock_alert ?? true,
        notify_approval_request: data.notify_approval_request ?? true,
      });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  // ---------------------------------------------------------------------------
  // Save preferences
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    setIsSaving(true);
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      setIsSaving(false);
      toast({ type: 'error', title: 'ไม่พบข้อมูลผู้ใช้' });
      return;
    }

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: authUser.id, ...prefs }, { onConflict: 'user_id' });

    if (error) {
      toast({ type: 'error', title: 'ไม่สามารถบันทึกได้', message: error.message });
    } else {
      toast({ type: 'success', title: 'บันทึกการตั้งค่าสำเร็จ' });
    }
    setIsSaving(false);
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const togglePref = (key: keyof NotifPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePushToggle = async () => {
    try {
      if (pushSub.isSubscribed) {
        await pushSub.unsubscribe();
        setPrefs((prev) => ({ ...prev, pwa_enabled: false }));
      } else {
        await pushSub.subscribe();
        // If subscribe() didn't throw, it succeeded
        setPrefs((prev) => ({ ...prev, pwa_enabled: true }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NOTIFICATION_DENIED') {
        toast({ type: 'error', title: 'การแจ้งเตือนถูกบล็อก', message: 'กรุณาเปิดสิทธิ์ Notification ในการตั้งค่าเบราว์เซอร์' });
      } else if (msg === 'NOTIFICATION_DISMISSED') {
        toast({ type: 'error', title: 'กรุณาอนุญาตการแจ้งเตือนเพื่อเปิดใช้งาน' });
      } else {
        toast({ type: 'error', title: 'ลงทะเบียนอุปกรณ์ไม่สำเร็จ', message: 'กรุณาลองอีกครั้ง' });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Determine which notification types are relevant for this role
  const isStaffLike = ['staff', 'bar', 'manager', 'owner'].includes(user.role);
  const isOwnerOrManager = ['owner', 'manager'].includes(user.role);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      {/* Profile Header */}
      <div className="flex items-center gap-4">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName ?? user.username}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            {user.displayName?.[0] ?? user.username[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {user.displayName ?? user.username}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              <Shield className="h-3 w-3" />
              {ROLE_LABELS[user.role]}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              @{user.username}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: ช่องทางการแจ้งเตือน (Notification Channels)              */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ช่องทางการแจ้งเตือน"
          description="เลือกช่องทางที่ต้องการรับแจ้งเตือน"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          }
        />
        <CardContent className="space-y-3">
          {/* PWA Push */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-indigo-500" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Push Notification
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {!pushSub.isSupported
                    ? 'เบราว์เซอร์นี้ไม่รองรับ Push Notification'
                    : pushSub.isSubscribed
                      ? 'เปิดใช้งานบนอุปกรณ์นี้แล้ว — รับแจ้งเตือนแม้ปิดแอป'
                      : pushSub.permission === 'denied'
                        ? 'ถูกบล็อกบนอุปกรณ์นี้ — กรุณาเปิดสิทธิ์ Notification ในการตั้งค่าเบราว์เซอร์'
                        : pushSub.permission === 'granted'
                          ? 'ได้รับสิทธิ์แล้ว แต่ยังไม่ได้ลงทะเบียนอุปกรณ์นี้ — กดเพื่อเปิด'
                          : 'ปิดอยู่บนอุปกรณ์นี้ — กดเพื่อเปิดรับการแจ้งเตือน'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePushToggle}
              disabled={!pushSub.isSupported || pushSub.isLoading || pushSub.permission === 'denied'}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                pushSub.isSubscribed ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  pushSub.isSubscribed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* LINE */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-[#06C755]" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  LINE Notification
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {prefs.line_enabled ? 'เปิดรับแจ้งเตือนผ่าน LINE' : 'ปิดการแจ้งเตือนผ่าน LINE'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => togglePref('line_enabled')}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                prefs.line_enabled ? 'bg-[#06C755]' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  prefs.line_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: ประเภทการแจ้งเตือน (Notification Types)                  */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ประเภทการแจ้งเตือน"
          description="เลือกประเภทแจ้งเตือนที่ต้องการรับ"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
              {prefs.notify_stock_alert ? (
                <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <BellOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              )}
            </div>
          }
        />
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {/* Stock Alert — for staff/bar/manager/owner */}
          {isStaffLike && (
            <ToggleRow
              label="แจ้งเตือนสต๊อก"
              description="เตือนนับสต๊อก, ผลเปรียบเทียบ, ผลต่าง"
              checked={prefs.notify_stock_alert}
              onChange={() => togglePref('notify_stock_alert')}
            />
          )}

          {/* Approval Request — for owner/manager */}
          {isOwnerOrManager && (
            <ToggleRow
              label="รายการรออนุมัติ"
              description="เมื่อมีรายการรออนุมัติ (ผลต่างสต๊อก, คำอธิบาย)"
              checked={prefs.notify_approval_request}
              onChange={() => togglePref('notify_approval_request')}
            />
          )}

          {/* Deposit confirmed */}
          <ToggleRow
            label="ฝากเหล้าสำเร็จ"
            description="เมื่อการฝากเหล้าได้รับการยืนยัน"
            checked={prefs.notify_deposit_confirmed}
            onChange={() => togglePref('notify_deposit_confirmed')}
          />

          {/* Withdrawal completed */}
          <ToggleRow
            label="เบิกเหล้าสำเร็จ"
            description="เมื่อเบิกเหล้าเรียบร้อย"
            checked={prefs.notify_withdrawal_completed}
            onChange={() => togglePref('notify_withdrawal_completed')}
          />

          {/* Expiry warning */}
          <ToggleRow
            label="เหล้าใกล้หมดอายุ"
            description="แจ้งเตือนก่อนเหล้าฝากหมดอายุ"
            checked={prefs.notify_expiry_warning}
            onChange={() => togglePref('notify_expiry_warning')}
          />

          {/* Promotions */}
          <ToggleRow
            label="โปรโมชั่น"
            description="รับข่าวสารโปรโมชั่นจากร้าน"
            checked={prefs.notify_promotions}
            onChange={() => togglePref('notify_promotions')}
          />
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Save Button                                                        */}
      {/* ------------------------------------------------------------------ */}
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

// ---------------------------------------------------------------------------
// Toggle Row Sub-component
// ---------------------------------------------------------------------------

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
      <div className="mr-4">
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
