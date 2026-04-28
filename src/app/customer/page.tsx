'use client';

import { useState } from 'react';
import { TransactionTabs, type TxTab } from './_components/transaction-tabs';
import { MyBottlesView } from './_components/my-bottles-view';
import { DepositView } from './_components/deposit-view';
import { HistoryView } from './_components/history-view';

export default function CustomerPage() {
  const [activeTab, setActiveTab] = useState<TxTab>('bottles');

  return (
    <>
      <TransactionTabs active={activeTab} onChange={setActiveTab} />

      <div className="relative z-[5]">
        {activeTab === 'bottles' && <MyBottlesView />}
        {activeTab === 'deposit' && (
          <DepositView onSuccess={() => setActiveTab('bottles')} />
        )}
        {activeTab === 'history' && <HistoryView />}
      </div>
    </>
  );
}
