'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

/**
 * ซิงค์ค่า theme จาก Zustand กับ class "dark" บน <html>
 * เมื่อ theme เปลี่ยน จะอัปเดต DOM ทันที
 */
export function ThemeSync() {
  const { theme } = useAppStore();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return null;
}
