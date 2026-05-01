'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import type { Store } from '@/types/database';

export function useStore() {
  const { currentStoreId, setCurrentStoreId, _hasHydrated } = useAppStore();
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

      // Wait for persist hydration before auto-selecting; otherwise the
      // persisted choice gets overwritten with stores[0]. Also reset when
      // the persisted id is no longer in the user's allowed stores (e.g.
      // they signed out and signed back in as a single-store staff that
      // doesn't have access to the previously-selected branch).
      if (_hasHydrated && storeList.length > 0) {
        const stillValid =
          currentStoreId !== null &&
          storeList.some((s) => s.id === currentStoreId);
        if (!stillValid) {
          setCurrentStoreId(storeList[0].id);
        }
      }

      setIsLoading(false);
    }

    loadStores();
  }, [user, currentStoreId, setCurrentStoreId, _hasHydrated]);

  useEffect(() => {
    const store = stores.find((s) => s.id === currentStoreId) || null;
    setCurrentStore(store);
  }, [currentStoreId, stores]);

  return { stores, currentStore, currentStoreId, setCurrentStoreId, isLoading };
}
