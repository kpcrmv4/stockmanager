'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardList,
  Wine,
  Truck,
  BarChart3,
  Megaphone,
  Users,
  Settings,
  LogOut,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Activity,
  Warehouse,
  Repeat,
  LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getModuleColors } from '@/lib/utils/module-colors';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { getModulesForRole } from '@/lib/modules/registry';
import { ROLE_LABELS } from '@/types/roles';
import { StoreSwitcher } from './store-switcher';
import type { Store } from '@/types/database';
import type { LucideIcon } from 'lucide-react';

// แมปชื่อ icon string จาก registry กับ Lucide component
const iconMap: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'clipboard-list': ClipboardList,
  wine: Wine,
  truck: Truck,
  'bar-chart-3': BarChart3,
  megaphone: Megaphone,
  activity: Activity,
  users: Users,
  settings: Settings,
  package: Package,
  warehouse: Warehouse,
  repeat: Repeat,
};

interface SidebarProps {
  stores: Store[];
}

export function Sidebar({ stores }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore();

  if (!user) return null;

  const modules = getModulesForRole(user.role);
  const collapsed = !sidebarOpen;

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

      {/* เมนูนำทาง */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {modules.map((mod) => {
            const Icon = iconMap[mod.icon] ?? ClipboardList;
            const isActive =
              pathname === mod.href || pathname.startsWith(mod.href + '/');
            const colors = getModuleColors(mod.color);

            return (
              <li key={mod.id}>
                <Link
                  href={mod.href}
                  title={collapsed ? mod.name : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                    'transition-colors duration-150',
                    isActive
                      ? cn(colors.bg, colors.text)
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                    collapsed && 'justify-center px-2'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isActive
                        ? colors.text
                        : 'text-gray-400 dark:text-gray-500'
                    )}
                  />
                  {!collapsed && <span className="truncate">{mod.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ส่วนล่าง: Dark mode toggle + Collapse toggle + ข้อมูลผู้ใช้ */}
      <div className="border-t border-gray-200 p-3 dark:border-gray-800">
        {/* ปุ่มสลับ Dark Mode */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'light' ? 'เปิดโหมดมืด' : 'เปิดโหมดสว่าง'}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm',
            'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            'transition-colors duration-150',
            collapsed && 'justify-center px-2'
          )}
        >
          {theme === 'light' ? (
            <Moon className="h-5 w-5 shrink-0" />
          ) : (
            <Sun className="h-5 w-5 shrink-0" />
          )}
          {!collapsed && (
            <span>{theme === 'light' ? 'โหมดมืด' : 'โหมดสว่าง'}</span>
          )}
        </button>

        {/* ปุ่มยุบ/ขยาย Sidebar */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? 'ขยายเมนู' : 'ยุบเมนู'}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm',
            'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            'transition-colors duration-150',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5 shrink-0" />
          ) : (
            <PanelLeftClose className="h-5 w-5 shrink-0" />
          )}
          {!collapsed && <span>ยุบเมนู</span>}
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
                {ROLE_LABELS[user.role]}
              </span>
            </div>
          )}

          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              title="ออกจากระบบ"
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
