'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Wine,
  ArrowUpFromLine,
  History,
  Tag,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface CustomerNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const customerNavItems: CustomerNavItem[] = [
  { label: 'ของฝาก', href: '/customer', icon: Wine },
  { label: 'ขอเบิก', href: '/customer/withdraw', icon: ArrowUpFromLine },
  { label: 'ประวัติ', href: '/customer/history', icon: History },
  { label: 'โปรโมชั่น', href: '/customer/promotions', icon: Tag },
  { label: 'ตั้งค่า', href: '/customer/settings', icon: Settings },
];

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Top Header — LINE-themed green */}
      <header className="sticky top-0 z-40 flex h-12 items-center justify-center bg-[#06C755] px-4">
        <h1 className="text-base font-bold text-white">
          StockManager
        </h1>
      </header>

      {/* เนื้อหาหลัก */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation — LINE-themed */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white safe-area-inset-bottom">
        <ul className="flex items-center justify-around">
          {customerNavItems.map((item) => {
            const isActive =
              item.href === '/customer'
                ? pathname === '/customer'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    'flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 py-2',
                    'transition-colors duration-150',
                    isActive
                      ? 'text-[#06C755]'
                      : 'text-gray-500'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      isActive && 'fill-current'
                    )}
                  />
                  <span className="text-[10px] font-medium leading-tight">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
