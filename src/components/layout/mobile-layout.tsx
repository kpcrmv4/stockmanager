'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, LogOut, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { getModulesForRole } from '@/lib/modules/registry';
import { ROLE_LABELS } from '@/types/roles';
import { TopBar } from './top-bar';
import { BottomNav } from './bottom-nav';
import { StoreSwitcher } from './store-switcher';
import type { Store } from '@/types/database';
import Link from 'next/link';

interface MobileLayoutProps {
  children: React.ReactNode;
  stores: Store[];
}

export function MobileLayout({ children, stores }: MobileLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useAppStore();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      {/* Top Bar */}
      <TopBar
        stores={stores}
        showMenuButton
        onMenuClick={() => setDrawerOpen(true)}
      />

      {/* เนื้อหาหลัก — เว้นพื้นที่ให้ bottom nav */}
      <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4">
        {children}
      </main>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Side Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl dark:bg-gray-900',
          'transform transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Drawer Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-800">
          <Link
            href="/overview"
            onClick={() => setDrawerOpen(false)}
            className="text-lg font-bold text-gray-900 dark:text-white"
          >
            StockManager
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="ปิดเมนู"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Store Switcher ใน Drawer */}
        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <StoreSwitcher stores={stores} />
        </div>

        {/* เมนูทั้งหมด */}
        {user && (
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {getModulesForRole(user.role).map((mod) => (
                <li key={mod.id}>
                  <Link
                    href={mod.href}
                    onClick={() => setDrawerOpen(false)}
                    className="flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {mod.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Drawer Footer */}
        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          {/* สลับ Dark Mode */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {theme === 'light' ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
            <span>{theme === 'light' ? 'โหมดมืด' : 'โหมดสว่าง'}</span>
          </button>

          {/* ข้อมูลผู้ใช้ + ออกจากระบบ */}
          {user && (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {user.displayName?.[0] ?? user.username[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {user.displayName ?? user.username}
                </p>
                <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="ออกจากระบบ"
                className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
