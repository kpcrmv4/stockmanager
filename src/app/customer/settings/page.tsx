'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, MessageCircle, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface NotifPrefs {
  pwa_enabled: boolean;
  line_enabled: boolean;
  notify_deposit_confirmed: boolean;
  notify_withdrawal_completed: boolean;
  notify_expiry_warning: boolean;
  notify_promotions: boolean;
}

const defaultPrefs: NotifPrefs = {
  pwa_enabled: true,
  line_enabled: true,
  notify_deposit_confirmed: true,
  notify_withdrawal_completed: true,
  notify_expiry_warning: true,
  notify_promotions: true,
};

export default function CustomerSettingsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(defaultPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setPrefs({
        pwa_enabled: data.pwa_enabled ?? true,
        line_enabled: data.line_enabled ?? true,
        notify_deposit_confirmed: data.notify_deposit_confirmed ?? true,
        notify_withdrawal_completed: data.notify_withdrawal_completed ?? true,
        notify_expiry_warning: data.notify_expiry_warning ?? true,
        notify_promotions: data.notify_promotions ?? true,
      });
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsSaving(false);
      setSaveStatus('error');
      return;
    }

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...prefs }, { onConflict: 'user_id' });

    setSaveStatus(error ? 'error' : 'success');
    setIsSaving(false);

    if (!error) {
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const togglePref = (key: keyof NotifPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaveStatus('idle');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-lg font-bold text-gray-900">ตั้งค่า</h2>
      <p className="mt-0.5 text-sm text-gray-500">จัดการการแจ้งเตือนของคุณ</p>

      {/* Channels */}
      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">ช่องทางการแจ้งเตือน</h3>
        </div>
        <ToggleRow
          icon={<Bell className="h-4 w-4 text-indigo-500" />}
          label="Push Notification"
          description="รับแจ้งเตือนผ่านแอปบนมือถือ"
          checked={prefs.pwa_enabled}
          onChange={() => togglePref('pwa_enabled')}
        />
        <ToggleRow
          icon={<MessageCircle className="h-4 w-4 text-[#06C755]" />}
          label="LINE Notification"
          description="รับแจ้งเตือนผ่าน LINE"
          checked={prefs.line_enabled}
          onChange={() => togglePref('line_enabled')}
          isLast
        />
      </div>

      {/* Types */}
      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">ประเภทการแจ้งเตือน</h3>
        </div>
        <ToggleRow
          label="ฝากเหล้าสำเร็จ"
          description="เมื่อการฝากเหล้าได้รับการยืนยัน"
          checked={prefs.notify_deposit_confirmed}
          onChange={() => togglePref('notify_deposit_confirmed')}
        />
        <ToggleRow
          label="เบิกเหล้าสำเร็จ"
          description="เมื่อเบิกเหล้าเรียบร้อย"
          checked={prefs.notify_withdrawal_completed}
          onChange={() => togglePref('notify_withdrawal_completed')}
        />
        <ToggleRow
          label="เหล้าใกล้หมดอายุ"
          description="แจ้งเตือนก่อนเหล้าหมดอายุ"
          checked={prefs.notify_expiry_warning}
          onChange={() => togglePref('notify_expiry_warning')}
        />
        <ToggleRow
          label="โปรโมชั่น"
          description="รับข่าวสารโปรโมชั่นจากร้าน"
          checked={prefs.notify_promotions}
          onChange={() => togglePref('notify_promotions')}
          isLast
        />
      </div>

      {/* Save Status */}
      {saveStatus === 'success' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          บันทึกสำเร็จ
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          เกิดข้อผิดพลาด กรุณาลองใหม่
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white disabled:opacity-60 active:bg-[#05a849]"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
      </button>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  isLast,
}: {
  icon?: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  isLast?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${!isLast ? 'border-b border-gray-50' : ''}`}>
      <div className="flex items-center gap-3">
        {icon && <div>{icon}</div>}
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-[#06C755]' : 'bg-gray-200'
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
