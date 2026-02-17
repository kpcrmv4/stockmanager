import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  currentStoreId: string | null;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  setCurrentStoreId: (storeId: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentStoreId: null,
      sidebarOpen: true,
      theme: 'light',
      setCurrentStoreId: (currentStoreId) => set({ currentStoreId }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
    }),
    { name: 'stockmanager-app' }
  )
);
