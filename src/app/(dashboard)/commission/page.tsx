'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui';
import { LayoutDashboard, FilePlus, List, Users, Banknote, History } from 'lucide-react';
import { CommissionDashboard } from './_components/commission-dashboard';
import { CommissionEntryForm } from './_components/commission-entry-form';
import { CommissionEntryList } from './_components/commission-entry-list';
import { AEManagement } from './_components/ae-management';
import { CommissionPayment } from './_components/commission-payment';
import { CommissionPaymentHistory } from './_components/commission-payment-history';

const allTabs = [
  { id: 'dashboard', label: 'สรุปยอด', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'create', label: 'บันทึก', icon: <FilePlus className="h-4 w-4" /> },
  { id: 'list', label: 'รายการ', icon: <List className="h-4 w-4" /> },
  { id: 'payment', label: 'ทำจ่าย', icon: <Banknote className="h-4 w-4" /> },
  { id: 'history', label: 'ประวัติ', icon: <History className="h-4 w-4" /> },
  { id: 'ae', label: 'จัดการ AE', icon: <Users className="h-4 w-4" /> },
];

export default function CommissionPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          ระบบคอมมิชชั่น
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          AE Commission & Bottle Commission
        </p>
      </div>

      <Tabs tabs={allTabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'dashboard' && <CommissionDashboard />}
      {activeTab === 'create' && <CommissionEntryForm onSuccess={() => setActiveTab('list')} />}
      {activeTab === 'list' && <CommissionEntryList />}
      {activeTab === 'payment' && <CommissionPayment />}
      {activeTab === 'history' && <CommissionPaymentHistory />}
      {activeTab === 'ae' && <AEManagement />}
    </div>
  );
}
