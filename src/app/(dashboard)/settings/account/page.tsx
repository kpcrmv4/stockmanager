'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent, Input, Button, toast } from '@/components/ui';
import { KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function AccountSettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword) {
      setError('กรุณากรอกรหัสผ่านปัจจุบันและรหัสใหม่');
      return;
    }
    if (newPassword.length < 6) {
      setError('รหัสใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('รหัสใหม่และยืนยันไม่ตรงกัน');
      return;
    }
    if (newPassword === currentPassword) {
      setError('รหัสใหม่ต้องไม่ตรงกับรหัสเดิม');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      } else {
        toast({ type: 'success', title: 'เปลี่ยนรหัสผ่านเรียบร้อย', message: 'ใช้รหัสใหม่ในการเข้าสู่ระบบครั้งต่อไป' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => router.push('/'), 800);
      }
    } catch {
      setError('เกิดข้อผิดพลาด — โปรดลองอีกครั้ง');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับไปหน้าตั้งค่า
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">บัญชีของฉัน</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">เปลี่ยนรหัสผ่านสำหรับเข้าสู่ระบบ</p>
      </div>

      <Card padding="none">
        <CardHeader title="เปลี่ยนรหัสผ่าน" />
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label="รหัสผ่านปัจจุบัน"
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-9 rounded p-1 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Input
              label="รหัสผ่านใหม่"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              hint="อย่างน้อย 6 ตัวอักษร"
              autoComplete="new-password"
              required
            />

            <Input
              label="ยืนยันรหัสผ่านใหม่"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={!currentPassword || !newPassword || !confirmPassword}
              icon={<KeyRound className="h-4 w-4" />}
            >
              บันทึกรหัสใหม่
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
