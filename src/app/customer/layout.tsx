'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Wine,
  Plus,
  ArrowUpFromLine,
  History,
  Settings,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CustomerProvider } from './_components/customer-provider';
import type { LucideIcon } from 'lucide-react';

interface CustomerNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const customerNavItems: CustomerNavItem[] = [
  { label: 'ของฝาก', href: '/customer', icon: Wine },
  { label: 'ฝากเหล้า', href: '/customer/deposit', icon: Plus },
  { label: 'ขอเบิก', href: '/customer/withdraw', icon: ArrowUpFromLine },
  { label: 'ประวัติ', href: '/customer/history', icon: History },
  { label: 'ตั้งค่า', href: '/customer/settings', icon: Settings },
];

function CustomerLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ส่งต่อ token param ไปยัง nav links (เพื่อไม่หลุด token เมื่อกดเมนู)
  const token = searchParams.get('token');
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

  return (
    <CustomerProvider>
      <div className="flex min-h-screen flex-col bg-white">
        {/* Top Header — LINE-themed green */}
        <header className="sticky top-0 z-40 flex h-12 items-center justify-center bg-[#06C755] px-4">
          <h1 className="text-base font-bold text-white">StockManager</h1>
        </header>

        {/* เนื้อหาหลัก */}
        <main className="flex-1 overflow-y-auto pb-20">{children}</main>

        {/* Bottom Navigation — LINE-themed */}
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white safe-area-inset-bottom">
          <ul className="flex items-center justify-around">
            {customerNavItems.map((item) => {
              const isActive =
                item.href === '/customer'
                  ? pathname === '/customer'
                  : pathname === item.href ||
                    pathname.startsWith(item.href + '/');
              const Icon = item.icon;

              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={`${item.href}${tokenQuery}`}
                    className={cn(
                      'flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 py-2',
                      'transition-colors duration-150',
                      isActive ? 'text-[#06C755]' : 'text-gray-500',
                    )}
                  >
                    <Icon
                      className={cn('h-5 w-5', isActive && 'fill-current')}
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
    </CustomerProvider>
  );
}

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
        </div>
      }
    >
      <CustomerLayoutInner>{children}</CustomerLayoutInner>
    </Suspense>
  );
}
