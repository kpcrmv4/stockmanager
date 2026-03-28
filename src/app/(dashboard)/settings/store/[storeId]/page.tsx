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
  PhotoUpload,
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
  ScrollText,
  ExternalLink,
  Download,
  RefreshCw,
  TestTube,
  Wifi,
  WifiOff,
  Clock,
  Monitor,
} from 'lucide-react';
import Link from 'next/link';
import type { ReceiptSettings, PrintServerStatus, PrintServerWorkingHours } from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreData {
  id: string;
  store_code: string;
  store_name: string;
  is_central: boolean;
  /** กลุ่มแจ้งเตือนสต๊อก (daily reminder, comparison, approval) */
  stock_notify_group_id: string | null;
  /** กลุ่มแจ้งเตือนฝาก/เบิกเหล้า (staff) */
  deposit_notify_group_id: string | null;
  /** กลุ่มบาร์ยืนยันรับเหล้า (bar confirm) */
  bar_notify_group_id: string | null;
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
  line_notify_enabled: boolean;
  daily_reminder_enabled: boolean;
  follow_up_enabled: boolean;
  audit_log_retention_days: number | null;
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
  line_notify_enabled: true,
  daily_reminder_enabled: true,
  follow_up_enabled: true,
  audit_log_retention_days: null,
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

  // LINE group settings
  const [stockNotifyGroupId, setStockNotifyGroupId] = useState('');
  const [depositNotifyGroupId, setDepositNotifyGroupId] = useState('');
  const [barNotifyGroupId, setBarNotifyGroupId] = useState('');
  const [lineNotifyEnabled, setLineNotifyEnabled] = useState(true);

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
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(true);
  const [followUpEnabled, setFollowUpEnabled] = useState(true);

  // Audit log retention
  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState<number | null>(null);

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
  const [lineOaId, setLineOaId] = useState('');
  const [qrCodeImageUrl, setQrCodeImageUrl] = useState('');

  // Print Server settings
  const [printServerStatus, setPrintServerStatus] = useState<PrintServerStatus | null>(null);
  const [printServerHasAccount, setPrintServerHasAccount] = useState(false);
  const [printServerPrinterName, setPrintServerPrinterName] = useState('POS80');
  const [printServerWorkingHours, setPrintServerWorkingHours] = useState<PrintServerWorkingHours>({
    enabled: true,
    startHour: 12,
    startMinute: 0,
    endHour: 6,
    endMinute: 0,
  });
  const [isDownloadingConfig, setIsDownloadingConfig] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [recentPrintJobs, setRecentPrintJobs] = useState<Array<{ id: string; job_type: string; status: string; created_at: string; payload: Record<string, unknown> }>>([]);

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
      .select('id, store_code, store_name, is_central, stock_notify_group_id, deposit_notify_group_id, bar_notify_group_id')
      .eq('id', storeId)
      .single();

    if (store) {
      setStoreCode(store.store_code || '');
      setStoreName(store.store_name || '');
      setIsCentral(store.is_central || false);
      setStockNotifyGroupId(store.stock_notify_group_id || '');
      setDepositNotifyGroupId(store.deposit_notify_group_id || '');
      setBarNotifyGroupId(store.bar_notify_group_id || '');
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
      setLineNotifyEnabled(settings.line_notify_enabled ?? true);
      setDailyReminderEnabled(settings.daily_reminder_enabled ?? true);
      setFollowUpEnabled(settings.follow_up_enabled ?? true);
      setAuditLogRetentionDays(settings.audit_log_retention_days ?? null);

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
        setLineOaId(rs.line_oa_id || '');
        setQrCodeImageUrl(rs.qr_code_image_url || '');
      }
    }

    // Load print server status + settings
    const { data: psStatus } = await supabase
      .from('print_server_status')
      .select('*')
      .eq('store_id', storeId)
      .single();
    setPrintServerStatus(psStatus as PrintServerStatus | null);

    // Check if service account exists
    const psAccountId = settings?.print_server_account_id;
    setPrintServerHasAccount(!!psAccountId);

    // Working hours
    const wh = settings?.print_server_working_hours as PrintServerWorkingHours | null;
    if (wh) setPrintServerWorkingHours(wh);

    // Load recent print jobs
    const { data: jobs } = await supabase
      .from('print_queue')
      .select('id, job_type, status, created_at, payload')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(5);
    setRecentPrintJobs((jobs as typeof recentPrintJobs) || []);

    setIsLoading(false);
  }, [storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription for print server status
  useEffect(() => {
    if (!storeId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ps-status-${storeId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'print_server_status',
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        setPrintServerStatus(payload.new as PrintServerStatus);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [storeId]);

  // ---------------------------------------------------------------------------
  // Print Server Actions
  // ---------------------------------------------------------------------------

  const handleDownloadConfig = async () => {
    setIsDownloadingConfig(true);
    try {
      const res = await fetch('/api/print-server/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          printerName: printServerPrinterName,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate config');
      }

      const { config } = await res.json();

      // Merge working hours from local state
      config.WORKING_HOURS = printServerWorkingHours;

      // Download as JSON file
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `config.json`;
      a.click();
      URL.revokeObjectURL(url);

      setPrintServerHasAccount(true);
      toast({ type: 'success', title: 'ดาวน์โหลด config.json สำเร็จ!', message: 'วางไฟล์ในโฟลเดอร์ print-server แล้วรัน SETUP.bat' });
    } catch (error) {
      toast({ type: 'error', title: 'ดาวน์โหลดไม่สำเร็จ', message: (error as Error).message });
    } finally {
      setIsDownloadingConfig(false);
    }
  };

  const handleTestPrint = async () => {
    setIsTestingPrint(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('print_queue').insert({
        store_id: storeId,
        deposit_id: null,
        job_type: 'receipt' as const,
        status: 'pending' as const,
        copies: 1,
        payload: {
          deposit_code: 'TEST-0000',
          customer_name: 'ทดสอบระบบ',
          customer_phone: null,
          product_name: 'Test Product',
          category: null,
          quantity: 1,
          remaining_qty: 1,
          table_number: null,
          expiry_date: null,
          created_at: new Date().toISOString(),
          store_name: storeName,
          received_by_name: user?.displayName || 'Admin',
          qr_code_image_url: null,
          line_oa_id: null,
        },
        requested_by: user?.id,
      });

      if (error) throw error;
      toast({ type: 'success', title: 'ส่งงานทดสอบพิมพ์แล้ว!', message: 'ตรวจสอบเครื่องพิมพ์' });
    } catch (error) {
      toast({ type: 'error', title: 'ส่งงานทดสอบไม่สำเร็จ', message: (error as Error).message });
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleSaveWorkingHours = async () => {
    const supabase = createClient();
    await supabase
      .from('store_settings')
      .update({ print_server_working_hours: printServerWorkingHours })
      .eq('store_id', storeId);
    toast({ type: 'success', title: 'บันทึกเวลาทำงานแล้ว' });
  };

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
        stock_notify_group_id: stockNotifyGroupId || null,
        deposit_notify_group_id: depositNotifyGroupId || null,
        bar_notify_group_id: barNotifyGroupId || null,
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
          line_notify_enabled: lineNotifyEnabled,
          daily_reminder_enabled: dailyReminderEnabled,
          follow_up_enabled: followUpEnabled,
          audit_log_retention_days: auditLogRetentionDays,
          receipt_settings: {
            logo_url: null,
            header_text: receiptHeaderText,
            footer_text: receiptFooterText,
            paper_width: receiptPaperWidth,
            show_logo: receiptShowLogo,
            show_qr: receiptShowQr,
            receipt_copies: parseInt(receiptCopies) || 1,
            label_copies: parseInt(labelCopies) || 1,
            line_oa_id: lineOaId.trim() || null,
            qr_code_image_url: qrCodeImageUrl.trim() || null,
          } satisfies ReceiptSettings,
          print_server_working_hours: printServerWorkingHours,
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
      {/* Section 2: กลุ่ม LINE แจ้งเตือน                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="กลุ่ม LINE แจ้งเตือน"
          description="ตั้งค่ากลุ่ม LINE สำหรับรับแจ้งเตือนของสาขานี้"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label="กลุ่มแจ้งเตือนสต๊อก"
            value={stockNotifyGroupId}
            onChange={(e) => setStockNotifyGroupId(e.target.value)}
            placeholder="เช่น Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="กลุ่ม LINE สำหรับแจ้งเตือนนับสต๊อก, ผลต่าง, อนุมัติ"
          />
          <Input
            label="กลุ่มแจ้งเตือนฝาก/เบิกเหล้า"
            value={depositNotifyGroupId}
            onChange={(e) => setDepositNotifyGroupId(e.target.value)}
            placeholder="เช่น Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="กลุ่ม LINE สำหรับแจ้งเตือนพนักงานเมื่อมีลูกค้าฝาก/ขอเบิกเหล้า"
          />
          <Input
            label="กลุ่มบาร์ยืนยันรับเหล้า"
            value={barNotifyGroupId}
            onChange={(e) => setBarNotifyGroupId(e.target.value)}
            placeholder="เช่น Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="กลุ่ม LINE สำหรับแจ้งเตือนหัวหน้าบาร์ให้ยืนยันรับเหล้า (ไม่บังคับ)"
          />
          {/* LINE Notify Toggle */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">เปิดการแจ้งเตือนผ่าน LINE</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ปิดเพื่อหยุดส่ง LINE push ทั้งหมดของสาขานี้ (ยังคงแจ้งผ่าน PWA)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLineNotifyEnabled(!lineNotifyEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                lineNotifyEnabled ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  lineNotifyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <strong>วิธีดู Group ID:</strong> เชิญ bot เข้ากลุ่ม LINE → bot จะตอบ Group ID ให้คัดลอกมาวางที่นี่
            </p>
          </div>
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
          {/* Daily Reminder Toggle */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">เตือนนับสต๊อกประจำวัน</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ส่งแจ้งเตือนพนักงานให้นับสต๊อกอัตโนมัติ (LINE + In-App)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDailyReminderEnabled(!dailyReminderEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                dailyReminderEnabled ? 'bg-amber-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  dailyReminderEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Follow-up Toggle */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">ติดตามรายการค้าง</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ส่งแจ้งเตือนติดตามผลต่างสต๊อกและคำขอเบิกเหล้าที่ค้างนาน (ทุก 4 ชม.)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFollowUpEnabled(!followUpEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                followUpEnabled ? 'bg-amber-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  followUpEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Notify time */}
          {dailyReminderEnabled && (
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
          )}

          {/* Notify days */}
          {dailyReminderEnabled && (
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
          )}

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
          {/* Info: Print Server handles printing */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/50 dark:bg-emerald-900/10">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              <strong>การพิมพ์:</strong> ใบฝากเหล้าและป้ายขวดจะถูกส่งไปยัง Print Server อัตโนมัติ ตั้งค่าได้ที่หัวข้อ &quot;Print Server&quot; ด้านล่าง
            </p>
          </div>

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

          {/* Copies */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">จำนวนใบรับฝาก</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">พิมพ์ตามจำนวนขวดที่รับฝากอัตโนมัติ</p>
            </div>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">แสดง QR Code LINE OA บนใบเสร็จ ลูกค้าสแกนเพื่อผูกรายการฝาก</p>
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

          {/* LINE OA QR Code settings (shown when Show QR is enabled) */}
          {receiptShowQr && (
            <div className="space-y-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-800/50 dark:bg-indigo-900/10">
              <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
                ตั้งค่า LINE OA สำหรับ QR Code บนใบเสร็จ
              </p>
              <PhotoUpload
                value={qrCodeImageUrl || null}
                onChange={(url) => setQrCodeImageUrl(url || '')}
                folder="qr-codes"
                label="รูป QR Code LINE OA"
                placeholder="อัพโหลดรูป QR Code จาก LINE Official Account Manager"
                compact
              />
              <Input
                label="LINE OA ID"
                value={lineOaId}
                onChange={(e) => setLineOaId(e.target.value)}
                placeholder="@mybottle"
                hint="แสดงบนใบเสร็จเป็น LINE: @mybottle"
              />
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <strong>ระบบ LINE Claim:</strong> ลูกค้าสแกน QR Code เพิ่มเพื่อน LINE OA แล้วพิมพ์รหัสฝาก (DEP-XXXXX) ในแชท ระบบจะผูก LINE กับรายการฝากอัตโนมัติ
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 6: Print Server (Silent Printing)                          */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="Print Server (พิมพ์อัตโนมัติ)"
          description="ตั้งค่าเครื่องพิมพ์สาขา — พิมพ์ใบฝากเหล้าและป้ายขวดแบบ silent (ไม่ต้องกดปุ่ม)"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <Monitor className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          {/* Status indicator */}
          {printServerStatus ? (
            <div className={`flex items-center gap-3 rounded-lg border p-3 ${
              printServerStatus.is_online && printServerStatus.last_heartbeat &&
              new Date().getTime() - new Date(printServerStatus.last_heartbeat).getTime() < 120000
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/10'
                : 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/10'
            }`}>
              {printServerStatus.is_online && printServerStatus.last_heartbeat &&
              new Date().getTime() - new Date(printServerStatus.last_heartbeat).getTime() < 120000 ? (
                <>
                  <Wifi className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Online</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500">
                      เครื่องพิมพ์: {printServerStatus.printer_name || '-'} |
                      PC: {printServerStatus.hostname || '-'} |
                      วันนี้พิมพ์: {printServerStatus.jobs_printed_today || 0} ใบ
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Offline</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      {printServerStatus.last_heartbeat
                        ? `Heartbeat ล่าสุด: ${new Date(printServerStatus.last_heartbeat).toLocaleString('th-TH')}`
                        : 'ยังไม่เคยเชื่อมต่อ'}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : printServerHasAccount ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <WifiOff className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">รอเชื่อมต่อ</p>
                <p className="text-xs text-gray-500">เปิด Print Server ที่ PC สาขาเพื่อเริ่มใช้งาน</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/50 dark:bg-blue-900/10">
              <Printer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">ยังไม่ได้ตั้งค่า</p>
                <p className="text-xs text-blue-600 dark:text-blue-500">กดปุ่ม &quot;ดาวน์โหลดตัวติดตั้ง&quot; เพื่อเริ่มตั้งค่าเครื่องพิมพ์</p>
              </div>
            </div>
          )}

          {/* Printer name */}
          <Input
            label="ชื่อเครื่องพิมพ์ (Windows)"
            value={printServerPrinterName}
            onChange={(e) => setPrintServerPrinterName(e.target.value)}
            placeholder="POS80"
            hint="ชื่อเครื่องพิมพ์ตามที่ปรากฏใน Windows Settings > Printers"
          />

          {/* Working hours */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                <Clock className="mr-1 inline h-3.5 w-3.5" />
                เวลาทำงาน
              </label>
              <button
                type="button"
                onClick={() => setPrintServerWorkingHours(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  printServerWorkingHours.enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  printServerWorkingHours.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {printServerWorkingHours.enabled && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={`${String(printServerWorkingHours.startHour).padStart(2, '0')}:${String(printServerWorkingHours.startMinute).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    setPrintServerWorkingHours(prev => ({ ...prev, startHour: h, startMinute: m }));
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <span className="text-sm text-gray-500">ถึง</span>
                <input
                  type="time"
                  value={`${String(printServerWorkingHours.endHour).padStart(2, '0')}:${String(printServerWorkingHours.endMinute).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    setPrintServerWorkingHours(prev => ({ ...prev, endHour: h, endMinute: m }));
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <Button variant="outline" size="sm" onClick={handleSaveWorkingHours}>
                  บันทึก
                </Button>
              </div>
            )}
            {!printServerWorkingHours.enabled && (
              <p className="text-xs text-gray-500">ปิดการตั้งเวลา — Print Server ทำงานตลอด 24 ชม.</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<Download className="h-4 w-4" />}
              onClick={handleDownloadConfig}
              isLoading={isDownloadingConfig}
            >
              {printServerHasAccount ? 'ดาวน์โหลด config ใหม่' : 'ดาวน์โหลดตัวติดตั้ง'}
            </Button>
            <Button
              variant="outline"
              icon={<TestTube className="h-4 w-4" />}
              onClick={handleTestPrint}
              isLoading={isTestingPrint}
            >
              ทดสอบพิมพ์
            </Button>
          </div>

          {/* Setup guide */}
          {!printServerHasAccount && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="mb-2 text-sm font-medium text-blue-700 dark:text-blue-400">วิธีตั้งค่า (3 ขั้นตอน)</p>
              <ol className="space-y-1 text-xs text-blue-600 dark:text-blue-400">
                <li>1. กด &quot;ดาวน์โหลดตัวติดตั้ง&quot; → ได้ config.json</li>
                <li>2. วาง config.json ในโฟลเดอร์ print-server ที่ PC สาขา → รัน SETUP.bat</li>
                <li>3. ดับเบิลคลิก START-PrintServer.bat → สถานะจะเปลี่ยนเป็น Online</li>
              </ol>
            </div>
          )}

          {/* Recent print jobs */}
          {recentPrintJobs.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">งานพิมพ์ล่าสุด</p>
              <div className="space-y-1">
                {recentPrintJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        job.job_type === 'receipt'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {job.job_type === 'receipt' ? 'ใบฝาก' : 'แปะขวด'}
                      </span>
                      <span className="text-gray-600 dark:text-gray-300">
                        {(job.payload as Record<string, string>)?.deposit_code || '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] ${
                        job.status === 'completed' ? 'text-emerald-600' :
                        job.status === 'failed' ? 'text-red-500' :
                        job.status === 'printing' ? 'text-blue-500' :
                        'text-gray-400'
                      }`}>
                        {job.status === 'completed' ? '✓' : job.status === 'failed' ? '✗' : job.status === 'printing' ? '⟳' : '○'}
                        {job.status === 'completed' ? 'สำเร็จ' : job.status === 'failed' ? 'ล้มเหลว' : job.status === 'printing' ? 'กำลังพิมพ์' : 'รอ'}
                      </span>
                      <span className="text-gray-400">
                        {new Date(job.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 7: ตั้งค่า Audit Log (Audit Log Retention)                  */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title="ตั้งค่า Audit Log"
          description="กำหนดระยะเวลาเก็บ log กิจกรรม ระบบจะลบ log เก่าอัตโนมัติ"
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/20">
              <ScrollText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              เก็บ Log กิจกรรมย้อนหลัง
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAuditLogRetentionDays(7)}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                  auditLogRetentionDays === 7
                    ? 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-900/20 dark:text-rose-300'
                    : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                7 วัน
              </button>
              <button
                type="button"
                onClick={() => setAuditLogRetentionDays(30)}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                  auditLogRetentionDays === 30
                    ? 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-900/20 dark:text-rose-300'
                    : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                30 วัน
              </button>
              <button
                type="button"
                onClick={() => setAuditLogRetentionDays(null)}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                  auditLogRetentionDays === null
                    ? 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-900/20 dark:text-rose-300'
                    : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                ไม่ลบ
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {auditLogRetentionDays
                ? <>ระบบจะลบ log กิจกรรมที่เก่ากว่า <strong>{auditLogRetentionDays} วัน</strong> อัตโนมัติทุกวัน</>
                : <><strong>ไม่ลบอัตโนมัติ:</strong> log กิจกรรมจะถูกเก็บไว้ตลอด</>
              }
            </p>
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
