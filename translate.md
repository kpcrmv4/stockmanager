# Translation Status — EN/TH Language Support

## Architecture
- **Library**: `next-intl` v4.9 (cookie-based, no URL prefix)
- **Default locale**: `th`
- **Persistence**: Cookie `NEXT_LOCALE` + Zustand `app-store`
- **Translation files**: `src/messages/th.json` (~1600 lines), `src/messages/en.json` (~1600 lines)
- **LanguageSwitcher**: `src/components/layout/language-switcher.tsx`
- **Config**: `src/i18n/config.ts`, `src/i18n/request.ts`

## Completed ✅

### Foundation
- [x] `next-intl` installed + configured
- [x] `next.config.ts` — withNextIntl plugin
- [x] `src/app/layout.tsx` — NextIntlClientProvider + dynamic `<html lang>`
- [x] `src/stores/app-store.ts` — locale field
- [x] `src/components/layout/language-switcher.tsx`

### Navigation & Layout (all hardcoded Thai replaced)
- [x] `src/lib/modules/registry.ts` — nameKey, descriptionKey, groupKey
- [x] `src/types/roles.ts` — ROLE_LABEL_KEYS
- [x] `src/components/layout/sidebar.tsx`
- [x] `src/components/layout/top-bar.tsx`
- [x] `src/components/layout/bottom-nav.tsx`
- [x] `src/components/layout/mobile-layout.tsx`
- [x] `src/components/layout/store-switcher.tsx`
- [x] `src/components/layout/notification-center.tsx`
- [x] `src/app/(dashboard)/layout-client.tsx`

### Auth (all strings converted)
- [x] `src/app/(auth)/layout.tsx`
- [x] `src/app/(auth)/login/page.tsx`
- [x] `src/app/(auth)/register/page.tsx`

### Common UI & PWA
- [x] `src/components/pwa/install-prompt.tsx`
- [x] `src/components/data/data-table.tsx`
- [x] `src/components/notification/push-prompt.tsx`
- [x] `src/components/notification/notification-bell.tsx`

### Dashboard Pages (fully converted)
- [x] `src/app/(dashboard)/overview/page.tsx` — 200+ keys
- [x] `src/app/(dashboard)/deposit/page.tsx` — 209 keys
- [x] `src/app/(dashboard)/deposit/requests/page.tsx`
- [x] `src/app/(dashboard)/deposit/withdrawals/page.tsx`
- [x] `src/app/(dashboard)/transfer/page.tsx` — 68 keys
- [x] `src/app/(dashboard)/borrow/page.tsx` — 78 keys
- [x] `src/app/(dashboard)/bar-approval/page.tsx` — 58 keys
- [x] `src/app/(dashboard)/hq-warehouse/page.tsx` — 72 keys
- [x] `src/app/(dashboard)/announcements/page.tsx` — 60+ keys
- [x] `src/app/(dashboard)/announcements/new/page.tsx`
- [x] `src/app/(dashboard)/announcements/[id]/page.tsx`
- [x] `src/app/(dashboard)/performance/staff/page.tsx`
- [x] `src/app/(dashboard)/performance/stores/page.tsx`
- [x] `src/app/(dashboard)/performance/operations/page.tsx`
- [x] `src/app/(dashboard)/performance/customers/page.tsx`
- [x] `src/app/(dashboard)/guide/page.tsx`
- [x] `src/app/(dashboard)/print-listener/page.tsx`
- [x] `src/app/(dashboard)/print-listener/setup/page.tsx`
- [x] `src/app/(dashboard)/settings/page.tsx`
- [x] `src/app/(dashboard)/notifications/page.tsx`
- [x] `src/app/(dashboard)/commission/page.tsx`
- [x] `src/app/(dashboard)/users/page.tsx` — 35 keys
- [x] `src/app/(dashboard)/stock/page.tsx` — partial

