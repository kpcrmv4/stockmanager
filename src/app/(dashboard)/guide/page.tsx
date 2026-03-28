'use client';

import { BookOpen } from 'lucide-react';

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/40">
          <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            คู่มือการใช้งาน
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            วิธีใช้งานระบบ StockManager สำหรับพนักงานทุกตำแหน่ง
          </p>
        </div>
      </div>

      {/* Embedded manual */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <iframe
          src="/docs/user-manual.html"
          title="คู่มือการใช้งาน StockManager"
          className="h-[calc(100dvh-12rem)] w-full border-0"
        />
      </div>
    </div>
  );
}
