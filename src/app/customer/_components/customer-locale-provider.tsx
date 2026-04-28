'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/messages/en.json';
import thMessages from '@/messages/th.json';

// Customer LIFF defaults to English (per the legacy customer-page.html)
// with a TH toggle. Stored in localStorage so a returning customer
// keeps their pick. We override the dashboard's locale provider just
// for the /customer subtree by re-mounting NextIntlClientProvider with
// the chosen locale and statically-imported messages.

type CustomerLocale = 'en' | 'th';

const CUSTOMER_LANG_KEY = 'customer-lang';

const MESSAGES: Record<CustomerLocale, Record<string, unknown>> = {
  en: enMessages as Record<string, unknown>,
  th: thMessages as Record<string, unknown>,
};

interface CustomerLocaleContextValue {
  locale: CustomerLocale;
  setLocale: (l: CustomerLocale) => void;
}

const CustomerLocaleContext = createContext<CustomerLocaleContextValue | null>(null);

export function useCustomerLocale() {
  const ctx = useContext(CustomerLocaleContext);
  if (!ctx) throw new Error('useCustomerLocale must be used inside CustomerLocaleProvider');
  return ctx;
}

export function CustomerLocaleProvider({ children }: { children: React.ReactNode }) {
  // SSR/first-paint: render with EN to match the customer-page.html
  // default. The mount effect then upgrades to whatever's saved in
  // localStorage. Brief flash if the user's last pick was TH, but
  // it's a single render swap, no network round-trip.
  const [locale, setLocaleState] = useState<CustomerLocale>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOMER_LANG_KEY) as CustomerLocale | null;
      if (saved === 'en' || saved === 'th') {
        if (saved !== locale) setLocaleState(saved);
      } else {
        localStorage.setItem(CUSTOMER_LANG_KEY, 'en');
      }
    } catch {
      // localStorage blocked (private mode); silent fallthrough — EN stays.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: CustomerLocale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(CUSTOMER_LANG_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <CustomerLocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </CustomerLocaleContext.Provider>
  );
}
