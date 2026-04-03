'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { LayoutDashboard, FilePlus, List, Users } from 'lucide-react';
import { CommissionDashboard } from './_components/commission-dashboard';
import { CommissionEntryForm } from './_components/commission-entry-form';
import { CommissionEntryList } from './_components/commission-entry-list';
import { AEManagement } from './_components/ae-management';

const allTabs = [
  { id: 'dashboard', label: 'สรุปยอด', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'create', label: 'บันทึก', icon: <FilePlus className="h-4 w-4" /> },
  { id: 'list', label: 'รายการ', icon: <List className="h-4 w-4" /> },
  { id: 'ae', label: 'จัดการ AE', icon: <Users className="h-4 w-4" /> },
];

export default function CommissionPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Staff can only create entries
  const isStaffOnly = user?.role === 'staff';
  const tabs = isStaffOnly
    ? allTabs.filter((t) => t.id === 'create' || t.id === 'list')
    : allTabs;

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

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'dashboard' && <CommissionDashboard />}
      {activeTab === 'create' && (
        <CommissionEntryForm
          onSuccess={() => setActiveTab('list')}
        />
      )}
      {activeTab === 'list' && <CommissionEntryList />}
      {activeTab === 'ae' && <AEManagement />}
    </div>
  );
}
