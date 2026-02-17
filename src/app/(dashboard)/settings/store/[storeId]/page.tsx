'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
  Modal,
  ModalFooter,
  toast,
} from '@/components/ui';
import {
  ArrowLeft,
  Save,
  Store,
  MessageCircle,
  Bell,
  Settings,
  Trash2,
  Loader2,
  Printer,
} from 'lucide-react';
import type { ReceiptSettings } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreData {
  id: string;
  store_code: string;
  store_name: string;
  is_central: boolean;
  line_token: string | null;
  line_group_id: string | null;
}

interface StoreSettingsData {
  notify_time_daily: string | null;
  notify_days: string[] | null;
  diff_tolerance: number;
  staff_registration_code: string | null;
  customer_notify_expiry_enabled: boolean;
  customer_notify_expiry_days: number;
  customer_notify_withdrawal_enabled: boolean;
  customer_notify_deposit_enabled: boolean;
  customer_notify_promotion_enabled: boolean;
  customer_notify_channels: string[];
}

const settingsDefaults: StoreSettingsData = {
  notify_time_daily: '09:00',
  notify_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  diff_tolerance: 5,
  staff_registration_code: null,
  customer_notify_expiry_enabled: true,
  customer_notify_expiry_days: 7,
  customer_notify_withdrawal_enabled: true,
  customer_notify_deposit_enabled: true,
  customer_notify_promotion_enabled: true,
  customer_notify_channels: ['pwa', 'line'],
};

