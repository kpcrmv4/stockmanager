'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Wine,
  ClipboardCheck,
  Repeat,
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useChatStore } from '@/stores/chat-store';
import { getModuleColors } from '@/lib/utils/module-colors';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

// เมนูสำหรับ owner/manager/accountant/hq
const desktopRoleNavItems: NavItem[] = [
  { labelKey: 'nav.stock', href: '/stock', icon: ClipboardCheck, color: 'indigo' },
  { labelKey: 'nav.depositWithdraw', href: '/deposit', icon: Wine, color: 'emerald' },
  { labelKey: 'nav.overview', href: '/overview', icon: LayoutDashboard, color: 'violet' },
  { labelKey: 'nav.chat', href: '/chat', icon: MessageSquare, color: 'blue' },
  { labelKey: 'nav.guide', href: '/guide', icon: BookOpen, color: 'sky' },
];

// เมนูสำหรับ staff — ฝากเหล้า / เบิกเหล้า / แชท
const staffNavItems: NavItem[] = [
  { labelKey: 'nav.depositWithdraw', href: '/deposit', icon: Wine, color: 'emerald' },
  { labelKey: 'nav.chat', href: '/chat', icon: MessageSquare, color: 'blue' },
  { labelKey: 'nav.guide', href: '/guide', icon: BookOpen, color: 'sky' },
];

// เมนูสำหรับ bar — นับสต๊อค ฝากเหล้า ยืม โอน แชท
const barNavItems: NavItem[] = [
  { labelKey: 'nav.countStock', href: '/stock', icon: ClipboardCheck, color: 'indigo' },
  { labelKey: 'nav.depositWithdraw', href: '/deposit', icon: Wine, color: 'emerald' },
  { labelKey: 'nav.chat', href: '/chat', icon: MessageSquare, color: 'blue' },
  { labelKey: 'nav.borrowItem', href: '/borrow', icon: Repeat, color: 'rose' },
  { labelKey: 'nav.transfer', href: '/transfer', icon: ArrowLeftRight, color: 'blue' },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations();
  const { user } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const chatUnread = useChatStore((s) => s.totalUnread);

  if (!user) return null;

  const desktopRoles = ['owner', 'accountant', 'manager', 'hq'];
  const navItems = desktopRoles.includes(user.role)
    ? desktopRoleNavItems
    : user.role === 'bar'
      ? barNavItems
      : staffNavItems;

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
          const isChat = item.href === '/chat';
          const colors = getModuleColors(item.color);
          const label = t(item.labelKey);

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
                    {label}
                  </span>
                </Link>
              </li>
            );
          }

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
                  {isChat && chatUnread > 0 && (
                    <span
                      className={cn(
                        'absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
                        'bg-red-500 text-[10px] font-bold text-white'
                      )}
                    >
                      {chatUnread}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-tight">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
