'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardList,
  Wine,
  ClipboardCheck,
  Bell,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  activeIcon?: LucideIcon;
}

// เมนูสำหรับ staff
const staffNavItems: NavItem[] = [
  { label: 'งานของฉัน', href: '/my-tasks', icon: ClipboardList },
  { label: 'ฝาก/เบิก', href: '/deposit', icon: Wine },
  { label: 'นับสต๊อก', href: '/stock', icon: ClipboardCheck },
  { label: 'แจ้งเตือน', href: '/notifications', icon: Bell },
];

// เมนูสำหรับ bar — เปลี่ยนรายการแรกเป็น "อนุมัติ"
const barNavItems: NavItem[] = [
  { label: 'อนุมัติ', href: '/bar-approval', icon: CheckCircle },
  { label: 'ฝาก/เบิก', href: '/deposit', icon: Wine },
  { label: 'นับสต๊อก', href: '/stock', icon: ClipboardCheck },
  { label: 'แจ้งเตือน', href: '/notifications', icon: Bell },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  if (!user) return null;

  const navItems = user.role === 'bar' ? barNavItems : staffNavItems;

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
        'safe-area-inset-bottom'
      )}
    >
      <ul className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          const isNotification = item.href === '/notifications';

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  'flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 py-2',
                  'transition-colors duration-150',
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn(
                      'h-6 w-6',
                      isActive && 'fill-current'
                    )}
                  />
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
