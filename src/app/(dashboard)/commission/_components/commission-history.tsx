'use client';

import { useState } from 'react';
import { Receipt, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import { CommissionEntryList } from './commission-entry-list';
import { CommissionPaymentHistory } from './commission-payment-history';

interface CommissionHistoryProps {
  month: string;
  refreshKey?: number;
}

type HistoryView = 'bills' | 'payments';

export function CommissionHistory({ month, refreshKey }: CommissionHistoryProps) {
  const t = useTranslations('commission');
  const [view, setView] = useState<HistoryView>('bills');

  return (
    <div className="space-y-3">
      {/* Pill toggle */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => setView('bills')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'bills'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          )}
        >
          <Receipt className="h-4 w-4" />
          {t('history.bills')}
        </button>
        <button
          onClick={() => setView('payments')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'payments'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          )}
        >
          <Banknote className="h-4 w-4" />
          {t('history.payments')}
        </button>
      </div>

      {view === 'bills' ? (
        <CommissionEntryList month={month} refreshKey={refreshKey} />
      ) : (
        <CommissionPaymentHistory month={month} refreshKey={refreshKey} />
      )}
    </div>
  );
}
