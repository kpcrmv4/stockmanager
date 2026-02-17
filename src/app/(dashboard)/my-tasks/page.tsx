'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { formatThaiDate } from '@/lib/utils/format';
import {
  ClipboardList,
  Wine,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Plus,
  ScanLine,
  Loader2,
} from 'lucide-react';

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  type: 'stock_count' | 'deposit' | 'withdrawal';
}

interface PendingStatusItem {
  id: string;
  productName: string;
  type: 'deposit' | 'withdrawal';
  status: string;
  submittedAt: string;
}

// Placeholder data
const todayTasks: TaskItem[] = [
  {
    id: 't1',
    title: 'นับสต๊อกประจำวัน',
    description: 'นับสต๊อกเครื่องดื่มทั้งหมดในร้าน',
    status: 'pending',
    type: 'stock_count',
  },
  {
    id: 't2',
    title: 'ทำเรื่องฝากเหล้า - โต๊ะ 8',
    description: 'Johnnie Walker Black Label - คุณธนา',
    status: 'pending',
    type: 'deposit',
  },
  {
    id: 't3',
    title: 'ทำเรื่องเบิกเหล้า - คุณกิตติ',
    description: 'Absolut Vodka - รหัสฝาก: DEP-20250218-001',
    status: 'in_progress',
    type: 'withdrawal',
  },
];

const pendingItems: PendingStatusItem[] = [
  {
    id: 'p1',
    productName: 'Chivas Regal 18',
    type: 'deposit',
    status: 'รอหัวหน้าบาร์อนุมัติ',
    submittedAt: '2025-02-18T18:00:00',
  },
  {
    id: 'p2',
    productName: 'Macallan 12',
    type: 'withdrawal',
    status: 'รอหัวหน้าบาร์อนุมัติ',
    submittedAt: '2025-02-18T17:30:00',
  },
];

const quickActions = [
  {
    label: 'นับสต๊อก',
    icon: ScanLine,
    href: '/stock/count',
    color: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
  },
  {
    label: 'ทำเรื่องฝาก',
    icon: Wine,
    href: '/deposit/new',
    color: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
  },
  {
    label: 'ทำเรื่องเบิก',
    icon: Package,
    href: '/deposit?action=withdraw',
    color: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800',
  },
];

function getTaskIcon(type: string) {
  switch (type) {
    case 'stock_count':
      return ClipboardList;
    case 'deposit':
      return Wine;
    case 'withdrawal':
      return Package;
    default:
      return ClipboardList;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return {
        label: 'รอดำเนินการ',
        className:
          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
      };
    case 'in_progress':
      return {
        label: 'กำลังดำเนินการ',
        className:
          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      };
    case 'completed':
      return {
        label: 'เสร็จแล้ว',
        className:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-600',
      };
  }
}

export default function MyTasksPage() {
  const { user } = useAuthStore();
  const today = formatThaiDate(new Date());

  const completedCount = todayTasks.filter(
    (t) => t.status === 'completed'
  ).length;
  const totalCount = todayTasks.length;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          งานของฉัน
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          สวัสดี, {user?.displayName || user?.username || 'พนักงาน'} — {today}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <a
              key={action.label}
              href={action.href}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-white transition-colors',
                action.color
              )}
            >
              <ActionIcon className="h-6 w-6" />
              <span className="text-xs font-medium">{action.label}</span>
            </a>
          );
        })}
      </div>

      {/* Today's Tasks */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            งานวันนี้
          </h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {completedCount}/{totalCount} เสร็จ
          </span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {todayTasks.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ไม่มีงานค้างสำหรับวันนี้
              </p>
            </div>
          ) : (
            todayTasks.map((task) => {
              const TaskIcon = getTaskIcon(task.type);
              const badge = getStatusBadge(task.status);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      task.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20'
                        : task.status === 'in_progress'
                          ? 'bg-blue-50 text-blue-500 dark:bg-blue-900/20'
                          : 'bg-gray-50 text-gray-400 dark:bg-gray-700'
                    )}
                  >
                    <TaskIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        task.status === 'completed'
                          ? 'text-gray-400 line-through dark:text-gray-500'
                          : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {task.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
                      {task.description}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pending Items Status */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            รายการรอดำเนินการ
          </h2>
          <span className="flex items-center gap-1 text-xs text-amber-500">
            <AlertCircle className="h-3.5 w-3.5" />
            {pendingItems.length} รายการ
          </span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {pendingItems.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ไม่มีรายการรอดำเนินการ
              </p>
            </div>
          ) : (
            pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    item.type === 'deposit'
                      ? 'bg-amber-50 text-amber-500 dark:bg-amber-900/20'
                      : 'bg-blue-50 text-blue-500 dark:bg-blue-900/20'
                  )}
                >
                  {item.type === 'deposit' ? (
                    <Wine className="h-5 w-5" />
                  ) : (
                    <Package className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {item.productName}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    <Clock className="h-3 w-3" />
                    <span>{item.status}</span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
