'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  ClipboardCheck,
  Wine,
  ArrowLeftRight,
  FileBarChart,
  Megaphone,
  UserCog,
  Settings,
  LogOut,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  ShieldCheck,
  Warehouse,
  Shuffle,
  LayoutDashboard,
  MessageCircle,
  Trophy,
  Scale,
  Zap,
  PieChart,
  BookOpen,
  HandCoins,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getModuleColors } from '@/lib/utils/module-colors';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { getAccessibleModules } from '@/lib/modules/registry';
import { StoreSwitcher } from './store-switcher';
import { LanguageSwitcher } from './language-switcher';
import type { Store } from '@/types/database';
import type { LucideIcon } from 'lucide-react';

// แมปชื่อ icon string จาก registry กับ Lucide component
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

interface SidebarProps {
  stores: Store[];
}

export function Sidebar({ stores }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore();

  // เห็นโมดูลตาม role + permission ส่วนตัวที่ได้รับเพิ่ม
  const modules = useMemo(
    () => (user ? getAccessibleModules(user) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role, user?.permissions?.join(',')]
  );
  const collapsed = !sidebarOpen;

  // จัดกลุ่มเมนูตาม group
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

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
        'transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* โลโก้และชื่อแอป — คลิกกลับหน้า overview */}
      <Link
        href="/overview"
        className={cn(
          'flex h-16 items-center border-b border-gray-200 px-4 dark:border-gray-800',
          'transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
          collapsed ? 'justify-center' : 'gap-3'
        )}
      >
        <Package className="h-7 w-7 shrink-0 text-blue-600 dark:text-blue-400" />
        {!collapsed && (
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            StockManager
          </span>
        )}
      </Link>

      {/* Store Switcher */}
      <div className={cn('border-b border-gray-200 p-3 dark:border-gray-800')}>
        <StoreSwitcher stores={stores} collapsed={collapsed} />
      </div>

      {/* เมนูนำทาง — แบ่งหมวดหมู่ */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {groupedModules.map((group, gi) => (
          <div key={group.nameKey} className={cn(gi > 0 && 'mt-4')}>
            {/* ชื่อหมวดหมู่ */}
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {t(group.nameKey)}
              </p>
            )}
            {collapsed && gi > 0 && (
              <div className="mx-auto mb-2 mt-1 h-px w-8 bg-gray-200 dark:bg-gray-700" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((mod) => {
                const Icon = iconMap[mod.icon] ?? ClipboardCheck;
                const isActive =
                  pathname === mod.href || pathname.startsWith(mod.href + '/');
                const colors = getModuleColors(mod.color);
                const modName = t(mod.nameKey);

                return (
                  <li key={mod.id}>
                    <Link
                      href={mod.href}
                      title={collapsed ? modName : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                        'transition-colors duration-150',
                        isActive
                          ? cn(colors.bg, colors.text)
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                        collapsed && 'justify-center px-2'
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
                      {!collapsed && <span className="truncate">{modName}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ส่วนล่าง: Language + Dark mode toggle + Collapse toggle + ข้อมูลผู้ใช้ */}
      <div className="border-t border-gray-200 p-3 dark:border-gray-800">
        {/* ปุ่มสลับภาษา */}
        <LanguageSwitcher collapsed={collapsed} className="w-full" />

        {/* ปุ่มสลับ Dark Mode */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'light' ? t('nav.darkMode') : t('nav.lightMode')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm',
            'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            'transition-colors duration-150',
            collapsed && 'justify-center px-2'
          )}
        >
          {theme === 'light' ? (
            <Moon className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <Sun className="h-[18px] w-[18px] shrink-0" />
          )}
          {!collapsed && (
            <span>{theme === 'light' ? t('nav.darkMode') : t('nav.lightMode')}</span>
          )}
        </button>

        {/* ปุ่มยุบ/ขยาย Sidebar */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm',
            'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            'transition-colors duration-150',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
          )}
          {!collapsed && <span>{t('nav.collapseMenu')}</span>}
        </button>

        {/* ข้อมูลผู้ใช้ */}
        <div
          className={cn(
            'mt-2 flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700',
            collapsed && 'justify-center border-0 p-2'
          )}
        >
          {/* อวาตาร์ */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {user.displayName?.[0] ?? user.username[0]?.toUpperCase()}
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {user.displayName ?? user.username}
              </p>
              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                {t(`roles.${user.role}`)}
              </span>
            </div>
          )}

          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              title={t('auth.logout')}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
