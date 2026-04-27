import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '@/i18n/config';

interface AppState {
  currentStoreId: string | null;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  locale: Locale;
  /**
   * True once zustand persist has finished reading from localStorage.
   * Auto-fallback effects (e.g. setCurrentStoreId(stores[0].id) when null)
   * MUST gate on this flag — otherwise during the SSR→hydration window the
   * persisted store selection gets clobbered with stores[0] (which is the
   * alphabetically-first store, e.g. '24 BLVD' over 'Baccarat_Inventory').
   */
  _hasHydrated: boolean;
  setCurrentStoreId: (storeId: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentStoreId: null,
      sidebarOpen: true,
      theme: 'light',
      locale: 'th',
      _hasHydrated: false,
      setCurrentStoreId: (currentStoreId) => set({ currentStoreId }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setLocale: (locale) => set({ locale }),
      setHasHydrated: (_hasHydrated) => set({ _hasHydrated }),
    }),
    {
      name: 'stockmanager-app',
      // Don't persist the hydration flag itself — it should always start false
      partialize: (state) => ({
        currentStoreId: state.currentStoreId,
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        locale: state.locale,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
