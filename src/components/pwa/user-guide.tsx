'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X, Sparkles, CheckCircle2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const STORAGE_KEY = 'user-guide-completed-v1';
const PWA_DISMISSED_KEY = 'pwa-install-prompt-dismissed';

type Step = {
  labelKey: string;
  titleKey: string;
  descKey: string;
  image: string | null;
};

const STEPS: Step[] = [
  {
    labelKey: 'userGuide.step1.label',
    titleKey: 'userGuide.step1.title',
    descKey: 'userGuide.step1.desc',
    image: null,
  },
  {
    labelKey: 'userGuide.step2.label',
    titleKey: 'userGuide.step2.title',
    descKey: 'userGuide.step2.desc',
    image: 'https://oogyjqywuqmutkjnnsik.supabase.co/storage/v1/object/public/Manual/Overview_Staff.png',
  },
  {
    labelKey: 'userGuide.step3.label',
    titleKey: 'userGuide.step3.title',
    descKey: 'userGuide.step3.desc',
    image: 'https://oogyjqywuqmutkjnnsik.supabase.co/storage/v1/object/public/Manual/Chat_Staff.png',
  },
  {
    labelKey: 'userGuide.step4.label',
    titleKey: 'userGuide.step4.title',
    descKey: 'userGuide.step4.desc',
    image: 'https://oogyjqywuqmutkjnnsik.supabase.co/storage/v1/object/public/Manual/menu_Staff.png',
  },
  {
    labelKey: 'userGuide.step5.label',
    titleKey: 'userGuide.step5.title',
    descKey: 'userGuide.step5.desc',
    image: 'https://oogyjqywuqmutkjnnsik.supabase.co/storage/v1/object/public/Manual/Deposit_Staff.png',
  },
  {
    labelKey: 'userGuide.step6.label',
    titleKey: 'userGuide.step6.title',
    descKey: 'userGuide.step6.desc',
    image: 'https://oogyjqywuqmutkjnnsik.supabase.co/storage/v1/object/public/Manual/LineLiff.png',
  },
  {
    labelKey: 'userGuide.step7.label',
    titleKey: 'userGuide.step7.title',
    descKey: 'userGuide.step7.desc',
    image: 'https://oogyjqywuqmutkjnnsik.supabase.co/storage/v1/object/public/Manual/Withdraw_Staff.png',
  },
];

export function UserGuide() {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const pwaDismissed = localStorage.getItem(PWA_DISMISSED_KEY);
    let dismissedRecent = false;
    if (pwaDismissed) {
      const at = parseInt(pwaDismissed, 10);
      if (!Number.isNaN(at) && Date.now() - at < 7 * 24 * 60 * 60 * 1000) {
        dismissedRecent = true;
      }
    }

    const willShowPwaPrompt = isMobile && !isInstalled && !dismissedRecent;

    if (!willShowPwaPrompt) {
      const tm = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(tm);
    }

    const onPwaDone = () => {
      setTimeout(() => setIsOpen(true), 300);
    };
    window.addEventListener('pwa-flow-done', onPwaDone);
    return () => window.removeEventListener('pwa-flow-done', onPwaDone);
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setIsOpen(false);
    setConfirmClose(false);
  }, []);

  const requestClose = () => setConfirmClose(true);
  const cancelClose = () => setConfirmClose(false);

  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const current = STEPS[step];

  if (!isOpen) return null;

  return (
    <div className="font-playpen fixed inset-0 z-[60] flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">
              {t('userGuide.headerTitle')}
            </h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {t('userGuide.headerSubtitle', { current: step + 1, total: STEPS.length })}
            </p>
          </div>
        </div>
        <button
          onClick={requestClose}
          className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {t('userGuide.understood')}
        </button>
      </header>

      {/* Tab strip */}
      <div className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto px-3 py-2">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                i === step
                  ? 'bg-indigo-600 text-white shadow-md dark:bg-indigo-500'
                  : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  i === step
                    ? 'bg-white text-indigo-600'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-200',
                )}
              >
                {i + 1}
              </span>
              <span className="whitespace-nowrap">{t(s.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-bold leading-snug text-gray-900 sm:text-2xl dark:text-white">
            {t(current.titleKey)}
          </h2>
          <p className="mt-3 text-center text-sm leading-relaxed text-gray-600 sm:text-base dark:text-gray-300">
            {t(current.descKey)}
          </p>

          {current.image ? (
            <div className="group relative mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-md dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label={t('userGuide.zoom')}
                className="relative block aspect-[3/4] w-full sm:aspect-[16/10]"
              >
                <Image
                  src={current.image}
                  alt={t(current.titleKey)}
                  fill
                  unoptimized
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, 768px"
                  priority={step <= 1}
                />
                <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-sm">
                  <Maximize2 className="h-3.5 w-3.5" />
                  {t('userGuide.zoom')}
                </span>
              </button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 px-6 py-12 dark:from-indigo-900/20 dark:to-purple-900/20">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                <Sparkles className="h-10 w-10" />
              </div>
              <p className="mt-5 text-center text-sm leading-relaxed text-gray-600 sm:text-base dark:text-gray-300">
                {t('userGuide.welcomeNote')}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="safe-area-inset-bottom border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
              isFirst
                ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('userGuide.prev')}
          </button>

          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === step
                    ? 'w-6 bg-indigo-600 dark:bg-indigo-400'
                    : 'w-1.5 bg-gray-300 dark:bg-gray-600',
                )}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={finish}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg"
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('userGuide.gotIt')}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {t('userGuide.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>

      {/* Zoomed image viewer */}
      {zoomed && current.image && (
        <button
          type="button"
          onClick={() => setZoomed(false)}
          aria-label={t('userGuide.zoomClose')}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-2"
        >
          <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-md backdrop-blur-md">
            <X className="h-4 w-4" />
            {t('userGuide.zoomClose')}
          </span>
          <div className="relative h-full w-full">
            <Image
              src={current.image}
              alt={t(current.titleKey)}
              fill
              unoptimized
              className="object-contain"
              sizes="100vw"
              priority
            />
          </div>
        </button>
      )}

      {/* Confirm-close dialog */}
      {confirmClose && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <X className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {t('userGuide.confirmTitle')}
                </h3>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">
                  {t('userGuide.confirmMessage')}
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={cancelClose}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                {t('userGuide.cancel')}
              </button>
              <button
                onClick={finish}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-red-700"
              >
                {t('userGuide.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
