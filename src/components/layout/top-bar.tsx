'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, ChevronDown, LogOut, User, Settings, Bell } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { NotificationCenter } from '@/components/layout/notification-center';
import { ROLE_LABELS } from '@/types/roles';
import type { Store } from '@/types/database';

interface TopBarProps {
  /** ชื่อหน้าปัจจุบัน สำหรับแสดงใน Desktop */
  pageTitle?: string;
  /** ชื่อร้าน สำหรับแสดงบน Mobile */
  stores?: Store[];
  /** แสดงปุ่ม hamburger (mobile layout) */
  showMenuButton?: boolean;
  /** callback เมื่อกดปุ่ม hamburger */
  onMenuClick?: () => void;
}

export function TopBar({
  pageTitle,
  stores = [],
  showMenuButton = false,
  onMenuClick,
}: TopBarProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const currentStore = stores.find((s) => s.id === currentStoreId);

  // ปิด user menu เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  if (!user) return null;

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4',
        'dark:border-gray-800 dark:bg-gray-900'
      )}
    >
      {/* ซ้าย: Hamburger (mobile) หรือ Page Title (desktop) */}
      <div className="flex flex-1 items-center gap-3">
        {showMenuButton && (
          <button
            type="button"
            onClick={onMenuClick}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="เปิดเมนู"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {pageTitle && !showMenuButton && (
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {pageTitle}
          </h1>
        )}

        {/* ชื่อร้าน (แสดงเสมอบน mobile, แสดงเมื่อไม่มี pageTitle บน desktop) */}
        {showMenuButton && currentStore && (
          <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
            {currentStore.store_name}
          </span>
        )}
      </div>

      {/* ขวา: การแจ้งเตือน + User avatar */}
      <div className="flex items-center gap-2">
        {/* ปุ่มแจ้งเตือน */}
        <NotificationCenter />

        {/* User Avatar Dropdown */}
        <div ref={userMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              'transition-colors duration-150'
            )}
          >
            {/* อวาตาร์ */}
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName ?? user.username}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {user.displayName?.[0] ?? user.username[0]?.toUpperCase()}
              </div>
            )}

            <ChevronDown
              className={cn(
                'hidden h-4 w-4 text-gray-400 transition-transform duration-200 sm:block',
                userMenuOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown Menu */}
          {userMenuOpen && (
            <div
              className={cn(
                'absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border shadow-lg',
                'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              )}
            >
              {/* ข้อมูลผู้ใช้ */}
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {user.displayName ?? user.username}
                </p>
                <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  {ROLE_LABELS[user.role]}
                </span>
              </div>

              {/* เมนู */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push('/profile');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <User className="h-4 w-4" />
                  <span>โปรไฟล์</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push('/profile');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Bell className="h-4 w-4" />
                  <span>ตั้งค่าแจ้งเตือน</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push('/settings');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Settings className="h-4 w-4" />
                  <span>ตั้งค่า</span>
                </button>
              </div>

              {/* ออกจากระบบ */}
              <div className="border-t border-gray-200 py-1 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <LogOut className="h-4 w-4" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