### Dashboard Components (fully converted)
- [x] `src/components/deposit/expired-deposits-banner.tsx`
- [x] `src/components/deposit/table-card-grid.tsx`
- [x] `src/components/deposit/request-detail-modal.tsx`
- [x] `src/components/guide/user-manual.tsx`
- [x] `src/components/guide/manual-data.ts`

### Customer Portal (all strings converted)
- [x] `src/app/customer/layout.tsx`
- [x] `src/app/customer/page.tsx`
- [x] `src/app/customer/deposit/page.tsx`
- [x] `src/app/customer/withdraw/page.tsx`
- [x] `src/app/customer/history/page.tsx`
- [x] `src/app/customer/promotions/page.tsx`
- [x] `src/app/customer/settings/page.tsx`
- [x] `src/app/customer/_components/customer-provider.tsx`

### Print Station (fully converted)
- [x] `src/app/(print-station)/print-station/page.tsx`

## Remaining (import added, string conversion needed)

These files have `useTranslations` imported but still have hardcoded Thai strings that need to be replaced with `t()` calls. Translation keys for their namespaces (title/subtitle) exist in th.json/en.json.

### Stock sub-pages
- [ ] `src/app/(dashboard)/stock/daily-check/page.tsx` — 71 strings
- [ ] `src/app/(dashboard)/stock/comparison/page.tsx` — 89 strings
- [ ] `src/app/(dashboard)/stock/explanation/page.tsx` — 44 strings
- [ ] `src/app/(dashboard)/stock/approval/page.tsx` — 75 strings
- [ ] `src/app/(dashboard)/stock/products/page.tsx` — 83 strings
- [ ] `src/app/(dashboard)/stock/txt-upload/page.tsx` — 133 strings

### Settings sub-pages
- [ ] `src/app/(dashboard)/settings/notifications/page.tsx` — 21 strings
- [ ] `src/app/(dashboard)/settings/stores/new/page.tsx` — 43 strings
- [ ] `src/app/(dashboard)/settings/store/[storeId]/page.tsx` — 162 strings
- [ ] `src/app/(dashboard)/settings/import-deposits/page.tsx` — 178 strings

### Other pages
- [ ] `src/app/(dashboard)/profile/page.tsx` — 42 strings
- [ ] `src/app/(dashboard)/reports/page.tsx` — 99 strings
- [ ] `src/app/(dashboard)/activity/page.tsx` — 84 strings
- [ ] `src/app/(dashboard)/my-tasks/page.tsx` — 59 strings
- [ ] `src/app/(dashboard)/store-overview/page.tsx` — 42 strings

### Components not yet converted
- [ ] `src/app/(dashboard)/deposit/_components/deposit-detail.tsx` — 190 strings
- [ ] `src/app/(dashboard)/deposit/_components/deposit-form.tsx` — 76 strings
- [ ] `src/app/(dashboard)/commission/_components/*.tsx` — 6 files
- [ ] `src/app/(dashboard)/stock/products/import-csv-modal.tsx` — 46 strings
- [ ] `src/components/stock/stock-count-banner.tsx`
- [ ] `src/components/guide/sections/*.tsx` — long-form content

## EXCLUDED (Chat System)
- `src/app/(dashboard)/chat/**`
- `src/components/chat/**`

## Translation Key Stats
- **1000+ keys** across **30+ namespaces**
- **Namespaces**: common, meta, auth, roles, nav, modules, moduleGroups, notifications, noStore, pwa, language, overview, customer, printStation, performance (staff/stores/operations/customers), guide, dataTable, pushPrompt, notificationBell, printListener, printSetup, announcements, deposit, transfer, borrow, barApproval, hqWarehouse, settings, profile, users, reports, activity, myTasks, storeOverview, notificationsPage, commission, stock

## How to convert remaining pages
```tsx
// 1. Import already added — just add t() at top of component
const t = useTranslations('namespace');

// 2. Replace Thai strings
// Before: 'ข้อความไทย'
// After:  t('keyName')

// 3. Add keys to src/messages/th.json and src/messages/en.json
```
