'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';

export function PasswordChangeBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            รหัสผ่านของคุณยังเป็นค่าเริ่มต้น (<code className="font-mono">123456</code>) — กรุณาเปลี่ยนเป็นรหัสของตนเองทันที
          </span>
        </div>
        <Link
          href="/settings/account"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
        >
          เปลี่ยนรหัสผ่าน
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
