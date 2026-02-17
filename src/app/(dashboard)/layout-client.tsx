'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { DesktopLayout } from '@/components/layout/desktop-layout';
import { MobileLayout } from '@/components/layout/mobile-layout';
import type { AuthUser } from '@/lib/auth/permissions';
import type { Store } from '@/types/database';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

interface DashboardLayoutClientProps {
  children: React.ReactNode;
  user: AuthUser;
  stores: Store[];
  useDesktop: boolean;
}

export function DashboardLayoutClient({
  children,
  user,
  stores,
  useDesktop,
}: DashboardLayoutClientProps) {
  const { setUser } = useAuthStore();

  // ตั้งค่าข้อมูลผู้ใช้ใน Zustand store
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  return (
    <QueryClientProvider client={queryClient}>
      {useDesktop ? (
        <DesktopLayout stores={stores}>{children}</DesktopLayout>
      ) : (
        <MobileLayout stores={stores}>{children}</MobileLayout>
      )}
    </QueryClientProvider>
  );
}
