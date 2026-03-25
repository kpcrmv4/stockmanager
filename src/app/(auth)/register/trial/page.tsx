'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { UserPlus, Eye, EyeOff, Loader2, CheckCircle, Store, Mail, Phone, Lock } from 'lucide-react';

function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(0[689]\d{8}|\+66[689]\d{7})$/.test(cleaned);
}

export default function TrialRegisterPage() {
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validateForm = (): string | null => {
    if (!storeName.trim()) return 'กรุณากรอกชื่อร้าน';
    if (!email.trim()) return 'กรุณากรอกอีเมล';
    if (!/^[^\s@]+@gmail\.com$/i.test(email.trim())) return 'กรุณาใช้อีเมล Gmail เท่านั้น';
    if (!phone.trim()) return 'กรุณากรอกเบอร์โทรศัพท์';
    if (!validatePhone(phone)) return 'เบอร์โทรไม่ถูกต้อง กรุณากรอกเบอร์ที่ขึ้นต้นด้วย 06, 08, 09 หรือ +66';
    if (!password) return 'กรุณากรอกรหัสผ่าน';
    if (password.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    if (password !== confirmPassword) return 'รหัสผ่านไม่ตรงกัน';
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
      const res = await fetch('/api/auth/register-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: storeName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.replace(/[\s\-()]/g, ''),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด');
        return;
      }

      setSuccess(true);
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            ลงทะเบียนสำเร็จ!
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            รอการอนุมัติจากผู้ดูแลระบบ เมื่ออนุมัติแล้วจะได้รับ SMS แจ้งเตือน
          </p>
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
    );
  }

  const inputClass = cn(
    'w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-11 pr-4 text-sm text-gray-900 outline-none transition-colors',
    'placeholder:text-gray-400',
    'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500',
    'dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20'
  );

  const iconClass = 'pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400';

  return (
    <form onSubmit={handleRegister}>
      {/* Title */}
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">ทดลองใช้ฟรี</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          สมัครทดลองใช้ระบบจัดการสต๊อกร้านเหล้า
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Store Name */}
      <div className="mb-4">
        <label htmlFor="storeName" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          ชื่อร้าน
        </label>
        <div className="relative">
          <Store className={iconClass} />
          <input
            id="storeName"
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="เช่น ร้านเหล้า ABC"
            disabled={isLoading}
            className={inputClass}
          />
        </div>
      </div>

      {/* Email */}
      <div className="mb-4">
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          อีเมล (Gmail)
        </label>
        <div className="relative">
          <Mail className={iconClass} />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yourname@gmail.com"
            autoComplete="email"
            disabled={isLoading}
            className={inputClass}
          />
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          ใช้ Gmail เท่านั้นสำหรับการลงทะเบียน
        </p>
      </div>

      {/* Phone */}
      <div className="mb-4">
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          เบอร์โทรศัพท์
        </label>
        <div className="relative">
          <Phone className={iconClass} />
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx หรือ +66xxxxxxxxx"
            autoComplete="tel"
            disabled={isLoading}
            className={inputClass}
          />
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          ใช้สำหรับรับ SMS แจ้งผลการอนุมัติ
        </p>
      </div>

      {/* Password */}
      <div className="mb-4">
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          รหัสผ่าน
        </label>
        <div className="relative">
          <Lock className={iconClass} />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="อย่างน้อย 6 ตัวอักษร"
            autoComplete="new-password"
            disabled={isLoading}
            className={cn(inputClass, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Confirm Password */}
      <div className="mb-6">
        <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          ยืนยันรหัสผ่าน
        </label>
        <div className="relative">
          <Lock className={iconClass} />
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="กรอกรหัสผ่านอีกครั้ง"
            autoComplete="new-password"
            disabled={isLoading}
            className={inputClass}
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
        {isLoading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนทดลองใช้'}
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

      {/* Trial info */}
      <p className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
        ทดลองใช้ฟรี 7 วัน ไม่มีค่าใช้จ่าย
      </p>
    </form>
  );
}
