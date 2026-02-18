'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { UserPlus, Eye, EyeOff, Loader2, Wine, CheckCircle } from 'lucide-react';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<{ storeName: string } | null>(null);

  const validateForm = (): string | null => {
    if (!registrationCode.trim()) {
      return 'กรุณากรอกรหัสลงทะเบียน';
    }
    if (!username.trim()) {
      return 'กรุณากรอกชื่อผู้ใช้';
    }
    if (username.trim().length < 3) {
      return 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่างเท่านั้น';
    }
    if (!password) {
      return 'กรุณากรอกรหัสผ่าน';
    }
    if (password.length < 6) {
      return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    }
    if (password !== confirmPassword) {
      return 'รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่';
    }
    return null;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          displayName: displayName.trim() || null,
          registrationCode: registrationCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'เกิดข้อผิดพลาดในการลงทะเบียน');
        return;
      }

      setSuccess({ storeName: data.storeName });
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    } finally {
      setIsLoading(false);
    }
  };

  // Success screen
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle className="h-7 w-7" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                ลงทะเบียนสำเร็จ!
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                บัญชีของคุณถูกสร้างและเชื่อมกับสาขา
              </p>
              {success.storeName && (
                <p className="mt-1 text-base font-semibold text-indigo-600 dark:text-indigo-400">
                  {success.storeName}
                </p>
              )}
            </div>

            <Link
              href="/login"
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors',
                'hover:bg-indigo-700 active:bg-indigo-800',
                'dark:bg-indigo-500 dark:hover:bg-indigo-600'
              )}
            >
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
            &copy; {new Date().getFullYear()} StockManager. ระบบจัดการฝากเหล้า
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md">
        {/* Registration Form */}
        <form
          onSubmit={handleRegister}
          className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
        >
          {/* Logo & Title */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
              <Wine className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              StockManager
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              ลงทะเบียนพนักงานใหม่
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Registration Code */}
          <div className="mb-4">
            <label
              htmlFor="registrationCode"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              รหัสลงทะเบียน
            </label>
            <input
              id="registrationCode"
              type="text"
              value={registrationCode}
              onChange={(e) => setRegistrationCode(e.target.value)}
              placeholder="กรอกรหัสที่ได้รับจากผู้จัดการ"
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
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              รหัสลงทะเบียนจะได้รับจากเจ้าของร้านหรือผู้จัดการ
            </p>
          </div>

          {/* Display Name */}
          <div className="mb-4">
            <label
              htmlFor="displayName"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              ชื่อที่แสดง{' '}
              <span className="font-normal text-gray-400">(ไม่บังคับ)</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="เช่น สมชาย, น้องเอ"
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
              placeholder="กรอกชื่อผู้ใช้ (ภาษาอังกฤษ)"
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
          <div className="mb-4">
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
                placeholder="อย่างน้อย 6 ตัวอักษร"
                autoComplete="new-password"
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

          {/* Confirm Password */}
          <div className="mb-6">
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              ยืนยันรหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                autoComplete="new-password"
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
              <UserPlus className="h-4 w-4" />
            )}
            {isLoading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
          </button>

          {/* Back to Login */}
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            มีบัญชีแล้ว?{' '}
            <Link
              href="/login"
              className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              เข้าสู่ระบบ
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
