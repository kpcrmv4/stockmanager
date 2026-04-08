# Translation Status — EN/TH Language Support ✅ COMPLETED

## Architecture
- **Library**: `next-intl` v4.9 (cookie-based, no URL prefix)
- **Default locale**: `th`
- **Persistence**: Cookie `NEXT_LOCALE` + Zustand `app-store`
- **Translation files**: `src/messages/th.json` (~2500 keys), `src/messages/en.json` (~2500 keys)
- **LanguageSwitcher**: `src/components/layout/language-switcher.tsx`
- **Config**: `src/i18n/config.ts`, `src/i18n/request.ts`

## Stats
- **Total TH keys**: 2,488
- **Total EN keys**: 2,507
- **Namespaces**: 37
- **Files converted**: 80+
- **TypeScript errors**: 0

## All Phases Complete ✅

### Foundation ✅
- next-intl installed + configured
- next.config.ts — withNextIntl plugin
- layout.tsx — NextIntlClientProvider + dynamic `<html lang>`
- app-store.ts — locale field
- LanguageSwitcher component

### Navigation & Layout ✅ (9 components)
- sidebar, top-bar, bottom-nav, mobile-layout, store-switcher, notification-center
- Module registry (nameKey, descriptionKey, groupKey)
- Role labels (ROLE_LABEL_KEYS)
- layout-client.tsx

### Auth ✅ (3 pages)
- login, register, layout

### Common UI & PWA ✅ (4 components)
- install-prompt, data-table, push-prompt, notification-bell

### Dashboard Pages ✅ (40+ pages)
- overview (200+ keys)
- stock: main + daily-check, comparison, explanation, approval, products, txt-upload (285 keys)
- deposit: main + requests, withdrawals + detail, form components (209+ keys)
- transfer (68 keys), borrow (78 keys), bar-approval (58 keys), hq-warehouse (72 keys)
- announcements: list, new, edit (60+ keys)
- performance: staff, stores, operations, customers
- guide + user-manual + manual-data
- print-listener + setup
- settings: main + notifications, stores/new, store/[storeId], import-deposits
- profile (40 keys), reports (78 keys), activity (52 keys)
- my-tasks (44 keys), store-overview (35 keys)
- notifications (7 keys), commission + 6 sub-components (100+ keys)
- users (35 keys)

### Customer Portal ✅ (8 files)
- layout, home, deposit, withdraw, history, promotions, settings, provider

### Print Station ✅ (1 file)
- print-station/page.tsx

## Intentionally NOT translated
- **Chat system** — excluded from scope per requirements
- **Code comments** — no user impact
- **API fallback names** — `'พนักงาน'`, `'สาขา'` etc. used as default values for API/DB
- **Notification body text** — push notification content sent to device
- **POS data matching** — Thai column header detection in txt-upload parsing
- **CSV status matching** — Thai status values in import-deposits
- **Guide section body content** — very long Thai paragraphs in sections/*.tsx
- **API route error messages** — server-side, can be converted to error codes later

## How to switch language
Users click the language toggle (🌐 EN/TH) in:
- Desktop: Sidebar footer + TopBar user dropdown
- Mobile: Drawer footer + TopBar user dropdown

Language preference is stored in cookie `NEXT_LOCALE` and Zustand `app-store`.
