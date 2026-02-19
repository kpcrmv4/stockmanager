'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useSessionRefresh } from '@/hooks/use-session-refresh';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DesktopLayout } from '@/components/layout/desktop-layout';
import { MobileLayout } from '@/components/layout/mobile-layout';
import { Store, ArrowRight } from 'lucide-react';
import type { AuthUser } from '@/lib/auth/permissions';
import type { Store as StoreType } from '@/types/database';

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
  stores: StoreType[];
  useDesktop: boolean;
}

/** หน้าที่ใช้ได้แม้ยังไม่มีสาขา */
const NO_STORE_ALLOWED = ['/settings', '/overview', '/profile', '/users'];

export function DashboardLayoutClient({
  children,
  user,
  stores,
  useDesktop,
}: DashboardLayoutClientProps) {
  const { setUser } = useAuthStore();
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const pathname = usePathname();

  // Refresh session เมื่อกลับมาจากพับจอ/ปิดหน้าจอ
  useSessionRefresh();

  // ตั้งค่าข้อมูลผู้ใช้ใน Zustand store
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);

  // Desktop layout เฉพาะเมื่อ role เป็น desktop AND หน้าจอใหญ่พอ
  const showDesktop = useDesktop && isLargeScreen;

  // ถ้ายังไม่มีสาขาและหน้าปัจจุบันต้องการสาขา → แสดงหน้าแนะนำให้สร้างสาขา
  const needsStore =
    stores.length === 0 &&
    !NO_STORE_ALLOWED.some((p) => pathname.startsWith(p));

  const content = needsStore ? (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/30">
          <Store className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          ยังไม่มีสาขาในระบบ
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          กรุณาสร้างสาขาแรกก่อนเพื่อเริ่มใช้งานระบบ
        </p>
        <Link
          href="/settings"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          ไปหน้าตั้งค่า
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  ) : (
    children
  );

  return (
    <QueryClientProvider client={queryClient}>
      {showDesktop ? (
        <DesktopLayout stores={stores}>{content}</DesktopLayout>
      ) : (
        <MobileLayout stores={stores}>{content}</MobileLayout>
      )}
    </QueryClientProvider>
  );
}
