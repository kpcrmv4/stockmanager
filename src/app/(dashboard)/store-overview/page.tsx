'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatThaiDate } from '@/lib/utils/format';
import {
  Store,
  Users,
  Clock,
  ClipboardCheck,
  AlertTriangle,
  ChevronDown,
  Wine,
  Package,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface StoreOption {
  id: string;
  name: string;
  branch: string;
}

interface StoreStats {
  staffCount: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  activeDeposits: number;
  stockAlerts: number;
}

interface RecentActivity {
  id: string;
  message: string;
  time: string;
  type: 'deposit' | 'withdrawal' | 'stock' | 'approval';
}

// Placeholder data — replace with real API calls
const stores: StoreOption[] = [
  { id: 's1', name: 'ร้านสาขา 1', branch: 'สุขุมวิท' },
  { id: 's2', name: 'ร้านสาขา 2', branch: 'ทองหล่อ' },
  { id: 's3', name: 'ร้านสาขา 3', branch: 'เอกมัย' },
];

const mockStats: Record<string, StoreStats> = {
  s1: {
    staffCount: 8,
    pendingDeposits: 3,
    pendingWithdrawals: 1,
    activeDeposits: 45,
    stockAlerts: 0,
  },
  s2: {
    staffCount: 6,
    pendingDeposits: 2,
    pendingWithdrawals: 2,
    activeDeposits: 32,
    stockAlerts: 2,
  },
  s3: {
    staffCount: 5,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    activeDeposits: 28,
    stockAlerts: 1,
  },
};

const mockActivities: RecentActivity[] = [
  {
    id: 'a1',
    message: 'พนักงาน สมหญิง ทำเรื่องฝากเหล้า Johnnie Walker',
    time: '15 นาทีที่แล้ว',
    type: 'deposit',
  },
  {
    id: 'a2',
    message: 'หัวหน้าบาร์อนุมัติการเบิก Chivas Regal 18',
    time: '30 นาทีที่แล้ว',
    type: 'approval',
  },
  {
    id: 'a3',
    message: 'นับสต๊อกประจำวัน เสร็จสิ้น',
    time: '1 ชั่วโมงที่แล้ว',
    type: 'stock',
  },
  {
    id: 'a4',
    message: 'ลูกค้าขอเบิก Absolut Vodka ผ่าน LINE',
    time: '2 ชั่วโมงที่แล้ว',
    type: 'withdrawal',
  },
];

function getActivityIcon(type: string) {
  switch (type) {
    case 'deposit':
      return Wine;
    case 'withdrawal':
      return Package;
    case 'stock':
      return ClipboardCheck;
    case 'approval':
      return CheckCircle2;
    default:
      return Clock;
  }
}

function getActivityColor(type: string) {
  switch (type) {
    case 'deposit':
      return 'text-amber-500';
    case 'withdrawal':
      return 'text-blue-500';
    case 'stock':
      return 'text-emerald-500';
    case 'approval':
      return 'text-indigo-500';
    default:
      return 'text-gray-400';
  }
}

export default function StoreOverviewPage() {
  const { user } = useAuthStore();
  const { currentStoreId, setCurrentStoreId } = useAppStore();
  const [showStoreSelector, setShowStoreSelector] = useState(false);

  const selectedStoreId = currentStoreId || stores[0]?.id || '';
  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0];
  const stats = mockStats[selectedStoreId] || mockStats[stores[0]?.id];

  const handleSelectStore = (storeId: string) => {
    setCurrentStoreId(storeId);
    setShowStoreSelector(false);
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          ภาพรวมร้าน
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          จัดการและติดตามสถานะร้านค้า
        </p>
      </div>

      {/* Store Selector */}
      <div className="relative">
        <button
          onClick={() => setShowStoreSelector(!showStoreSelector)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 transition-colors',
            'hover:bg-gray-50',
            'dark:bg-gray-800 dark:ring-gray-700 dark:hover:bg-gray-750'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {selectedStore?.name}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                สาขา {selectedStore?.branch}
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 text-gray-400 transition-transform',
              showStoreSelector && 'rotate-180'
            )}
          />
        </button>

        {/* Dropdown */}
        {showStoreSelector && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => handleSelectStore(store.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                  'hover:bg-gray-50 dark:hover:bg-gray-750',
                  store.id === selectedStoreId &&
                    'bg-indigo-50 dark:bg-indigo-900/10'
                )}
              >
                <Store
                  className={cn(
                    'h-4 w-4',
                    store.id === selectedStoreId
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400'
                  )}
                />
                <div>
                  <p
                    className={cn(
                      'text-sm font-medium',
                      store.id === selectedStoreId
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-900 dark:text-white'
                    )}
                  >
                    {store.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    สาขา {store.branch}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                พนักงาน
              </span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {stats.staffCount}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">คน</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <Wine className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ฝากเหล้าที่ใช้งาน
              </span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {stats.activeDeposits}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">รายการ</p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                รอดำเนินการ
              </span>
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {stats.pendingDeposits + stats.pendingWithdrawals}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ฝาก {stats.pendingDeposits} / เบิก {stats.pendingWithdrawals}
            </p>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-4 w-4',
                  stats.stockAlerts > 0 ? 'text-red-500' : 'text-gray-300'
                )}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                แจ้งเตือนสต๊อก
              </span>
            </div>
            <p
              className={cn(
                'mt-1 text-xl font-bold',
                stats.stockAlerts > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-white'
              )}
            >
              {stats.stockAlerts}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">รายการ</p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            กิจกรรมล่าสุด
          </h2>
          <button className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
            ดูทั้งหมด
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {mockActivities.map((activity) => {
            const ActivityIcon = getActivityIcon(activity.type);
            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className={cn('mt-0.5', getActivityColor(activity.type))}>
                  <ActivityIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {activity.message}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    {activity.time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
