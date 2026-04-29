'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { ROLE_LABELS } from '@/types/roles';
import type { UserRole } from '@/types/roles';
import { UserPlus, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface InvitationInfo {
  role: UserRole;
  storeName: string;
  storeCode: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ storeName: string; role: UserRole } | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      setInfoLoading(true);
      const res = await fetch(`/api/auth/invitation/${token}`);
      const data = await res.json();
      if (res.ok) {
        setInfo(data);
      } else {
        if (res.status === 410) setInfoError('ลิงก์เชิญถูกปิดใช้งาน — โปรดติดต่อผู้ดูแลเพื่อขอลิงก์ใหม่');
        else setInfoError('ลิงก์เชิญไม่ถูกต้อง — โปรดตรวจสอบลิงก์อีกครั้ง');
      }
      setInfoLoading(false);
    };
    if (token) fetchInfo();
  }, [token]);

  const validate = (): string | null => {
    if (!username.trim()) return 'กรุณากรอกชื่อผู้ใช้';
    if (username.trim().length < 3) return 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร';
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim()))
      return 'ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่างเท่านั้น';
    if (!password) return 'กรุณากรอกรหัสผ่าน';
    if (password.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    if (password !== confirmPassword) return 'รหัสผ่านไม่ตรงกัน';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          displayName: displayName.trim() || null,
          token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ลงทะเบียนไม่สำเร็จ');
      } else {
        setSuccess({ storeName: data.storeName, role: data.role });
      }
    } catch {
      setError('เกิดข้อผิดพลาด — โปรดลองอีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (infoLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (infoError || !info) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">ลิงก์เชิญใช้ไม่ได้</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{infoError}</p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">ลงทะเบียนสำเร็จ</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          บัญชีของคุณถูกผูกกับสาขา <span className="font-semibold text-indigo-600 dark:text-indigo-400">{success.storeName}</span> ในตำแหน่ง <span className="font-semibold">{ROLE_LABELS[success.role] || success.role}</span>
        </p>
        <Link
          href="/login"
          className={cn(
            'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors',
            'hover:bg-indigo-700 active:bg-indigo-800',
            'dark:bg-indigo-500 dark:hover:bg-indigo-600'
          )}
        >
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">ลงทะเบียนพนักงาน</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            ตำแหน่ง <span className="font-medium text-gray-700 dark:text-gray-200">{ROLE_LABELS[info.role] || info.role}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            สาขา <span className="font-medium text-gray-700 dark:text-gray-200">{info.storeName}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">ชื่อผู้ใช้</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            autoComplete="username"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">ชื่อที่แสดง (ไม่บังคับ)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="ชื่อที่จะแสดงในระบบ"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">รหัสผ่าน</label>
          <div className="relative mt-1">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">ยืนยันรหัสผ่าน</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="พิมพ์รหัสผ่านอีกครั้ง"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors',
            'hover:bg-indigo-700 active:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50',
            'dark:bg-indigo-500 dark:hover:bg-indigo-600'
          )}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {isSubmitting ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
        </button>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          มีบัญชีแล้ว?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            เข้าสู่ระบบ
          </Link>
        </p>
      </form>

      {/* router unused but kept for future redirects */}
      {router && null}
    </div>
  );
}
