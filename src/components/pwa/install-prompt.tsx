'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Bell, X, Smartphone, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useInstallPWA } from '@/hooks/use-install-pwa';
import { usePushSubscription } from '@/hooks/use-push-subscription';

const DISMISSED_KEY = 'pwa-install-prompt-dismissed';

type Platform = 'android' | 'ios' | 'unknown';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'unknown';
}

export function InstallPrompt() {
  const t = useTranslations('pwa');
  const { canInstall, isInstalled, isInstalling, install } = useInstallPWA();
  const { isSupported: pushSupported, isSubscribed, permission, subscribe, isLoading: pushLoading } = usePushSubscription();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'install' | 'notification' | 'done'>('install');

  const platform = useMemo(() => detectPlatform(), []);
  const isMobile = platform === 'android' || platform === 'ios';

  useEffect(() => {
    if (!isMobile) return;
    if (isInstalled) return;

    const wasDismissed = localStorage.getItem(DISMISSED_KEY);
    if (wasDismissed) {
      const dismissedAt = parseInt(wasDismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    const timer = setTimeout(() => setIsOpen(true), 1500);
    return () => clearTimeout(timer);
  }, [isMobile, isInstalled]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setIsOpen(false);
  };

  const handleInstall = async () => {
    if (platform === 'android' && canInstall) {
      const accepted = await install();
      if (accepted) {
        if (pushSupported && !isSubscribed && permission !== 'denied') {
          setStep('notification');
        } else {
          setStep('done');
          setTimeout(handleDismiss, 2000);
        }
      }
    }
    if (platform === 'ios') {
      if (pushSupported && !isSubscribed && permission !== 'denied') {
        setStep('notification');
      } else {
        setStep('done');
        setTimeout(handleDismiss, 2000);
      }
    }
  };

  const handleEnableNotification = async () => {
    try {
      await subscribe();
      setStep('done');
      setTimeout(handleDismiss, 2000);
    } catch {
      setStep('done');
      setTimeout(handleDismiss, 2000);
    }
  };

  const handleSkipNotification = () => {
    setStep('done');
    setTimeout(handleDismiss, 2000);
  };

  if (!isOpen || !isMobile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-white shadow-2xl dark:bg-gray-800"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          aria-label={t('understood')}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-6 pb-6 pt-8">
          {/* Step: Install */}
          {step === 'install' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900/30">
                <Smartphone className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('installOnMobile')}
              </h3>

              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {platform === 'android' ? t('androidInstallDesc') : t('iosInstallDesc')}
              </p>

              {platform === 'ios' && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {t('iosInstructions')}
                  </p>
                  <ol className="mt-2 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">1</span>
                      <span>{t('iosStep1')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">2</span>
                      <span>{t('iosStep2')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">3</span>
                      <span>{t('iosStep3')}</span>
                    </li>
                  </ol>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                {platform === 'android' && canInstall && (
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600',
                      isInstalling && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <Download className="h-4 w-4" />
                    {isInstalling ? t('enabling') : t('installNow')}
                  </button>
                )}

                {platform === 'ios' && (
                  <button
                    onClick={handleInstall}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                  >
                    {t('understood')}
                  </button>
                )}

                <button
                  onClick={handleDismiss}
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  {t('later')}
                </button>
              </div>
            </div>
          )}

          {/* Step: Notification */}
          {step === 'notification' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/30">
                <Bell className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('enableNotifications')}
              </h3>

              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('notificationDesc')}
              </p>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={handleEnableNotification}
                  disabled={pushLoading}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
                    pushLoading && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <Bell className="h-4 w-4" />
                  {pushLoading ? t('enabling') : t('enableNotifications')}
                </button>
                <button
                  onClick={handleSkipNotification}
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  {t('skipForNow')}
                </button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('allDone')}
              </h3>

              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('thankYou')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
