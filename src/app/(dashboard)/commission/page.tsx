'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, Button, Modal } from '@/components/ui';
import { Clock, History, Users, Plus } from 'lucide-react';
import { CommissionPayment } from './_components/commission-payment';
import { CommissionHistory } from './_components/commission-history';
import { AEManagement } from './_components/ae-management';
import { CommissionEntryForm } from './_components/commission-entry-form';

type CommissionTab = 'pending' | 'history' | 'ae';

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function CommissionPage() {
  const t = useTranslations('commission');
  const [activeTab, setActiveTab] = useState<CommissionTab>('pending');
  const [month, setMonth] = useState(getCurrentMonth());
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = [
    { id: 'pending', label: t('tabPending'), icon: <Clock className="h-4 w-4" /> },
    { id: 'history', label: t('tabHistory'), icon: <History className="h-4 w-4" /> },
    { id: 'ae', label: t('tabAE'), icon: <Users className="h-4 w-4" /> },
  ];

  const showMonthPicker = activeTab !== 'ae';

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setShowRecordModal(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          {t('recordBill')}
        </Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(v) => setActiveTab(v as CommissionTab)} />

      {showMonthPicker && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('payment.month')}</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
      )}

      {activeTab === 'pending' && <CommissionPayment month={month} refreshKey={refreshKey} />}
      {activeTab === 'history' && <CommissionHistory month={month} refreshKey={refreshKey} />}
      {activeTab === 'ae' && <AEManagement />}

      <Modal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        title={t('recordBill')}
        size="full"
      >
        <CommissionEntryForm
          onSuccess={() => {
            setShowRecordModal(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      </Modal>
    </div>
  );
}
