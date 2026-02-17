'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { formatThaiDate } from '@/lib/utils/format';
import {
  Store,
  Wine,
  ClipboardCheck,
  AlertTriangle,
  Plus,
  FileText,
  Users,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  BarChart3,
} from 'lucide-react';

// Placeholder data — replace with real API calls
const summaryCards = [
  {
    label: 'จำนวนร้าน',
    value: '3',
    icon: Store,
    color: 'bg-blue-500',
    lightBg: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    label: 'รายการฝากที่ใช้งาน',
    value: '128',
    icon: Wine,
    color: 'bg-emerald-500',
    lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    label: 'รอการอนุมัติ',
    value: '5',
    icon: ClipboardCheck,
    color: 'bg-amber-500',
    lightBg: 'bg-amber-50 dark:bg-amber-900/20',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    label: 'แจ้งเตือนสต๊อก',
    value: '2',
    icon: AlertTriangle,
    color: 'bg-red-500',
    lightBg: 'bg-red-50 dark:bg-red-900/20',
    textColor: 'text-red-600 dark:text-red-400',
  },
];

const recentActivities = [
  {
    id: '1',
    type: 'deposit' as const,
    message: 'ฝากเหล้า Johnnie Walker Black Label - โต๊ะ 12',
    time: '10 นาทีที่แล้ว',
    status: 'success',
  },
  {
    id: '2',
    type: 'withdrawal' as const,
    message: 'เบิกเหล้า Chivas Regal 18 - คุณสมชาย',
    time: '25 นาทีที่แล้ว',
    status: 'success',
  },
  {
    id: '3',
    type: 'approval' as const,
    message: 'อนุมัติการฝาก - Hennessy VSOP',
    time: '1 ชั่วโมงที่แล้ว',
    status: 'success',
  },
  {
    id: '4',
    type: 'alert' as const,
    message: 'สต๊อกไม่ตรง - ร้านสาขา 2 (ขาด 3 รายการ)',
    time: '2 ชั่วโมงที่แล้ว',
    status: 'warning',
  },
  {
    id: '5',
    type: 'rejection' as const,
    message: 'ปฏิเสธการเบิก - รหัสไม่ถูกต้อง',
    time: '3 ชั่วโมงที่แล้ว',
    status: 'error',
  },
];

const quickActions = [
  { label: 'เพิ่มรายการฝาก', icon: Plus, href: '/deposit/new', color: 'bg-indigo-600 hover:bg-indigo-700' },
  { label: 'ดูรายงาน', icon: FileText, href: '/reports', color: 'bg-emerald-600 hover:bg-emerald-700' },
  { label: 'จัดการพนักงาน', icon: Users, href: '/users', color: 'bg-violet-600 hover:bg-violet-700' },
  { label: 'นับสต๊อก', icon: Package, href: '/stock/count', color: 'bg-amber-600 hover:bg-amber-700' },
];

function getActivityIcon(type: string) {
  switch (type) {
    case 'deposit':
      return Wine;
    case 'withdrawal':
      return Package;
    case 'approval':
      return CheckCircle2;
    case 'alert':
      return AlertTriangle;
    case 'rejection':
      return XCircle;
    default:
      return Clock;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'success':
      return 'text-emerald-500';
    case 'warning':
      return 'text-amber-500';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
}

export default function OverviewPage() {
  const { user } = useAuthStore();
  const today = formatThaiDate(new Date());

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          ภาพรวม
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          สวัสดี, {user?.displayName || user?.username || 'เจ้าของร้าน'} — {today}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {card.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                    {card.value}
                  </p>
                </div>
                <div
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl',
                    card.lightBg
                  )}
                >
                  <Icon className={cn('h-5 w-5', card.textColor)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div className="lg:col-span-2 rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              กิจกรรมล่าสุด
            </h2>
            <button className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
              ดูทั้งหมด
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentActivities.map((activity) => {
              const ActivityIcon = getActivityIcon(activity.type);
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 px-5 py-3.5"
                >
                  <div className={cn('mt-0.5', getStatusColor(activity.status))}>
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

        {/* Quick Actions */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              ทางลัด
            </h2>
          </div>
          <div className="space-y-3 p-5">
            {quickActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <a
                  key={action.label}
                  href={action.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors',
                    action.color
                  )}
                >
                  <ActionIcon className="h-4 w-4" />
                  {action.label}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart Placeholder */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            สถิติการฝาก-เบิก
          </h2>
        </div>
        <div className="flex h-64 items-center justify-center p-5">
          <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
            <BarChart3 className="h-12 w-12" />
            <p className="text-sm">กราฟสถิติจะแสดงที่นี่</p>
            <p className="text-xs">เชื่อมต่อข้อมูลจริงเพื่อแสดงกราฟ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
