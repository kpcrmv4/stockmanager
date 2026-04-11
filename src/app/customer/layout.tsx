'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Wine,
  Plus,
  ArrowUpFromLine,
  History,
  Settings,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  CustomerProvider,
  useCustomerAuth,
} from './_components/customer-provider';
import type { LucideIcon } from 'lucide-react';
import './customer-theme.css';

interface CustomerNavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

const customerNavItems: CustomerNavItem[] = [
  { labelKey: 'myDeposits', href: '/customer', icon: Wine },
  { labelKey: 'deposit', href: '/customer/deposit', icon: Plus },
  { labelKey: 'withdraw', href: '/customer/withdraw', icon: ArrowUpFromLine },
  { labelKey: 'history', href: '/customer/history', icon: History },
  { labelKey: 'settings', href: '/customer/settings', icon: Settings },
];

// ---------------------------------------------------------------------------
// Header — glass-morphism with brand logo + store subtitle
// ---------------------------------------------------------------------------
function CustomerHeader() {
  const { store } = useCustomerAuth();
  const title = 'Bottle Keeper';
  const subtitle = store.name || 'Stock Manager';

  return (
    <header className="customer-header-bg sticky top-0 z-40">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="customer-logo-box">
          <Wine className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <h1 className="customer-brand-title truncate">{title}</h1>
          <span className="customer-brand-subtitle truncate">{subtitle}</span>
        </div>
      </div>
    </header>
  );
}

function CustomerLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('customer.nav');

  // Preserve both ?token= and ?store= across nav so context doesn't get lost
  const token = searchParams.get('token');
  const storeCode = searchParams.get('store');

  const queryParts: string[] = [];
  if (token) queryParts.push(`token=${encodeURIComponent(token)}`);
  if (storeCode) queryParts.push(`store=${encodeURIComponent(storeCode)}`);
  const navQuery = queryParts.length ? `?${queryParts.join('&')}` : '';

  return (
    <CustomerProvider>
      <div className="customer-theme relative flex min-h-screen flex-col">
        {/* Ambient background orbs */}
        <div className="customer-ambient-bg" aria-hidden="true">
          <div className="customer-ambient-orb orb-1" />
          <div className="customer-ambient-orb orb-2" />
          <div className="customer-ambient-orb orb-3" />
        </div>

        {/* Top header */}
        <CustomerHeader />

        {/* Main content */}
        <main className="customer-scroll relative z-[5] flex-1 overflow-y-auto pb-[72px]">
          {children}
        </main>

        {/* Bottom navigation — glass dark theme */}
        <nav className="customer-bottom-nav fixed inset-x-0 bottom-0 z-50 safe-area-inset-bottom">
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
                    href={`${item.href}${navQuery}`}
                    className={cn(
                      'customer-bottom-nav-item flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 py-1.5',
                      isActive && 'active',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="text-[9px] font-semibold uppercase tracking-wide leading-tight">
                      {t(item.labelKey)}
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
        <div className="customer-theme flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#F8D794]" />
        </div>
      }
    >
      <CustomerLayoutInner>{children}</CustomerLayoutInner>
    </Suspense>
  );
}
