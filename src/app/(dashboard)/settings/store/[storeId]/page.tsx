'use client';

import { useTranslations } from 'next-intl';

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
  Smartphone,
  Copy,
  Check,
  Bot,
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
  /** LINE OA ของสาขา — channel access token */
  line_token: string | null;
  /** LINE OA ของสาขา — channel id (ไว้ resolve จาก webhook destination) */
  line_channel_id: string | null;
  /** LINE OA ของสาขา — channel secret (ไว้ verify signature) */
  line_channel_secret: string | null;
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

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function StoreDetailSettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const params = useParams();

  const dayLabels: Record<string, string> = {
    Mon: t('storeDetail.dayMon'),
    Tue: t('storeDetail.dayTue'),
    Wed: t('storeDetail.dayWed'),
    Thu: t('storeDetail.dayThu'),
    Fri: t('storeDetail.dayFri'),
    Sat: t('storeDetail.daySat'),
    Sun: t('storeDetail.daySun'),
  };
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

  // LINE OA credentials (per-store)
  const [lineToken, setLineToken] = useState('');
  const [lineChannelId, setLineChannelId] = useState('');
  const [lineChannelSecret, setLineChannelSecret] = useState('');
  const [showLineToken, setShowLineToken] = useState(false);
  const [showLineSecret, setShowLineSecret] = useState(false);

  // LINE group settings
  const [stockNotifyGroupId, setStockNotifyGroupId] = useState('');
  const [depositNotifyGroupId, setDepositNotifyGroupId] = useState('');
  const [barNotifyGroupId, setBarNotifyGroupId] = useState('');
  const [lineNotifyEnabled, setLineNotifyEnabled] = useState(true);

  // Staff notification settings
  const [borrowNotificationRoles, setBorrowNotificationRoles] = useState<string[]>(['owner', 'manager']);

  // Central LIFF ID (read-only — from system_settings)
  const [centralLiffId, setCentralLiffId] = useState('');
  const [liffLinkCopied, setLiffLinkCopied] = useState(false);

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

  // Withdrawal blocked days
  const [withdrawalBlockedDays, setWithdrawalBlockedDays] = useState<string[]>(['Fri', 'Sat']);

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
  const receiptPaperWidth = 80; // Fixed: 80mm thermal printer only
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
      .select('id, store_code, store_name, is_central, line_token, line_channel_id, line_channel_secret, stock_notify_group_id, deposit_notify_group_id, bar_notify_group_id, borrow_notification_roles')
      .eq('id', storeId)
      .single();

    if (store) {
      setStoreCode(store.store_code || '');
      setStoreName(store.store_name || '');
      setIsCentral(store.is_central || false);
      setLineToken(store.line_token || '');
      setLineChannelId(store.line_channel_id || '');
      setLineChannelSecret(store.line_channel_secret || '');
      setStockNotifyGroupId(store.stock_notify_group_id || '');
      setDepositNotifyGroupId(store.deposit_notify_group_id || '');
      setBarNotifyGroupId(store.bar_notify_group_id || '');
      setBorrowNotificationRoles(store.borrow_notification_roles || ['owner', 'manager']);
    }

    // Load central LIFF ID (from system_settings)
    const { data: sysRows } = await supabase
      .from('system_settings')
      .select('key, value')
      .eq('key', 'davis_ai.liff_id')
      .single();
    setCentralLiffId((sysRows?.value as string) || '');

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
      setWithdrawalBlockedDays((settings.withdrawal_blocked_days as string[] | null) ?? ['Fri', 'Sat']);

      // Load receipt settings from JSONB
      const rs = settings.receipt_settings as ReceiptSettings | null;
      if (rs) {
        setReceiptHeaderText(rs.header_text || '');
        setReceiptFooterText(rs.footer_text || '');
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
        // API returns JSON error when failed, ZIP when success
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(err.error || 'Failed to generate installer');
      }

      // Download as ZIP file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `print-server-${storeCode || 'store'}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setPrintServerHasAccount(true);
      toast({ type: 'success', title: t('storeDetail.downloadSuccess'), message: t('storeDetail.downloadSuccessMsg') });
    } catch (error) {
      toast({ type: 'error', title: t('storeDetail.downloadError'), message: (error as Error).message });
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
      toast({ type: 'success', title: t('storeDetail.testPrintSuccess'), message: t('storeDetail.testPrintSuccessMsg') });
    } catch (error) {
      toast({ type: 'error', title: t('storeDetail.testPrintError'), message: (error as Error).message });
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
    toast({ type: 'success', title: t('storeDetail.workingHoursSaved') });
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
        line_token: lineToken.trim() || null,
        line_channel_id: lineChannelId.trim() || null,
        line_channel_secret: lineChannelSecret.trim() || null,
        stock_notify_group_id: stockNotifyGroupId || null,
        deposit_notify_group_id: depositNotifyGroupId || null,
        bar_notify_group_id: barNotifyGroupId || null,
        borrow_notification_roles: borrowNotificationRoles,
      })
      .eq('id', storeId);

    if (storeError) {
      toast({ type: 'error', title: t('storeDetail.saveStoreError'), message: storeError.message });
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
          withdrawal_blocked_days: withdrawalBlockedDays,
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
      toast({ type: 'error', title: t('storeDetail.saveSettingsError'), message: settingsError.message });
    } else {
      toast({ type: 'success', title: t('storeDetail.saveSettingsSuccess') });
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
      toast({ type: 'error', title: t('storeDetail.deleteStoreError'), message: error.message });
      setIsDeleting(false);
      return;
    }

    toast({ type: 'success', title: t('storeDetail.deleteStoreSuccess') });
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

  const toggleWithdrawalBlockedDay = (day: string) => {
    setWithdrawalBlockedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleChannel = (channel: string) => {
    setCustomerChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const toggleBorrowRole = (role: string) => {
    setBorrowNotificationRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  // ---------------------------------------------------------------------------
  // LIFF link for this store (central LIFF + ?store={storeCode} param)
  // ---------------------------------------------------------------------------

  const storeLiffUrl =
    centralLiffId && storeCode
      ? `https://liff.line.me/${centralLiffId}?store=${encodeURIComponent(storeCode)}`
      : '';

  const copyLiffLink = async () => {
    if (!storeLiffUrl) return;
    try {
      await navigator.clipboard.writeText(storeLiffUrl);
      setLiffLinkCopied(true);
      setTimeout(() => setLiffLinkCopied(false), 2000);
    } catch {
      toast({ type: 'error', title: t('storeDetail.copyError') });
    }
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
          {t('storeDetail.back')}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
            <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {storeName || t('storeDetail.title')}
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
          title={t('storeDetail.storeInfoTitle')}
          description={t('storeDetail.storeInfoDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Store className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label={t('storeDetail.storeCodeLabel')}
            value={storeCode}
            readOnly
            disabled
            hint={t('storeDetail.storeCodeHint')}
          />
          <Input
            label={t('storeDetail.storeNameLabel')}
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder={t('storeDetail.storeNamePlaceholder')}
          />
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('storeDetail.centralWarehouse')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('storeDetail.centralWarehouseDesc')}
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
      {/* Section 1.5: LINE OA ของสาขา (channel credentials)                  */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('storeDetail.lineOaTitle')}
          description={t('storeDetail.lineOaDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/20">
              <Smartphone className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          {/* Clarify: this is per-store, NOT the central DAVIS Ai config */}
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800/50 dark:bg-violet-900/20">
            <div className="flex items-start gap-2">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <div className="flex-1 text-xs text-violet-800 dark:text-violet-300">
                <p className="font-medium">{t('storeDetail.lineOaBannerTitle')}</p>
                <p className="mt-0.5">
                  {t('storeDetail.lineOaBannerDesc')}{' '}
                  <Link
                    href="/settings/davis-ai"
                    className="font-medium underline decoration-dotted underline-offset-2 hover:text-violet-900 dark:hover:text-violet-200"
                  >
                    {t('storeDetail.lineOaBannerLink')}
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Channel ID */}
          <Input
            label={t('storeDetail.lineChannelIdLabel')}
            value={lineChannelId}
            onChange={(e) => setLineChannelId(e.target.value)}
            placeholder="1234567890"
            hint={t('storeDetail.lineChannelIdHint')}
          />

          {/* Channel Access Token (masked) */}
          <div>
            <Input
              label={t('storeDetail.lineTokenLabel')}
              type={showLineToken ? 'text' : 'password'}
              value={lineToken}
              onChange={(e) => setLineToken(e.target.value)}
              placeholder={t('storeDetail.lineTokenPlaceholder')}
              hint={t('storeDetail.lineTokenHint')}
            />
            <button
              type="button"
              onClick={() => setShowLineToken((v) => !v)}
              className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {showLineToken ? t('storeDetail.hide') : t('storeDetail.show')}
            </button>
          </div>

          {/* Channel Secret (masked) */}
          <div>
            <Input
              label={t('storeDetail.lineSecretLabel')}
              type={showLineSecret ? 'text' : 'password'}
              value={lineChannelSecret}
              onChange={(e) => setLineChannelSecret(e.target.value)}
              placeholder={t('storeDetail.lineSecretPlaceholder')}
              hint={t('storeDetail.lineSecretHint')}
            />
            <button
              type="button"
              onClick={() => setShowLineSecret((v) => !v)}
              className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {showLineSecret ? t('storeDetail.hide') : t('storeDetail.show')}
            </button>
          </div>

          {/* LIFF link preview (read-only) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="mb-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
              {t('storeDetail.liffLinkLabel')}
            </p>
            {storeLiffUrl ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                  {storeLiffUrl}
                </code>
                <button
                  type="button"
                  onClick={copyLiffLink}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
                  title={t('storeDetail.copy')}
                >
                  {liffLinkCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t('storeDetail.liffLinkMissing')}{' '}
                <Link
                  href="/settings/davis-ai"
                  className="font-medium underline decoration-dotted"
                >
                  {t('storeDetail.lineOaBannerLink')}
                </Link>
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t('storeDetail.liffLinkHint')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: กลุ่ม LINE แจ้งเตือน                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('storeDetail.lineGroupTitle')}
          description={t('storeDetail.lineGroupDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label={t('storeDetail.stockNotifyLabel')}
            value={stockNotifyGroupId}
            onChange={(e) => setStockNotifyGroupId(e.target.value)}
            placeholder={t('storeDetail.lineGroupPlaceholder')}
            hint={t('storeDetail.stockNotifyHint')}
          />
          <Input
            label={t('storeDetail.depositNotifyLabel')}
            value={depositNotifyGroupId}
            onChange={(e) => setDepositNotifyGroupId(e.target.value)}
            placeholder={t('storeDetail.lineGroupPlaceholder')}
            hint={t('storeDetail.depositNotifyHint')}
          />
          <Input
            label={t('storeDetail.barNotifyLabel')}
            value={barNotifyGroupId}
            onChange={(e) => setBarNotifyGroupId(e.target.value)}
            placeholder={t('storeDetail.lineGroupPlaceholder')}
            hint={t('storeDetail.barNotifyHint')}
          />
          {/* LINE Notify Toggle */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('storeDetail.lineNotifyToggle')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('storeDetail.lineNotifyToggleDesc')}
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
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="mb-2 text-xs font-semibold text-blue-800 dark:text-blue-300">
              {t('storeDetail.lineGroupHowToTitle')}
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs text-blue-700 dark:text-blue-400">
              <li>{t('storeDetail.lineGroupHowToStep1')}</li>
              <li>{t('storeDetail.lineGroupHowToStep2')}</li>
              <li>{t('storeDetail.lineGroupHowToStep3')}</li>
              <li>{t('storeDetail.lineGroupHowToStep4')}</li>
              <li>{t('storeDetail.lineGroupHowToStep5')}</li>
            </ol>
            <p className="mt-2 text-[11px] italic text-blue-600 dark:text-blue-500">
              {t('storeDetail.lineGroupHowToNote')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2.5: การแจ้งเตือนพนักงาน (Staff Notifications)               */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('storeDetail.staffNotifTitle')}
          description={t('storeDetail.staffNotifDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          }
        />
        <CardContent className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-white">
              {t('storeDetail.borrowNotifLabel')}
            </label>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              {t('storeDetail.borrowNotifDesc')}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { id: 'owner', label: t('storeDetail.roleOwner') },
                { id: 'manager', label: t('storeDetail.roleManager') },
                { id: 'bar', label: t('storeDetail.roleBar') },
                { id: 'staff', label: t('storeDetail.roleStaff') },
              ].map((role) => {
                const isSelected = borrowNotificationRoles.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleBorrowRole(role.id)}
                    className={`flex items-center justify-center rounded-xl border p-3 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
            <p className="text-xs italic text-gray-500 dark:text-gray-400">
              {t('storeDetail.roleNotifyNote')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: ตั้งค่าสต๊อก (Stock Settings)                            */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('storeDetail.stockSettingsTitle')}
          description={t('storeDetail.stockSettingsDesc')}
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
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('storeDetail.dailyReminderLabel')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('storeDetail.dailyReminderDesc')}
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
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('storeDetail.followUpLabel')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('storeDetail.followUpDesc')}
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
              {t('storeDetail.notifyTimeLabel')}
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
              {t('storeDetail.notifyDaysLabel')}
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
            label={t('storeDetail.diffToleranceLabel')}
            type="number"
            value={diffTolerance}
            onChange={(e) => setDiffTolerance(e.target.value)}
            placeholder="5"
            hint={t('storeDetail.diffToleranceHint')}
            min={0}
            max={100}
          />

          {/* Staff registration code */}
          <Input
            label={t('storeDetail.registrationCodeLabel')}
            value={registrationCode}
            onChange={(e) => setRegistrationCode(e.target.value)}
            placeholder={t('storeDetail.registrationCodePlaceholder')}
            hint={t('storeDetail.registrationCodeHint')}
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3.5: ตั้งค่าวันห้ามเบิกเหล้า (Withdrawal Blocked Days)     */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('storeDetail.blockedDaysTitle')}
          description={t('storeDetail.blockedDaysDesc')}
        />
        <CardContent>
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('storeDetail.blockedDaysSelectLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(dayLabels).map(([day, label]) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWithdrawalBlockedDay(day)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                      withdrawalBlockedDays.includes(day)
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t('storeDetail.blockedDaysNote')}
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>{t('storeDetail.blockedDaysCalendarNote')}</strong>
              </p>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                <strong>{t('storeDetail.blockedDaysExpiryNote')}</strong>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4: ตั้งค่าแจ้งเตือนลูกค้า (Customer Notifications)          */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('storeDetail.customerNotifTitle')}
          description={t('storeDetail.customerNotifDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <Bell className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
          }
        />

        {/* Notification channels */}
        <CardContent>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('storeDetail.notifChannelsLabel')}
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
            label={t('storeDetail.expiryNotifLabel')}
            description={t('storeDetail.expiryNotifDesc')}
            checked={customerExpiryEnabled}
            onChange={() => setCustomerExpiryEnabled(!customerExpiryEnabled)}
          />
          {customerExpiryEnabled && (
            <div className="px-5 py-3">
              <Input
                label={t('storeDetail.expiryDaysLabel')}
                type="number"
                value={customerExpiryDays}
                onChange={(e) => setCustomerExpiryDays(e.target.value)}
                hint={t('storeDetail.expiryDaysHint')}
                min={1}
                max={365}
              />
            </div>
          )}

          {/* Withdrawal notification */}
          <ToggleRow
            label={t('storeDetail.withdrawalNotifLabel')}
            description={t('storeDetail.withdrawalNotifDesc')}
            checked={customerWithdrawalEnabled}
            onChange={() => setCustomerWithdrawalEnabled(!customerWithdrawalEnabled)}
          />

          {/* Deposit notification */}
          <ToggleRow
            label={t('storeDetail.depositNotifLabel')}
            description={t('storeDetail.depositNotifDesc')}
            checked={customerDepositEnabled}
            onChange={() => setCustomerDepositEnabled(!customerDepositEnabled)}
          />

          {/* Promotion notification */}
          <ToggleRow
            label={t('storeDetail.promotionNotifLabel')}
            description={t('storeDetail.promotionNotifDesc')}
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
          title={t('storeDetail.receiptTitle')}
          description={t('storeDetail.receiptDesc')}
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
              <strong>{t('storeDetail.receiptPrintNote')}</strong>
            </p>
          </div>

          {/* Header text */}
          <Input
            label={t('storeDetail.receiptHeaderLabel')}
            value={receiptHeaderText}
            onChange={(e) => setReceiptHeaderText(e.target.value)}
            placeholder={t('storeDetail.receiptHeaderPlaceholder')}
            hint={t('storeDetail.receiptHeaderHint')}
          />

          {/* Copies */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t('storeDetail.receiptCopiesLabel')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('storeDetail.receiptCopiesDesc')}</p>
            </div>
            <Input
              label={t('storeDetail.labelCopiesLabel')}
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
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t('storeDetail.showLogoLabel')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('storeDetail.showLogoDesc')}</p>
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
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t('storeDetail.showQrLabel')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('storeDetail.showQrDesc')}</p>
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
                {t('storeDetail.lineOaQrTitle')}
              </p>
              <PhotoUpload
                value={qrCodeImageUrl || null}
                onChange={(url) => setQrCodeImageUrl(url || '')}
                folder="qr-codes"
                label={t('storeDetail.qrImageLabel')}
                placeholder={t('storeDetail.qrImagePlaceholder')}
                compact
              />
              <Input
                label="LINE OA ID"
                value={lineOaId}
                onChange={(e) => setLineOaId(e.target.value)}
                placeholder="@mybottle"
                hint={t('storeDetail.lineOaIdHint')}
              />
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <strong>{t('storeDetail.lineClaimNote')}</strong>
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
          title={t('storeDetail.printServerTitle')}
          description={t('storeDetail.printServerDesc')}
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
                      {t('storeDetail.psOnlineInfo', { printer: printServerStatus.printer_name || '-', hostname: printServerStatus.hostname || '-', count: printServerStatus.jobs_printed_today || 0 })}
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
                        ? t('storeDetail.psLastHeartbeat', { time: new Date(printServerStatus.last_heartbeat).toLocaleString('th-TH') })
                        : t('storeDetail.psNeverConnected')}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : printServerHasAccount ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <WifiOff className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('storeDetail.psWaiting')}</p>
                <p className="text-xs text-gray-500">{t('storeDetail.psWaitingDesc')}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/50 dark:bg-blue-900/10">
              <Printer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">{t('storeDetail.psNotConfigured')}</p>
                <p className="text-xs text-blue-600 dark:text-blue-500">{t('storeDetail.psNotConfiguredDesc')}</p>
              </div>
            </div>
          )}

          {/* Printer name */}
          <Input
            label={t('storeDetail.printerNameLabel')}
            value={printServerPrinterName}
            onChange={(e) => setPrintServerPrinterName(e.target.value)}
            placeholder="POS80"
            hint={t('storeDetail.printerNameHint')}
          />

          {/* Working hours */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                <Clock className="mr-1 inline h-3.5 w-3.5" />
                {t('storeDetail.workingHoursLabel')}
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
                <span className="text-sm text-gray-500">{t('storeDetail.toTime')}</span>
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
                  {t('storeDetail.save')}
                </Button>
              </div>
            )}
            {!printServerWorkingHours.enabled && (
              <p className="text-xs text-gray-500">{t('storeDetail.workingHoursDisabled')}</p>
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
              {printServerHasAccount ? t('storeDetail.downloadConfigNew') : t('storeDetail.downloadInstaller')}
            </Button>
            <Button
              variant="outline"
              icon={<TestTube className="h-4 w-4" />}
              onClick={handleTestPrint}
              isLoading={isTestingPrint}
            >
              {t('storeDetail.testPrint')}
            </Button>
          </div>

          {/* Setup guide — แสดงเสมอถ้ายังไม่ Online */}
          {!(printServerStatus?.is_online && printServerStatus?.last_heartbeat &&
            new Date().getTime() - new Date(printServerStatus.last_heartbeat).getTime() < 120000) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="mb-3 text-sm font-semibold text-blue-700 dark:text-blue-400">
                {t('storeDetail.psSetupGuideTitle')}
              </p>
              <div className="space-y-3">
                {/* Step 1 */}
                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-800 dark:bg-blue-800 dark:text-blue-200">1</div>
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">{t('storeDetail.psStep1Title')}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {t('storeDetail.psStep1Desc')}
                    </p>
                  </div>
                </div>
                {/* Step 2 */}
                <div className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-800 dark:bg-blue-800 dark:text-blue-200">2</div>
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">{t('storeDetail.psStep2Title')}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {t('storeDetail.psStep2Desc')}
                    </p>
                    <p className="mt-1.5 text-xs text-blue-500 dark:text-blue-500">
                      {t('storeDetail.psStep2Auto')}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-blue-500 dark:text-blue-500">
                      <li>{t('storeDetail.psAutoStep1')}</li>
                      <li>{t('storeDetail.psAutoStep2')}</li>
                      <li>{t('storeDetail.psAutoStep3')}</li>
                      <li>{t('storeDetail.psAutoStep4')}</li>
                      <li>{t('storeDetail.psAutoStep5')}</li>
                    </ul>
                    <p className="mt-1.5 text-xs text-blue-500 dark:text-blue-500">
                      {t('storeDetail.psManualInstall')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-800/50 dark:text-blue-300 dark:hover:bg-blue-800">
                        <ExternalLink className="h-2.5 w-2.5" /> Node.js
                      </a>
                      <a href="https://www.sumatrapdfreader.org/download-free-pdf-viewer" target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-800/50 dark:text-blue-300 dark:hover:bg-blue-800">
                        <ExternalLink className="h-2.5 w-2.5" /> SumatraPDF ({t('storeDetail.psSumatraDesc')})
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-blue-100 p-2.5 dark:bg-blue-800/30">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>{t('storeDetail.psAutoOnlineNote')}</strong>
                </p>
              </div>

              {/* Troubleshooting tips */}
              <div className="mt-3 border-t border-blue-200 pt-3 dark:border-blue-700">
                <p className="mb-1 text-xs font-medium text-blue-700 dark:text-blue-400">{t('storeDetail.psTroubleshootTitle')}</p>
                <ul className="space-y-0.5 text-xs text-blue-600 dark:text-blue-400">
                  <li>{t('storeDetail.psTroubleshoot1')}</li>
                  <li>{t('storeDetail.psTroubleshoot2')}</li>
                  <li>{t('storeDetail.psTroubleshoot3')}</li>
                </ul>
              </div>
            </div>
          )}

          {/* Recent print jobs */}
          {recentPrintJobs.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{t('storeDetail.recentPrintJobs')}</p>
              <div className="space-y-1">
                {recentPrintJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        job.job_type === 'receipt'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {job.job_type === 'receipt' ? t('storeDetail.jobReceipt') : t('storeDetail.jobLabel')}
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
                        {job.status === 'completed' ? t('storeDetail.jobCompleted') : job.status === 'failed' ? t('storeDetail.jobFailed') : job.status === 'printing' ? t('storeDetail.jobPrinting') : t('storeDetail.jobPending')}
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
          title={t('storeDetail.auditLogTitle')}
          description={t('storeDetail.auditLogDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/20">
              <ScrollText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('storeDetail.auditLogRetention')}
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
                {t('storeDetail.auditLog7days')}
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
                {t('storeDetail.auditLog30days')}
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
                {t('storeDetail.auditLogNoDelete')}
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {auditLogRetentionDays
                ? t('storeDetail.auditLogRetentionNote', { days: auditLogRetentionDays })
                : <><strong>{t('storeDetail.auditLogNoDeleteNote')}</strong></>
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
          {t('storeDetail.saveSettings')}
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Danger Zone: Delete Store                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none" className="ring-red-200 dark:ring-red-800/50">
        <CardHeader
          title={t('storeDetail.deleteStoreTitle')}
          description={t('storeDetail.deleteStoreDesc')}
          className="border-b-red-100 dark:border-b-red-900/30"
        />
        <CardContent>
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setShowDeleteModal(true)}
          >
            {t('storeDetail.deleteThisStore')}
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
        title={t('storeDetail.deleteConfirmTitle')}
        description={t('storeDetail.deleteConfirmDesc')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-300">
              {t('storeDetail.deleteWarning', { name: storeName })}
            </p>
          </div>
          <Input
            label={t('storeDetail.deleteTypeConfirm', { name: storeName })}
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
            {t('storeDetail.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteStore}
            isLoading={isDeleting}
            disabled={deleteConfirmText !== storeName}
            icon={<Trash2 className="h-4 w-4" />}
          >
            {t('storeDetail.deleteStore')}
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
