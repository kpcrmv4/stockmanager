'use client';

import { useCustomerLocale } from './customer-locale-provider';
import { cn } from '@/lib/utils/cn';

// Two-pill TH/EN toggle styled to match the legacy customer-page.html
// header switch (gold-gradient active pill on accent-subtle background).
export function LangSwitch() {
  const { locale, setLocale } = useCustomerLocale();
  return (
    <div className="customer-lang-switch" role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => setLocale('th')}
        className={cn('customer-lang-btn', locale === 'th' && 'active')}
        aria-pressed={locale === 'th'}
      >
        TH
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={cn('customer-lang-btn', locale === 'en' && 'active')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  );
}
