'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAppStore } from '@/stores/app-store';
import type { Locale } from '@/i18n/config';

interface LanguageSwitcherProps {
  collapsed?: boolean;
  className?: string;
}

export function LanguageSwitcher({ collapsed = false, className }: LanguageSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const { setLocale } = useAppStore();

  const toggle = () => {
    const next: Locale = locale === 'th' ? 'en' : 'th';
    document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax`;
    setLocale(next);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={locale === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
        'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
        'transition-colors duration-150',
        collapsed && 'justify-center px-2',
        className
      )}
    >
      <Languages className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && (
        <span>{locale === 'th' ? 'EN' : 'TH'}</span>
      )}
    </button>
  );
}
