'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  Settings,
  Store,
  Bell,
  Plus,
  Clock,
  Percent,
  Save,
  ChevronRight,
  MessageCircle,
  Loader2,
} from 'lucide-react';

interface StoreInfo {
  id: string;
  store_code: string;
  store_name: string;
  is_central: boolean;
  active: boolean;
}

interface StoreSettingsData {
  notify_time_daily: string | null;
  notify_days: string[] | null;
  diff_tolerance: number;
  staff_registration_code: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { currentStoreId } = useAppStore();
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [settings, setSettings] = useState<StoreSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form
  const [notifyTime, setNotifyTime] = useState('09:00');
  const [notifyDays, setNotifyDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const [diffTolerance, setDiffTolerance] = useState('5');
  const [registrationCode, setRegistrationCode] = useState('');

  // Central LINE Bot settings
  const [centralToken, setCentralToken] = useState('');
  const [centralGroupId, setCentralGroupId] = useState('');
  const [centralChannelSecret, setCentralChannelSecret] = useState('');
  const [isSavingCentral, setIsSavingCentral] = useState(false);

  const loadStores = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_code, store_name, is_central, active')
      .order('store_name');
    if (data) setStores(data);
  }, []);

  const loadSettings = useCallback(async () => {
    if (!currentStoreId) return;
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('store_settings')
      .select('*')
      .eq('store_id', currentStoreId)
      .single();

    if (data) {
      setSettings(data);
      setNotifyTime(data.notify_time_daily || '09:00');
      setNotifyDays(data.notify_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
      setDiffTolerance(String(data.diff_tolerance || 5));
      setRegistrationCode(data.staff_registration_code || '');
    }
    setIsLoading(false);
  }, [currentStoreId]);

  const loadCentralSettings = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['LINE_CENTRAL_TOKEN', 'LINE_CENTRAL_GROUP_ID', 'LINE_CENTRAL_CHANNEL_SECRET']);

    if (data) {
      for (const row of data) {
        if (row.key === 'LINE_CENTRAL_TOKEN') setCentralToken(row.value || '');
        if (row.key === 'LINE_CENTRAL_GROUP_ID') setCentralGroupId(row.value || '');
        if (row.key === 'LINE_CENTRAL_CHANNEL_SECRET') setCentralChannelSecret(row.value || '');
      }
    }
  }, []);

  useEffect(() => {
    loadStores();
    loadSettings();
    loadCentralSettings();
  }, [loadStores, loadSettings, loadCentralSettings]);

  const handleSaveSettings = async () => {
    if (!currentStoreId) return;
    setIsSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('store_settings')
      .upsert(
        {
          store_id: currentStoreId,
          notify_time_daily: notifyTime,
          notify_days: notifyDays,
          diff_tolerance: parseFloat(diffTolerance) || 5,
          staff_registration_code: registrationCode || null,
        },
        { onConflict: 'store_id' }
      );

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด' });
    } else {
      toast({ type: 'success', title: 'บันทึกการตั้งค่าสำเร็จ' });
    }
    setIsSaving(false);
  };

  const handleSaveCentralSettings = async () => {
    setIsSavingCentral(true);
    const supabase = createClient();

    const updates = [
      { key: 'LINE_CENTRAL_TOKEN', value: centralToken, type: 'secret', description: 'LINE Channel Access Token สำหรับ bot กลาง' },
      { key: 'LINE_CENTRAL_GROUP_ID', value: centralGroupId, type: 'string', description: 'LINE Group ID ของกลุ่มคลังกลาง' },
      { key: 'LINE_CENTRAL_CHANNEL_SECRET', value: centralChannelSecret, type: 'secret', description: 'LINE Channel Secret สำหรับ verify webhook signature' },
    ];

    const { error } = await supabase
      .from('app_settings')
      .upsert(updates, { onConflict: 'key' });

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: error.message });
    } else {
      toast({ type: 'success', title: 'บันทึกการตั้งค่า LINE Bot กลางสำเร็จ' });
    }
    setIsSavingCentral(false);
  };

  const dayLabels: Record<string, string> = {
    Mon: 'จ', Tue: 'อ', Wed: 'พ', Thu: 'พฤ', Fri: 'ศ', Sat: 'ส', Sun: 'อา',
  };

  const toggleDay = (day: string) => {
    setNotifyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ตั้งค่า</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          จัดการร้านค้าและตั้งค่าระบบ
        </p>
      </div>

      {/* Stores List */}
      <Card padding="none">
        <CardHeader
          title="รายการสาขา"
          description="จัดการสาขาและตั้งค่าแต่ละสาขา"
          action={
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => router.push('/settings/stores/new')}
            >
              เพิ่มสาขา
            </Button>
          }
        />
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => router.push(`/settings/store/${store.id}`)}
              className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                  <Store className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {store.store_name}
                    {store.is_central && (
                      <span className="ml-1.5 text-xs text-gray-400">(คลังกลาง)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">{store.store_code}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
          ))}
        </div>
      </Card>

      {/* Current Store Settings */}
      {currentStoreId && (
        <>
          <Card padding="none">
            <CardHeader title="ตั้งค่าแจ้งเตือนสต๊อก" />
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Clock className="mr-1 inline h-4 w-4" />
                  เวลาแจ้งเตือนนับสต๊อก
                </label>
                <Input
                  type="time"
                  value={notifyTime}
                  onChange={(e) => setNotifyTime(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  วันที่ต้องนับ
                </label>
                <div className="flex gap-2">
                  {Object.entries(dayLabels).map(([day, label]) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                        notifyDays.includes(day)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label="ค่าเผื่อผลต่าง (%)"
                type="number"
                value={diffTolerance}
                onChange={(e) => setDiffTolerance(e.target.value)}
                hint="ผลต่างที่ยอมรับได้โดยไม่ต้องอธิบาย"
                leftIcon={<Percent className="h-4 w-4" />}
              />

              <Input
                label="รหัสลงทะเบียนพนักงาน"
                value={registrationCode}
                onChange={(e) => setRegistrationCode(e.target.value)}
                hint="พนักงานใช้รหัสนี้ในการลงทะเบียนด้วยตัวเอง"
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveSettings}
              isLoading={isSaving}
              icon={<Save className="h-4 w-4" />}
            >
              บันทึกการตั้งค่า
            </Button>
          </div>

          {/* Notification Settings Link */}
          <Card padding="none">
            <button
              onClick={() => router.push('/settings/notifications')}
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    ตั้งค่าแจ้งเตือนลูกค้า
                  </p>
                  <p className="text-xs text-gray-400">
                    กำหนดว่าจะส่งแจ้งเตือนอะไรไปยังลูกค้า
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
          </Card>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Central LINE Bot Settings (owner only)                              */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ตั้งค่า LINE Bot กลาง"
          description="Bot กลางใช้สำหรับแจ้งเตือนคลังกลางและโอนสต๊อกระหว่างสาขา (แยกจาก LINE OA ของแต่ละสาขา)"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label="LINE Channel Access Token (Bot กลาง)"
            value={centralToken}
            onChange={(e) => setCentralToken(e.target.value)}
            placeholder="วาง token ที่นี่"
            hint="ได้จาก LINE Developers Console → Messaging API → Channel access token"
          />
          <Input
            label="LINE Channel Secret (Bot กลาง)"
            value={centralChannelSecret}
            onChange={(e) => setCentralChannelSecret(e.target.value)}
            placeholder="วาง channel secret ที่นี่"
            hint="ใช้ verify webhook signature — ได้จาก LINE Developers Console → Basic settings"
          />
          <Input
            label="Central Group ID (กลุ่มคลังกลาง)"
            value={centralGroupId}
            onChange={(e) => setCentralGroupId(e.target.value)}
            placeholder="เช่น Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="Group ID ของกลุ่ม LINE สำหรับเจ้าหน้าที่คลังกลาง"
          />
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <strong>หมายเหตุ:</strong> Bot กลางแยกจาก LINE OA ของแต่ละสาขา ใช้สำหรับ:
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-blue-600 dark:text-blue-500">
              <li>แจ้งเตือนโอนสต๊อกเข้า/ออกคลังกลาง</li>
              <li>แจ้งเตือนคำขอโอนจากสาขา</li>
              <li>การสื่อสารระหว่างสาขา</li>
            </ul>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSaveCentralSettings}
              isLoading={isSavingCentral}
              icon={<Save className="h-4 w-4" />}
            >
              บันทึก LINE Bot กลาง
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