const dayLabels: Record<string, string> = {
  Mon: 'จ',
  Tue: 'อ',
  Wed: 'พ',
  Thu: 'พฤ',
  Fri: 'ศ',
  Sat: 'ส',
  Sun: 'อา',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function StoreDetailSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.storeId as string;
  const { user } = useAuthStore();

  // Loading / saving
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Store info
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [isCentral, setIsCentral] = useState(false);

  // LINE settings
  const [lineToken, setLineToken] = useState('');
  const [lineGroupId, setLineGroupId] = useState('');

  // Stock settings
  const [notifyTime, setNotifyTime] = useState('09:00');
  const [notifyDays, setNotifyDays] = useState<string[]>([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ]);
  const [diffTolerance, setDiffTolerance] = useState('5');
  const [registrationCode, setRegistrationCode] = useState('');

  // Customer notification settings
  const [customerExpiryEnabled, setCustomerExpiryEnabled] = useState(true);
  const [customerExpiryDays, setCustomerExpiryDays] = useState('7');
  const [customerWithdrawalEnabled, setCustomerWithdrawalEnabled] = useState(true);
  const [customerDepositEnabled, setCustomerDepositEnabled] = useState(true);
  const [customerPromotionEnabled, setCustomerPromotionEnabled] = useState(true);
  const [customerChannels, setCustomerChannels] = useState<string[]>(['pwa', 'line']);

  // Receipt settings
  const [receiptHeaderText, setReceiptHeaderText] = useState('');
  const [receiptFooterText, setReceiptFooterText] = useState('');
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<58 | 80>(80);
  const [receiptShowLogo, setReceiptShowLogo] = useState(false);
  const [receiptShowQr, setReceiptShowQr] = useState(false);
  const [receiptCopies, setReceiptCopies] = useState('1');
  const [labelCopies, setLabelCopies] = useState('1');

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    const supabase = createClient();

    // Load store info
    const { data: store } = await supabase
      .from('stores')
      .select('id, store_code, store_name, is_central, line_token, line_group_id')
      .eq('id', storeId)
      .single();

    if (store) {
      setStoreCode(store.store_code || '');
      setStoreName(store.store_name || '');
      setIsCentral(store.is_central || false);
      setLineToken(store.line_token || '');
      setLineGroupId(store.line_group_id || '');
    }

    // Load store settings
    const { data: settings } = await supabase
      .from('store_settings')
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (settings) {
      setNotifyTime(settings.notify_time_daily || '09:00');
      setNotifyDays(settings.notify_days || settingsDefaults.notify_days!);
      setDiffTolerance(String(settings.diff_tolerance ?? 5));
      setRegistrationCode(settings.staff_registration_code || '');
      setCustomerExpiryEnabled(settings.customer_notify_expiry_enabled ?? true);
      setCustomerExpiryDays(String(settings.customer_notify_expiry_days ?? 7));
      setCustomerWithdrawalEnabled(settings.customer_notify_withdrawal_enabled ?? true);
      setCustomerDepositEnabled(settings.customer_notify_deposit_enabled ?? true);
      setCustomerPromotionEnabled(settings.customer_notify_promotion_enabled ?? true);
      setCustomerChannels(settings.customer_notify_channels ?? ['pwa', 'line']);

      // Load receipt settings from JSONB
      const rs = settings.receipt_settings as ReceiptSettings | null;
      if (rs) {
        setReceiptHeaderText(rs.header_text || '');
        setReceiptFooterText(rs.footer_text || '');
        setReceiptPaperWidth(rs.paper_width || 80);
        setReceiptShowLogo(rs.show_logo ?? false);
        setReceiptShowQr(rs.show_qr ?? false);
        setReceiptCopies(String(rs.receipt_copies ?? 1));
        setLabelCopies(String(rs.label_copies ?? 1));
      }
    }

    setIsLoading(false);
  }, [storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!storeId) return;
    setIsSaving(true);
    const supabase = createClient();

    // Update store info
    const { error: storeError } = await supabase
      .from('stores')
      .update({
        store_name: storeName.trim(),
        is_central: isCentral,
        line_token: lineToken || null,
        line_group_id: lineGroupId || null,
      })
      .eq('id', storeId);

    if (storeError) {
      toast({ type: 'error', title: 'ไม่สามารถบันทึกข้อมูลสาขาได้', message: storeError.message });
      setIsSaving(false);
      return;
    }

    // Upsert store settings
    const { error: settingsError } = await supabase
      .from('store_settings')
      .upsert(
        {
          store_id: storeId,
          notify_time_daily: notifyTime,
          notify_days: notifyDays,
          diff_tolerance: parseFloat(diffTolerance) || 5,
          staff_registration_code: registrationCode || null,
          customer_notify_expiry_enabled: customerExpiryEnabled,
          customer_notify_expiry_days: parseInt(customerExpiryDays) || 7,
          customer_notify_withdrawal_enabled: customerWithdrawalEnabled,
          customer_notify_deposit_enabled: customerDepositEnabled,
          customer_notify_promotion_enabled: customerPromotionEnabled,
          customer_notify_channels: customerChannels,
          receipt_settings: {
            logo_url: null,
            header_text: receiptHeaderText,
            footer_text: receiptFooterText,
            paper_width: receiptPaperWidth,
            show_logo: receiptShowLogo,
            show_qr: receiptShowQr,
            receipt_copies: parseInt(receiptCopies) || 1,
            label_copies: parseInt(labelCopies) || 1,
          } satisfies ReceiptSettings,
        },
        { onConflict: 'store_id' }
      );

    if (settingsError) {
      toast({ type: 'error', title: 'ไม่สามารถบันทึกการตั้งค่าได้', message: settingsError.message });
    } else {
      toast({ type: 'success', title: 'บันทึกการตั้งค่าสำเร็จ' });
    }

    setIsSaving(false);
  };

  // ---------------------------------------------------------------------------
  // Delete Store
  // ---------------------------------------------------------------------------

  const handleDeleteStore = async () => {
    if (deleteConfirmText !== storeName) return;
    setIsDeleting(true);
    const supabase = createClient();

    const { error } = await supabase.from('stores').delete().eq('id', storeId);

    if (error) {
      toast({ type: 'error', title: 'ไม่สามารถลบสาขาได้', message: error.message });
      setIsDeleting(false);
      return;
    }

    toast({ type: 'success', title: 'ลบสาขาสำเร็จ' });
    setShowDeleteModal(false);
    setIsDeleting(false);
    router.push('/settings');
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const toggleDay = (day: string) => {
    setNotifyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleChannel = (channel: string) => {
    setCustomerChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      {/* Back button + Title */}
      <div>
        <button
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับ
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
            <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {storeName || 'ตั้งค่าสาขา'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{storeCode}</p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: ข้อมูลสาขา (Store Info)                                 */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ข้อมูลสาขา"
          description="ข้อมูลพื้นฐานของสาขา"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Store className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label="รหัสสาขา"
            value={storeCode}
            readOnly
            disabled
            hint="รหัสสาขาไม่สามารถเปลี่ยนแปลงได้"
          />
          <Input
            label="ชื่อสาขา"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="เช่น ร้านสาขาสุขุมวิท"
          />
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">คลังกลาง</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                กำหนดให้สาขานี้เป็นคลังกลางสำหรับจัดการสต๊อก
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCentral(!isCentral)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                isCentral ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  isCentral ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: ตั้งค่า LINE (LINE Settings)                             */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ตั้งค่า LINE"
          description="เชื่อมต่อ LINE สำหรับส่งแจ้งเตือนพนักงาน"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label="LINE Channel Access Token"
            value={lineToken}
            onChange={(e) => setLineToken(e.target.value)}
            placeholder="วาง token ที่นี่"
            hint="ได้จาก LINE Developers Console"
          />
          <Input
            label="LINE Group ID"
            value={lineGroupId}
            onChange={(e) => setLineGroupId(e.target.value)}
            placeholder="เช่น Cxxxxxxxxxx"
            hint="ID ของ LINE group สำหรับส่งแจ้งเตือนพนักงาน"
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: ตั้งค่าสต๊อก (Stock Settings)                            */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ตั้งค่าสต๊อก"
          description="กำหนดเวลาแจ้งเตือนและค่าเผื่อผลต่าง"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <Settings className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          {/* Notify time */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              เวลาแจ้งเตือนนับสต๊อกประจำวัน
            </label>
            <Input
              type="time"
              value={notifyTime}
              onChange={(e) => setNotifyTime(e.target.value)}
            />
          </div>

          {/* Notify days */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              วันที่ต้องนับสต๊อก
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(dayLabels).map(([day, label]) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    notifyDays.includes(day)
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Diff tolerance */}
          <Input
            label="ค่าเผื่อผลต่าง (%)"
            type="number"
            value={diffTolerance}
            onChange={(e) => setDiffTolerance(e.target.value)}
            placeholder="5"
            hint="ผลต่างที่ยอมรับได้โดยไม่ต้องอธิบาย (หน่วย %)"
            min={0}
            max={100}
          />

          {/* Staff registration code */}
          <Input
            label="รหัสลงทะเบียนพนักงาน"
            value={registrationCode}
            onChange={(e) => setRegistrationCode(e.target.value)}
            placeholder="เช่น STORE-REG-2024"
            hint="พนักงานใช้รหัสนี้ในการลงทะเบียนด้วยตัวเอง"
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4: ตั้งค่าแจ้งเตือนลูกค้า (Customer Notifications)          */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ตั้งค่าแจ้งเตือนลูกค้า"
          description="กำหนดว่าจะส่งแจ้งเตือนอะไรไปยังลูกค้า"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <Bell className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
          }
        />

        {/* Notification channels */}
        <CardContent>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            ช่องทางการส่งแจ้งเตือน
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => toggleChannel('pwa')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                customerChannels.includes('pwa')
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/20 dark:text-indigo-300'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              <Bell className="h-4 w-4" />
              PWA Push
            </button>
            <button
              type="button"
              onClick={() => toggleChannel('line')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                customerChannels.includes('line')
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              LINE
            </button>
          </div>
        </CardContent>

        {/* Notification toggles */}
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {/* Expiry notification */}
          <ToggleRow
            label="แจ้งเตือนเหล้าใกล้หมดอายุ"
            description="ส่งแจ้งเตือนอัตโนมัติเมื่อเหล้าของลูกค้าใกล้หมดอายุ"
            checked={customerExpiryEnabled}
            onChange={() => setCustomerExpiryEnabled(!customerExpiryEnabled)}
          />
          {customerExpiryEnabled && (
            <div className="px-5 py-3">
              <Input
                label="แจ้งเตือนก่อนหมดอายุ (วัน)"
                type="number"
                value={customerExpiryDays}
                onChange={(e) => setCustomerExpiryDays(e.target.value)}
                hint="จะส่งแจ้งเตือนล่วงหน้ากี่วันก่อนหมดอายุ"
                min={1}
                max={365}
              />
            </div>
          )}

          {/* Withdrawal notification */}
          <ToggleRow
            label="แจ้งเตือนเบิกเหล้าสำเร็จ"
            description="ส่งแจ้งเตือนเมื่อเบิกเหล้าเรียบร้อย"
            checked={customerWithdrawalEnabled}
            onChange={() => setCustomerWithdrawalEnabled(!customerWithdrawalEnabled)}
          />

          {/* Deposit notification */}
          <ToggleRow
            label="แจ้งเตือนฝากเหล้าสำเร็จ"
            description="ส่งแจ้งเตือนเมื่อการฝากเหล้าได้รับการยืนยัน"
            checked={customerDepositEnabled}
            onChange={() => setCustomerDepositEnabled(!customerDepositEnabled)}
          />

          {/* Promotion notification */}
          <ToggleRow
            label="ส่งโปรโมชั่น"
            description="อนุญาตให้ส่งโปรโมชั่นและประกาศไปยังลูกค้า"
            checked={customerPromotionEnabled}
            onChange={() => setCustomerPromotionEnabled(!customerPromotionEnabled)}
          />
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 5: ตั้งค่าใบเสร็จ/ป้ายขวด (Receipt Settings)               */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ตั้งค่าใบเสร็จและป้ายขวด"
          description="กำหนดรูปแบบใบรับฝากและป้ายติดขวด"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
              <Printer className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          {/* Paper width */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              ขนาดกระดาษ
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReceiptPaperWidth(80)}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                  receiptPaperWidth === 80
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/20 dark:text-indigo-300'
                    : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setReceiptPaperWidth(58)}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                  receiptPaperWidth === 58
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/20 dark:text-indigo-300'
                    : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                58mm
              </button>
            </div>
          </div>

          {/* Header text */}
          <Input
            label="ข้อความหัวใบเสร็จ"
            value={receiptHeaderText}
            onChange={(e) => setReceiptHeaderText(e.target.value)}
            placeholder="เช่น สาขาสุขุมวิท โทร 02-xxx-xxxx"
            hint="แสดงใต้ชื่อร้านด้านบนสุดของใบเสร็จ"
          />

          {/* Footer text */}
          <Input
            label="ข้อความท้ายใบเสร็จ"
            value={receiptFooterText}
            onChange={(e) => setReceiptFooterText(e.target.value)}
            placeholder="เช่น กรุณาเก็บใบนี้ไว้เป็นหลักฐาน"
            hint="แสดงด้านล่างสุดของใบเสร็จ"
          />

          {/* Copies */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="จำนวนใบรับฝาก (ชุด)"
              type="number"
              value={receiptCopies}
              onChange={(e) => setReceiptCopies(e.target.value)}
              min={1}
              max={5}
            />
            <Input
              label="จำนวนป้ายขวด (ชุด)"
              type="number"
              value={labelCopies}
              onChange={(e) => setLabelCopies(e.target.value)}
              min={1}
              max={5}
            />
          </div>

          {/* Toggles */}
          <div className="space-y-0 divide-y divide-gray-50 dark:divide-gray-700/50">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">แสดงโลโก้</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">แสดงโลโก้ร้านบนใบเสร็จ</p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptShowLogo(!receiptShowLogo)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  receiptShowLogo ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    receiptShowLogo ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">แสดง QR Code</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">แสดง QR Code ของรหัสฝากบนใบเสร็จ</p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptShowQr(!receiptShowQr)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  receiptShowQr ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    receiptShowQr ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </CardContent>
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

      {/* ------------------------------------------------------------------ */}
      {/* Danger Zone: Delete Store                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none" className="ring-red-200 dark:ring-red-800/50">
        <CardHeader
          title="ลบสาขา"
          description="การลบสาขาจะลบข้อมูลทั้งหมดที่เกี่ยวข้อง ไม่สามารถกู้คืนได้"
          className="border-b-red-100 dark:border-b-red-900/30"
        />
        <CardContent>
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setShowDeleteModal(true)}
          >
            ลบสาขานี้
          </Button>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Delete Confirmation Modal                                          */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
        }}
        title="ยืนยันการลบสาขา"
        description="คุณแน่ใจหรือไม่ว่าต้องการลบสาขานี้? การกระทำนี้ไม่สามารถย้อนกลับได้"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-300">
              ข้อมูลทั้งหมดของสาขา <strong>{storeName}</strong> จะถูกลบอย่างถาวร
              รวมถึงสินค้า การนับสต๊อก และการตั้งค่าทั้งหมด
            </p>
          </div>
          <Input
            label={`พิมพ์ "${storeName}" เพื่อยืนยัน`}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={storeName}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowDeleteModal(false);
              setDeleteConfirmText('');
            }}
          >
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteStore}
            isLoading={isDeleting}
            disabled={deleteConfirmText !== storeName}
            icon={<Trash2 className="h-4 w-4" />}
          >
            ลบสาขา
          </Button>
        </ModalFooter>
      </Modal>
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
