'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardList,
  Wine,
  ClipboardCheck,
  Bell,
  CheckCircle,
  Repeat,
  LayoutDashboard,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { getModuleColors } from '@/lib/utils/module-colors';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

// เมนูสำหรับ owner/manager/accountant/hq — ภาพรวมอยู่ตรงกลาง (ตำแหน่งที่ 3)
const desktopRoleNavItems: NavItem[] = [
  { label: 'สต๊อก', href: '/stock', icon: ClipboardCheck, color: 'indigo' },
  { label: 'ฝาก/เบิก', href: '/deposit', icon: Wine, color: 'emerald' },
  { label: 'ภาพรวม', href: '/overview', icon: LayoutDashboard, color: 'violet' },
  { label: 'รายงาน', href: '/reports', icon: BarChart3, color: 'amber' },
  { label: 'แจ้งเตือน', href: '/notifications', icon: Bell, color: 'rose' },
];

// เมนูสำหรับ staff
const staffNavItems: NavItem[] = [
  { label: 'งานของฉัน', href: '/my-tasks', icon: ClipboardList, color: 'blue' },
  { label: 'ฝาก/เบิก', href: '/deposit', icon: Wine, color: 'emerald' },
  { label: 'ยืมสินค้า', href: '/borrow', icon: Repeat, color: 'rose' },
  { label: 'นับสต๊อก', href: '/stock', icon: ClipboardCheck, color: 'indigo' },
  { label: 'แจ้งเตือน', href: '/notifications', icon: Bell, color: 'pink' },
];

// เมนูสำหรับ bar
const barNavItems: NavItem[] = [
  { label: 'อนุมัติ', href: '/bar-approval', icon: CheckCircle, color: 'teal' },
  { label: 'ฝาก/เบิก', href: '/deposit', icon: Wine, color: 'emerald' },
  { label: 'นับสต๊อก', href: '/stock', icon: ClipboardCheck, color: 'indigo' },
  { label: 'แจ้งเตือน', href: '/notifications', icon: Bell, color: 'rose' },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  if (!user) return null;

  const desktopRoles = ['owner', 'accountant', 'manager', 'hq'];
  const navItems = desktopRoles.includes(user.role)
    ? desktopRoleNavItems
    : user.role === 'bar'
      ? barNavItems
      : staffNavItems;

  // Center index สำหรับ nav ที่มี 5 รายการ (ปุ่มนูนตรงกลาง)
  const centerIndex = navItems.length === 5 ? 2 : -1;

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
        'safe-area-inset-bottom'
      )}
    >
      <ul className="flex items-end justify-around">
        {navItems.map((item, index) => {
          const isCenter = index === centerIndex;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          const isNotification = item.href === '/notifications';
          const colors = getModuleColors(item.color);

          // ปุ่มตรงกลาง — นูนขึ้นเป็นวงกลม gradient
          if (isCenter) {
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className="flex flex-col items-center pb-1.5"
                >
                  <span
                    className={cn(
                      '-mt-5 mb-0.5 flex h-14 w-14 items-center justify-center rounded-full',
                      'bg-gradient-to-br shadow-lg',
                      'ring-4 ring-white dark:ring-gray-900',
                      'transition-transform duration-200 active:scale-95',
                      colors.gradient
                    )}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-semibold leading-tight',
                      isActive
                        ? colors.text
                        : 'text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          }

          // ปุ่มปกติ
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2',
                  'transition-colors duration-150',
                  isActive
                    ? colors.text
                    : 'text-gray-400 dark:text-gray-500'
                )}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {/* Badge แจ้งเตือน */}
                  {isNotification && unreadCount > 0 && (
                    <span
                      className={cn(
                        'absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
                        'bg-red-500 text-[10px] font-bold text-white'
                      )}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-tight">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
