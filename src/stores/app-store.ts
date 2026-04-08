import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '@/i18n/config';

interface AppState {
  currentStoreId: string | null;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  locale: Locale;
  setCurrentStoreId: (storeId: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentStoreId: null,
      sidebarOpen: true,
      theme: 'light',
      locale: 'th',
      setCurrentStoreId: (currentStoreId) => set({ currentStoreId }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'stockmanager-app' }
  )
);
