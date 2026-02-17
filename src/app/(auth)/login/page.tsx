'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { LogIn, Eye, EyeOff, Loader2, Wine } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้');
      return;
    }
    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const email = `${username.trim().toLowerCase()}@stockmanager.app`;

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        } else if (authError.message.includes('Email not confirmed')) {
          setError('บัญชียังไม่ได้รับการยืนยัน กรุณาติดต่อผู้ดูแลระบบ');
        } else {
          setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง');
        }
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
            <Wine className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            StockManager
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ระบบจัดการสต๊อกเครื่องดื่ม
          </p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleLogin}
          className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
        >
          <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-white">
            เข้าสู่ระบบ
          </h2>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Username */}
          <div className="mb-4">
            <label
              htmlFor="username"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              ชื่อผู้ใช้
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้"
              autoComplete="username"
              disabled={isLoading}
              className={cn(
                'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors',
                'placeholder:text-gray-400',
                'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500',
                'dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20'
              )}
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                autoComplete="current-password"
                disabled={isLoading}
                className={cn(
                  'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-11 text-sm text-gray-900 outline-none transition-colors',
                  'placeholder:text-gray-400',
                  'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500',
                  'dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors',
              'hover:bg-indigo-700 active:bg-indigo-800',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'dark:bg-indigo-500 dark:hover:bg-indigo-600'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>

          {/* Register Link */}
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            ยังไม่มีบัญชี?{' '}
            <Link
              href="/register"
              className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              ลงทะเบียน
            </Link>
          </p>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          &copy; {new Date().getFullYear()} StockManager. ระบบจัดการฝากเหล้า
        </p>
      </div>
    </div>
  );
}
