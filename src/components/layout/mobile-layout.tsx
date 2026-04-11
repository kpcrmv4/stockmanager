'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  X,
  LogOut,
  Sun,
  Moon,
  ClipboardCheck,
  Wine,
  ArrowLeftRight,
  FileBarChart,
  Megaphone,
  UserCog,
  Settings,
  Warehouse,
  Shuffle,
  LayoutDashboard,
  MessageCircle,
  Trophy,
  Scale,
  Zap,
  PieChart,
  ShieldCheck,
  BookOpen,
  HandCoins,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getModuleColors } from '@/lib/utils/module-colors';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { getAccessibleModules } from '@/lib/modules/registry';
import { TopBar } from './top-bar';
import { BottomNav } from './bottom-nav';
import { StoreSwitcher } from './store-switcher';
import { LanguageSwitcher } from './language-switcher';
import type { Store } from '@/types/database';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

const iconMap: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'clipboard-check': ClipboardCheck,
  wine: Wine,
  'arrow-left-right': ArrowLeftRight,
  'file-bar-chart': FileBarChart,
  megaphone: Megaphone,
  'shield-check': ShieldCheck,
  'user-cog': UserCog,
  settings: Settings,
  warehouse: Warehouse,
  shuffle: Shuffle,
  'message-circle': MessageCircle,
  trophy: Trophy,
  scale: Scale,
  zap: Zap,
  'pie-chart': PieChart,
  'book-open': BookOpen,
  'hand-coins': HandCoins,
};

interface MobileLayoutProps {
  children: React.ReactNode;
  stores: Store[];
}

export function MobileLayout({ children, stores }: MobileLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useAppStore();

  // เห็นโมดูลตาม role + permission ส่วนตัวที่ได้รับเพิ่ม
  const modules = useMemo(
    () => (user ? getAccessibleModules(user) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role, user?.permissions?.join(',')]
  );

  const groupedModules = useMemo(() => {
    const groups: { nameKey: string; items: typeof modules }[] = [];
    const seen = new Set<string>();
    for (const mod of modules) {
      if (!seen.has(mod.groupKey)) {
        seen.add(mod.groupKey);
        groups.push({ nameKey: mod.groupKey, items: [] });
      }
      groups.find((g) => g.nameKey === mod.groupKey)!.items.push(mod);
    }
    return groups;
  }, [modules]);

  const isChatRoom = /^\/chat\/[^/]+/.test(pathname);
  const isFullWidthPage = pathname.startsWith('/performance');

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <div className={cn(
      'flex flex-col bg-gray-50 dark:bg-gray-950',
      isChatRoom ? 'h-dvh' : 'min-h-screen'
    )}>
      {/* Top Bar */}
      <TopBar
        stores={stores}
        showMenuButton
        onMenuClick={() => setDrawerOpen(true)}
      />

      {/* เนื้อหาหลัก */}
      <main
        className={cn(
          'flex-1',
          isChatRoom
            ? 'overflow-hidden'
            : isFullWidthPage
              ? 'overflow-y-auto px-2 pb-20 pt-4'
              : 'overflow-y-auto px-4 pb-20 pt-4'
        )}
      >
        {children}
      </main>

      {!isChatRoom && <BottomNav />}

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
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl dark:bg-gray-900',
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
            aria-label={t('nav.closeMenu')}
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
          <nav className="min-h-0 flex-1 overflow-y-auto p-3">
            {groupedModules.map((group, gi) => (
              <div key={group.nameKey} className={cn(gi > 0 && 'mt-3')}>
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {t(group.nameKey)}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((mod) => {
                    const Icon = iconMap[mod.icon] ?? ClipboardCheck;
                    const isActive =
                      pathname === mod.href || pathname.startsWith(mod.href + '/');
                    const colors = getModuleColors(mod.color);

                    return (
                      <li key={mod.id}>
                        <Link
                          href={mod.href}
                          onClick={() => setDrawerOpen(false)}
                          className={cn(
                            'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2',
                            'transition-colors duration-150',
                            isActive
                              ? cn(colors.bg, colors.text)
                              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                          )}
                        >
                          <Icon
                            className={cn(
                              'h-[18px] w-[18px] shrink-0',
                              isActive
                                ? colors.text
                                : 'text-gray-400 dark:text-gray-500'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium">{t(mod.nameKey)}</span>
                            <p className={cn(
                              'truncate text-[11px] leading-tight',
                              isActive
                                ? 'opacity-70'
                                : 'text-gray-400 dark:text-gray-500'
                            )}>
                              {t(mod.descriptionKey)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        )}

        {/* Drawer Footer */}
        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          {/* สลับภาษา */}
          <LanguageSwitcher className="min-h-[44px] w-full" />

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
            <span>{theme === 'light' ? t('nav.darkMode') : t('nav.lightMode')}</span>
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
                  {t(`roles.${user.role}`)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title={t('auth.logout')}
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
