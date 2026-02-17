'use client';

import { cn } from '@/lib/utils/cn';
import { useAppStore } from '@/stores/app-store';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import type { Store } from '@/types/database';

interface DesktopLayoutProps {
  children: React.ReactNode;
  stores: Store[];
  pageTitle?: string;
}

export function DesktopLayout({ children, stores, pageTitle }: DesktopLayoutProps) {
  const { sidebarOpen } = useAppStore();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar stores={stores} />

      {/* เนื้อหาหลัก */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar pageTitle={pageTitle} stores={stores} />
        <main
          className={cn(
            'flex-1 overflow-y-auto p-6',
            'transition-all duration-300'
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
