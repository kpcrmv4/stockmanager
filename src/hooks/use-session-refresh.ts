'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Hook ที่จัดการ session refresh เมื่อกลับมาจากการพับจอ/ปิดหน้าจอ
 * - ฟัง visibilitychange event
 * - เมื่อ tab กลับมา visible → เรียก getUser() เพื่อ trigger token refresh
 * - ถ้า session หมดอายุ (refresh token expired) → redirect ไป login
 */
export function useSessionRefresh() {
  const router = useRouter();
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    const supabase = createClient();

    async function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;

      // ไม่ต้อง refresh ถ้าเพิ่ง refresh ไปไม่ถึง 30 วินาที
      const elapsed = Date.now() - lastRefresh.current;
      if (elapsed < 30_000) return;

      lastRefresh.current = Date.now();

      const { error } = await supabase.auth.getUser();
      if (error) {
        // Session หมดอายุจริง → redirect ไป login
        router.replace('/login');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router]);
}
