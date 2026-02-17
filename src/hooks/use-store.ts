'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import type { Store } from '@/types/database';

export function useStore() {
  const { currentStoreId, setCurrentStoreId } = useAppStore();
  const { user } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    async function loadStores() {
      setIsLoading(true);
      const { data } = await supabase
        .from('stores')
        .select('*')
        .eq('active', true)
        .order('store_name');

      const storeList = data || [];
      setStores(storeList);

      if (storeList.length > 0 && !currentStoreId) {
        setCurrentStoreId(storeList[0].id);
      }

      setIsLoading(false);
    }

    loadStores();
  }, [user, currentStoreId, setCurrentStoreId]);

  useEffect(() => {
    const store = stores.find((s) => s.id === currentStoreId) || null;
    setCurrentStore(store);
  }, [currentStoreId, stores]);

  return { stores, currentStore, currentStoreId, setCurrentStoreId, isLoading };
}
