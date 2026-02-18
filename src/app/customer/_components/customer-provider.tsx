'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';

interface CustomerAuth {
  lineUserId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** 'liff' | 'token' | null (loading) */
  mode: 'liff' | 'token' | null;
  isLoading: boolean;
  error: string | null;
}

const CustomerContext = createContext<CustomerAuth>({
  lineUserId: null,
  displayName: null,
  avatarUrl: null,
  mode: null,
  isLoading: true,
  error: null,
});

export function useCustomerAuth() {
  return useContext(CustomerContext);
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';

export function CustomerProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [auth, setAuth] = useState<CustomerAuth>({
    lineUserId: null,
    displayName: null,
    avatarUrl: null,
    mode: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initAuth() {
    // -------------------------------------------------------
    // Mode 1: Token mode (จาก URL ?token=xxxx)
    // -------------------------------------------------------
    if (token) {
      try {
        const res = await fetch(`/api/auth/customer-token?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          setAuth({
            lineUserId: null,
            displayName: null,
            avatarUrl: null,
            mode: null,
            isLoading: false,
            error: 'ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่จาก LINE',
          });
          return;
        }

        const data = await res.json();
        setAuth({
          lineUserId: data.lineUserId,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
          mode: 'token',
          isLoading: false,
          error: null,
        });
        return;
      } catch {
        setAuth({
          lineUserId: null,
          displayName: null,
          avatarUrl: null,
          mode: null,
          isLoading: false,
          error: 'เกิดข้อผิดพลาดในการตรวจสอบลิงก์',
        });
        return;
      }
    }

    // -------------------------------------------------------
    // Mode 2: LIFF mode (ถ้ามี LIFF_ID)
    //   → init LIFF → login → ส่ง accessToken ไป verify server-side
    // -------------------------------------------------------
    if (LIFF_ID) {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
          liff.login();
          return; // จะ redirect กลับมา
        }

        // ได้ access token → verify กับ server (ใช้ service client ดึง deposits)
        const accessToken = liff.getAccessToken();
        if (!accessToken) {
          throw new Error('No access token from LIFF');
        }

        // เก็บ access token ไว้ให้ customer page ใช้เรียก API
        sessionStorage.setItem('liff_access_token', accessToken);

        const res = await fetch('/api/auth/liff-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        });

        if (!res.ok) {
          throw new Error('LIFF verify failed');
        }

        const data = await res.json();
        setAuth({
          lineUserId: data.lineUserId,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
          mode: 'liff',
          isLoading: false,
          error: null,
        });
        return;
      } catch (err) {
        console.error('[CustomerProvider] LIFF init error:', err);
        setAuth({
          lineUserId: null,
          displayName: null,
          avatarUrl: null,
          mode: null,
          isLoading: false,
          error: 'ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาลองใหม่',
        });
        return;
      }
    }

    // -------------------------------------------------------
    // ไม่มีทั้ง token และ LIFF_ID
    // -------------------------------------------------------
    setAuth({
      lineUserId: null,
      displayName: null,
      avatarUrl: null,
      mode: null,
      isLoading: false,
      error: 'กรุณาเปิดลิงก์จาก LINE เพื่อเข้าใช้งาน',
    });
  }

  return (
    <CustomerContext.Provider value={auth}>
      {children}
    </CustomerContext.Provider>
  );
}
