'use client';

import { useTranslations } from 'next-intl';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Camera,
  Pencil,
  Check,
  X,
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
  const t = useTranslations('profile');
  const { user, updateUser } = useAuthStore();
  const pushSub = usePushSubscription();

  const [prefs, setPrefs] = useState<NotifPrefs>(defaultPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Profile editing state
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nickname, setNickname] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setNickname(user.displayName || '');
    }
  }, [user]);

  // ---------------------------------------------------------------------------
  // Avatar upload
  // ---------------------------------------------------------------------------

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedTypes.includes(file.type)) {
      toast({ type: 'error', title: t('avatarInvalidType') });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ type: 'error', title: t('avatarFileTooLarge') });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'avatars');

      const res = await fetch('/api/upload/photo', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');

      const { url } = await res.json();
      const supabase = createClient();
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', user.id);

      if (error) throw error;

      updateUser({ avatarUrl: url });
      toast({ type: 'success', title: t('avatarUploadSuccess') });
    } catch {
      toast({ type: 'error', title: t('avatarUploadFailed') });
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // ---------------------------------------------------------------------------
  // Save nickname
  // ---------------------------------------------------------------------------

  const handleSaveNickname = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const supabase = createClient();
      const newName = nickname.trim() || null;
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: newName })
        .eq('id', user.id);

      if (error) throw error;

      updateUser({ displayName: newName });
      setIsEditingNickname(false);
      toast({ type: 'success', title: t('nicknameSaveSuccess') });
    } catch {
      toast({ type: 'error', title: t('nicknameSaveFailed') });
    } finally {
      setIsSavingProfile(false);
    }
  };

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
      toast({ type: 'error', title: t('userNotFound') });
      return;
    }

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: authUser.id, ...prefs }, { onConflict: 'user_id' });

    if (error) {
      toast({ type: 'error', title: t('saveFailed'), message: error.message });
    } else {
      toast({ type: 'success', title: t('settingsSaveSuccess') });
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
        toast({ type: 'error', title: t('notificationBlocked'), message: t('notificationBlockedMsg') });
      } else if (msg === 'NOTIFICATION_DISMISSED') {
        toast({ type: 'error', title: t('notificationDismissed') });
      } else {
        toast({ type: 'error', title: t('deviceRegisterFailed'), message: t('pleaseTryAgain') });
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
      <Card padding="none">
        <CardContent className="flex flex-col items-center gap-4 py-6">
          {/* Avatar with upload */}
          <div className="relative">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName ?? user.username}
                className="h-24 w-24 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                <User className="h-12 w-12 text-indigo-400 dark:text-indigo-500" />
              </div>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isUploadingAvatar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* Nickname editing */}
          <div className="flex flex-col items-center gap-1">
            {isEditingNickname ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t('setNicknamePlaceholder')}
                  className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-center text-lg font-bold text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNickname();
                    if (e.key === 'Escape') {
                      setNickname(user.displayName || '');
                      setIsEditingNickname(false);
                    }
                  }}
                />
                <button
                  onClick={handleSaveNickname}
                  disabled={isSavingProfile}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                >
                  {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => {
                    setNickname(user.displayName || '');
                    setIsEditingNickname(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingNickname(true)}
                className="group flex items-center gap-2"
              >
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {user.displayName || user.username}
                </h1>
                <Pencil className="h-4 w-4 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            {!user.displayName && !isEditingNickname && (
              <button
                onClick={() => setIsEditingNickname(true)}
                className="text-xs text-indigo-500 hover:text-indigo-600"
              >
                {t('setNickname')}
              </button>
            )}
          </div>

          {/* Role badge + username */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              <Shield className="h-3 w-3" />
              {ROLE_LABELS[user.role]}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              @{user.username}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: ช่องทางการแจ้งเตือน (Notification Channels)              */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('notificationChannels')}
          description={t('notificationChannelsDesc')}
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
                    ? t('pushNotSupported')
                    : pushSub.isSubscribed
                      ? t('pushEnabled')
                      : pushSub.permission === 'denied'
                        ? t('pushDenied')
                        : pushSub.permission === 'granted'
                          ? t('pushGrantedNotRegistered')
                          : t('pushDisabled')}
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
                  {prefs.line_enabled ? t('lineEnabled') : t('lineDisabled')}
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
          title={t('notificationTypes')}
          description={t('notificationTypesDesc')}
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
              label={t('stockAlert')}
              description={t('stockAlertDesc')}
              checked={prefs.notify_stock_alert}
              onChange={() => togglePref('notify_stock_alert')}
            />
          )}

          {/* Approval Request — for owner/manager */}
          {isOwnerOrManager && (
            <ToggleRow
              label={t('approvalRequest')}
              description={t('approvalRequestDesc')}
              checked={prefs.notify_approval_request}
              onChange={() => togglePref('notify_approval_request')}
            />
          )}

          {/* Deposit confirmed */}
          <ToggleRow
            label={t('depositConfirmed')}
            description={t('depositConfirmedDesc')}
            checked={prefs.notify_deposit_confirmed}
            onChange={() => togglePref('notify_deposit_confirmed')}
          />

          {/* Withdrawal completed */}
          <ToggleRow
            label={t('withdrawalCompleted')}
            description={t('withdrawalCompletedDesc')}
            checked={prefs.notify_withdrawal_completed}
            onChange={() => togglePref('notify_withdrawal_completed')}
          />

          {/* Expiry warning */}
          <ToggleRow
            label={t('expiryWarning')}
            description={t('expiryWarningDesc')}
            checked={prefs.notify_expiry_warning}
            onChange={() => togglePref('notify_expiry_warning')}
          />

          {/* Promotions */}
          <ToggleRow
            label={t('promotions')}
            description={t('promotionsDesc')}
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
          {t('saveSettings')}
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
