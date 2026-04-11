'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  Button,
  Card,
  CardHeader,
} from '@/components/ui';
import {
  Store,
  Plus,
  ChevronRight,
  Upload,
  Bot,
} from 'lucide-react';

interface StoreInfo {
  id: string;
  store_code: string;
  store_name: string;
  is_central: boolean;
  active: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const { user } = useAuthStore();
  const isOwner = user?.role === 'owner';
  const [stores, setStores] = useState<StoreInfo[]>([]);


  const loadStores = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_code, store_name, is_central, active')
      .order('store_name');
    if (data) setStores(data);
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('subtitle')}
        </p>
      </div>

      {/* DAVIS Ai Central Config — Owner only */}
      {isOwner && (
        <Card padding="none">
          <button
            onClick={() => router.push('/settings/davis-ai')}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('davisAiTitle')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('davisAiDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>
        </Card>
      )}

      {/* Stores List */}
      <Card padding="none">
        <CardHeader
          title={t('storeList')}
          description={t('storeListDesc')}
          action={
            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => router.push('/settings/stores/new')}
            >
              {t('addStore')}
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
                      <span className="ml-1.5 text-xs text-gray-400">({t('centralWarehouse')})</span>
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

      {/* Import Deposits Link */}
      <Card padding="none">
        <button
          onClick={() => router.push('/settings/import-deposits')}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <Upload className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {t('importDeposits')}
              </p>
              <p className="text-xs text-gray-400">
                {t('importDepositsDesc')}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </button>
      </Card>

    </div>
  );
}
