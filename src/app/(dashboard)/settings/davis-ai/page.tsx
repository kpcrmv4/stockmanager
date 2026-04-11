'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
  toast,
} from '@/components/ui';
import {
  ArrowLeft,
  Bot,
  Save,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Link as LinkIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_KEYS = {
  BOT_NAME: 'davis_ai.bot_name',
  LIFF_ID: 'davis_ai.liff_id',
} as const;

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function DavisAiSettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings.davisAi');
  const { user } = useAuthStore();
  const isOwner = user?.role === 'owner';

  // Form state
  const [botName, setBotName] = useState('DAVIS Ai');
  const [liffId, setLiffId] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [liffUrlCopied, setLiffUrlCopied] = useState(false);

  // Derived values
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/line/webhook`
      : '';
  const liffBaseUrl = liffId ? `https://liff.line.me/${liffId}` : '';

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [SYSTEM_KEYS.BOT_NAME, SYSTEM_KEYS.LIFF_ID]);

    if (error) {
      toast({ type: 'error', title: t('loadError'), message: error.message });
      setIsLoading(false);
      return;
    }

    const map: Record<string, string> = {};
    for (const row of data || []) {
      map[row.key] = row.value || '';
    }

    setBotName(map[SYSTEM_KEYS.BOT_NAME] || 'DAVIS Ai');
    setLiffId(map[SYSTEM_KEYS.LIFF_ID] || '');
    setIsLoading(false);
  }, [t]);

  useEffect(() => {
    if (isOwner) {
      loadSettings();
    } else {
      setIsLoading(false);
    }
  }, [isOwner, loadSettings]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    setIsSaving(true);
    const supabase = createClient();

    const rows = [
      { key: SYSTEM_KEYS.BOT_NAME, value: botName.trim() || 'DAVIS Ai' },
      { key: SYSTEM_KEYS.LIFF_ID, value: liffId.trim() },
    ];

    const { error } = await supabase
      .from('system_settings')
      .upsert(rows, { onConflict: 'key' });

    if (error) {
      toast({ type: 'error', title: t('saveError'), message: error.message });
    } else {
      toast({ type: 'success', title: t('saveSuccess') });
    }
    setIsSaving(false);
  };

  // ---------------------------------------------------------------------------
  // Clipboard helpers
  // ---------------------------------------------------------------------------

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 2000);
    } catch {
      toast({ type: 'error', title: t('copyError') });
    }
  };

  const copyLiffUrl = async () => {
    if (!liffBaseUrl) return;
    try {
      await navigator.clipboard.writeText(liffBaseUrl);
      setLiffUrlCopied(true);
      setTimeout(() => setLiffUrlCopied(false), 2000);
    } catch {
      toast({ type: 'error', title: t('copyError') });
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-8">
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t('ownerOnly')}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      {/* Back button + Title */}
      <div>
        <button
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {botName || 'DAVIS Ai'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Info banner — separate central vs per-store clearly */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800/50 dark:bg-indigo-900/20">
        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
          {t('bannerTitle')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">
          {t('bannerDesc')}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Bot Identity                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('identityTitle')}
          description={t('identityDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label={t('botNameLabel')}
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="DAVIS Ai"
            hint={t('botNameHint')}
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Shared LIFF                                             */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('liffTitle')}
          description={t('liffDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <LinkIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <Input
            label={t('liffIdLabel')}
            value={liffId}
            onChange={(e) => setLiffId(e.target.value)}
            placeholder="1234567890-abcdefgh"
            hint={t('liffIdHint')}
          />

          {liffBaseUrl && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <p className="mb-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                {t('liffBaseUrlLabel')}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                  {liffBaseUrl}
                </code>
                <button
                  onClick={copyLiffUrl}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
                  title={t('copy')}
                >
                  {liffUrlCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t('liffUrlUsage')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Webhook URL                                             */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('webhookTitle')}
          description={t('webhookDesc')}
          action={
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <ExternalLink className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
          }
        />
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-gray-100 px-3 py-2.5 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">
              {webhookUrl || '—'}
            </code>
            <button
              onClick={copyWebhook}
              disabled={!webhookUrl}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {webhookCopied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  {t('copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  {t('copy')}
                </>
              )}
            </button>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
            <p className="mb-2 text-xs font-semibold text-blue-900 dark:text-blue-200">
              {t('setupGuideTitle')}
            </p>
            <ol className="ml-4 list-decimal space-y-1.5 text-xs text-blue-800 dark:text-blue-300">
              <li>{t('setupStep1')}</li>
              <li>{t('setupStep2')}</li>
              <li>{t('setupStep3')}</li>
              <li>{t('setupStep4')}</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4: Keyword reference (read-only)                          */}
      {/* ------------------------------------------------------------------ */}
      <Card padding="none">
        <CardHeader
          title={t('keywordsTitle')}
          description={t('keywordsDesc')}
        />
        <CardContent className="space-y-5">
          {/* Category 1: Deposit code lookup */}
          <div>
            <p className="mb-2 text-xs font-semibold text-gray-900 dark:text-white">
              {t('keywordGroupDepCodeTitle')}
            </p>
            <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
              {t('keywordDep')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <code className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-xs text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                DEP-xxxxx
              </code>
            </div>
          </div>

          {/* Category 2: Deposit system entry */}
          <div>
            <p className="mb-2 text-xs font-semibold text-gray-900 dark:text-white">
              {t('keywordGroupDepositTitle')}
            </p>
            <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
              {t('keywordDeposit')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'ฝากเหล้า',
                'ระบบฝาก',
                'ของฝาก',
                'เหล้าฝาก',
                'เช็คเหล้า',
                'ดูเหล้า',
                'ดูของฝาก',
                'เหล้า',
                'เมนู',
                'ช่วยเหลือ',
                'เริ่ม',
                'สวัสดี',
                'deposit',
                'menu',
                'start',
                'help',
                'hi',
                'hello',
                '?',
                '/menu',
                '/start',
                '/help',
                '/deposit',
              ].map((kw) => (
                <code
                  key={kw}
                  className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                >
                  {kw}
                </code>
              ))}
            </div>
          </div>

          {/* Category 3: Group ID (in LINE group only) */}
          <div>
            <p className="mb-2 text-xs font-semibold text-gray-900 dark:text-white">
              {t('keywordGroupGroupIdTitle')}
            </p>
            <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
              {t('keywordGroupGroupIdDesc')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'groupid',
                'group id',
                '/groupid',
                '/group id',
                'id กลุ่ม',
                'กลุ่ม id',
                'ขอ group id',
                'ขอ id กลุ่ม',
              ].map((kw) => (
                <code
                  key={kw}
                  className="rounded bg-violet-100 px-2 py-0.5 font-mono text-xs text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                >
                  {kw}
                </code>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-[11px] text-blue-700 dark:text-blue-400">
              {t('keywordGroupNote')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="sticky bottom-4 z-10">
        <Button
          variant="primary"
          icon={<Save className="h-4 w-4" />}
          isLoading={isSaving}
          onClick={handleSave}
          className="w-full shadow-lg"
        >
          {t('saveButton')}
        </Button>
      </div>
    </div>
  );
}
