'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, ChevronDown, LogOut, User, Settings, Bell, MessageSquare, Download, Check, Share, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { NotificationCenter } from '@/components/layout/notification-center';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useChatStore } from '@/stores/chat-store';
import { useInstallPWA } from '@/hooks/use-install-pwa';
import type { Store } from '@/types/database';

interface TopBarProps {
  pageTitle?: string;
  stores?: Store[];
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export function TopBar({
  pageTitle,
  stores = [],
  showMenuButton = false,
  onMenuClick,
}: TopBarProps) {
  const router = useRouter();
  const t = useTranslations();
  const { user, logout } = useAuthStore();
  const { currentStoreId } = useAppStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const chatUnread = useChatStore((s) => s.totalUnread);
  const { canInstall, isInstalled, isInstalling, install } = useInstallPWA();

  const currentStore = stores.find((s) => s.id === currentStoreId);

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

  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  function handleInstallClick() {
    setUserMenuOpen(false);
    if (canInstall) {
      install();
    } else if (isIos && !isInstalled) {
      setShowIosGuide(true);
    }
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
            aria-label={t('nav.openMenu')}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {pageTitle && !showMenuButton && (
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {pageTitle}
          </h1>
        )}

        {showMenuButton && currentStore && (
          <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
            {currentStore.store_name}
          </span>
        )}
      </div>

      {/* ขวา: การแจ้งเตือน + User avatar */}
      <div className="flex items-center gap-2">
        {/* ปุ่มแชท */}
        <Link
          href="/chat"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title={t('nav.chat')}
        >
          <MessageSquare className="h-5 w-5" />
          {chatUnread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {chatUnread}
            </span>
          )}
        </Link>

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
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName ?? user.username}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <User className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400" />
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
                  {t(`roles.${user.role}`)}
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
                  <span>{t('nav.profile')}</span>
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
                  <span>{t('nav.notificationSettings')}</span>
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
                  <span>{t('nav.settings')}</span>
                </button>

                {/* ติดตั้งแอป */}
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={isInstalled || isInstalling}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-sm',
                    isInstalled
                      ? 'cursor-default text-green-600 dark:text-green-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  )}
                >
                  {isInstalled ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>
                    {isInstalled
                      ? t('nav.installed')
                      : isInstalling
                        ? t('nav.installing')
                        : t('nav.installApp')}
                  </span>
                </button>

                {/* Language Switcher in dropdown */}
                <LanguageSwitcher className="w-full px-4 py-2.5 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" />
              </div>

              {/* ออกจากระบบ */}
              <div className="border-t border-gray-200 py-1 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{t('auth.logout')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* iOS Install Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setShowIosGuide(false)}>
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-6 dark:bg-gray-800 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('nav.installApp')}
              </h3>
              <button
                onClick={() => setShowIosGuide(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">1</div>
                <p className="pt-1 text-sm text-gray-600 dark:text-gray-300">
                  {t('pwa.iosStep1')}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">2</div>
                <p className="pt-1 text-sm text-gray-600 dark:text-gray-300">
                  {t('pwa.iosStep2')}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">3</div>
                <p className="pt-1 text-sm text-gray-600 dark:text-gray-300">
                  {t('pwa.iosStep3')}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIosGuide(false)}
              className="mt-6 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              {t('pwa.understood')}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
