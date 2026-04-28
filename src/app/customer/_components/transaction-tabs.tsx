'use client';

import { useTranslations } from 'next-intl';
import { Wine, Plus, History } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

export type TxTab = 'bottles' | 'deposit' | 'history';

interface TabDef {
  id: TxTab;
  labelKey: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: 'bottles', labelKey: 'myDeposits', icon: Wine },
  { id: 'deposit', labelKey: 'deposit', icon: Plus },
  { id: 'history', labelKey: 'history', icon: History },
];

export function TransactionTabs({
  active,
  onChange,
}: {
  active: TxTab;
  onChange: (tab: TxTab) => void;
}) {
  const t = useTranslations('customer.nav');

  return (
    <div className="customer-tabbar sticky top-0 z-30">
      <div className="customer-tabbar-inner" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn('customer-tab-btn', isActive && 'active')}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
