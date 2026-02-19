'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useSessionRefresh } from '@/hooks/use-session-refresh';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DesktopLayout } from '@/components/layout/desktop-layout';
import { MobileLayout } from '@/components/layout/mobile-layout';
import type { AuthUser } from '@/lib/auth/permissions';
import type { Store } from '@/types/database';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: true,
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
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');

  // Refresh session เมื่อกลับมาจากพับจอ/ปิดหน้าจอ
  useSessionRefresh();

  // ตั้งค่าข้อมูลผู้ใช้ใน Zustand store
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  // Desktop layout เฉพาะเมื่อ role เป็น desktop AND หน้าจอใหญ่พอ
  const showDesktop = useDesktop && isLargeScreen;

  return (
    <QueryClientProvider client={queryClient}>
      {showDesktop ? (
        <DesktopLayout stores={stores}>{children}</DesktopLayout>
      ) : (
        <MobileLayout stores={stores}>{children}</MobileLayout>
      )}
    </QueryClientProvider>
  );
}
