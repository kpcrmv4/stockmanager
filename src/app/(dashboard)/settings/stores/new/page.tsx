'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  Button,
  Input,
  Textarea,
  Card,
  CardHeader,
  CardContent,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  ArrowLeft,
  ArrowRight,
  Store,
  Package,
  Users,
  Bell,
  Check,
} from 'lucide-react';

export default function CreateStoreWizardPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const { user } = useAuthStore();

  const steps = [
    { id: 1, label: t('newStore.stepStoreInfo'), icon: Store },
    { id: 2, label: t('newStore.stepProducts'), icon: Package },
    { id: 3, label: t('newStore.stepStaff'), icon: Users },
    { id: 4, label: t('newStore.stepNotifications'), icon: Bell },
  ];
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Step 1: Store info
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [isCentral, setIsCentral] = useState(false);

  // Step 4: Notifications
  const [notifyTime, setNotifyTime] = useState('09:00');
  const [notifyDays, setNotifyDays] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  const dayLabels: Record<string, string> = {
    Mon: t('newStore.dayMon'), Tue: t('newStore.dayTue'), Wed: t('newStore.dayWed'), Thu: t('newStore.dayThu'), Fri: t('newStore.dayFri'), Sat: t('newStore.daySat'), Sun: t('newStore.daySun'),
  };

  const toggleDay = (day: string) => {
    setNotifyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleCreate = async () => {
    if (!storeCode || !storeName || !user) return;
    setIsSubmitting(true);

    const supabase = createClient();

    // 1. Create store
    // LINE notification group IDs are configured later via the per-store
    // settings page — use the `groupid` bot keyword to retrieve them.
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .insert({
        store_code: storeCode.trim().toUpperCase(),
        store_name: storeName.trim(),
        is_central: isCentral,
        manager_id: user.id,
        active: true,
      })
      .select()
      .single();

    if (storeError || !store) {
      toast({ type: 'error', title: t('newStore.errorCreate'), message: storeError?.message });
      setIsSubmitting(false);
      return;
    }

    // 2. Create store settings
    await supabase.from('store_settings').insert({
      store_id: store.id,
      notify_time_daily: notifyTime,
      notify_days: notifyDays,
      diff_tolerance: 5,
    });

    // 3. Assign owner to store
    await supabase.from('user_stores').insert({
      user_id: user.id,
      store_id: store.id,
    });

    setIsSubmitting(false);
    setIsComplete(true);
    toast({ type: 'success', title: t('newStore.createSuccess'), message: t('newStore.createSuccessMsg', { name: storeName }) });
  };

  if (isComplete) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('newStore.successTitle')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('newStore.successDesc', { name: storeName })}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/settings')}>
              {t('newStore.backToSettings')}
            </Button>
            <Button onClick={() => router.push('/')}>
              {t('newStore.goHome')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('newStore.back')}
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('newStore.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('newStore.subtitle')}
        </p>
      </div>

      {/* Steps Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;

          return (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                    isActive && 'bg-indigo-600 text-white',
                    isCompleted && 'bg-emerald-500 text-white',
                    !isActive && !isCompleted && 'bg-gray-100 text-gray-400 dark:bg-gray-700'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 hidden sm:block">
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-1 h-0.5 w-8 sm:w-12',
                    step.id < currentStep
                      ? 'bg-emerald-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card padding="none">
        <CardHeader title={steps[currentStep - 1].label} />
        <CardContent className="space-y-4">
          {currentStep === 1 && (
            <>
              <Input
                label={t('newStore.storeCodeLabel')}
                value={storeCode}
                onChange={(e) => setStoreCode(e.target.value)}
                placeholder={t('newStore.storeCodePlaceholder')}
                hint={t('newStore.storeCodeHint')}
              />
              <Input
                label={t('newStore.storeNameLabel')}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={t('newStore.storeNamePlaceholder')}
              />
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <input
                  type="checkbox"
                  id="isCentral"
                  checked={isCentral}
                  onChange={(e) => setIsCentral(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="isCentral" className="text-sm text-gray-700 dark:text-gray-300">
                  {t('newStore.isCentral')}
                </label>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('newStore.productsDesc')}
              </p>
              <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
                <Package className="h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-500">{t('newStore.productsLater')}</p>
                <p className="text-xs text-gray-400">{t('newStore.productsImportHint')}</p>
              </div>
            </>
          )}

          {currentStep === 3 && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('newStore.staffDesc')}
              </p>
              <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
                <Users className="h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-500">{t('newStore.staffLater')}</p>
                <p className="text-xs text-gray-400">{t('newStore.staffHint')}</p>
              </div>
            </>
          )}

          {currentStep === 4 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('newStore.notifyTimeLabel')}
                </label>
                <Input
                  type="time"
                  value={notifyTime}
                  onChange={(e) => setNotifyTime(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('newStore.notifyDaysLabel')}
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={currentStep === 1}
          icon={<ArrowLeft className="h-4 w-4" />}
        >
          {t('newStore.previous')}
        </Button>

        {currentStep < 4 ? (
          <Button
            onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}
            disabled={currentStep === 1 && (!storeCode || !storeName)}
            icon={<ArrowRight className="h-4 w-4" />}
          >
            {t('newStore.next')}
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            isLoading={isSubmitting}
            disabled={!storeCode || !storeName}
            icon={<Check className="h-4 w-4" />}
          >
            {t('newStore.createStore')}
          </Button>
        )}
      </div>
    </div>
  );
}
