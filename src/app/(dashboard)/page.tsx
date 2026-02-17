'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { ROLE_HOME_ROUTES } from '@/types/roles';
import { Loader2 } from 'lucide-react';

export default function DashboardHomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    const homeRoute = ROLE_HOME_ROUTES[user.role];
    if (homeRoute) {
      router.replace(homeRoute);
    } else {
      // Fallback for unknown roles
      router.replace('/overview');
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">กำลังนำทาง...</p>
      </div>
    </div>
  );
}
