# Translation Status — EN/TH Language Support

## Architecture
- **Library**: `next-intl` (cookie-based, no URL prefix)
- **Default locale**: `th`
- **Persistence**: Cookie `NEXT_LOCALE` + Zustand `app-store`
- **Translation files**: `src/messages/th.json`, `src/messages/en.json`
- **LanguageSwitcher**: `src/components/layout/language-switcher.tsx`

## Phase A: Foundation ✅
- [x] Install `next-intl`
- [x] Create `src/i18n/config.ts` + `src/i18n/request.ts`
- [x] Create `src/messages/th.json` + `src/messages/en.json`
- [x] Modify `src/app/layout.tsx` — NextIntlClientProvider + dynamic lang
- [x] Modify `next.config.ts` — withNextIntl plugin
- [x] Add `locale` to `src/stores/app-store.ts`
- [x] Create `src/components/layout/language-switcher.tsx`

## Phase B: Navigation & Layout ✅
- [x] `src/lib/modules/registry.ts` — nameKey, descriptionKey, groupKey
- [x] `src/types/roles.ts` — ROLE_LABEL_KEYS
- [x] `src/components/layout/sidebar.tsx`
- [x] `src/components/layout/top-bar.tsx`
- [x] `src/components/layout/bottom-nav.tsx`
- [x] `src/components/layout/mobile-layout.tsx`
- [x] `src/components/layout/store-switcher.tsx`
- [x] `src/components/layout/notification-center.tsx`
- [x] `src/app/(dashboard)/layout-client.tsx`

## Phase C: Auth ✅
- [x] `src/app/(auth)/layout.tsx`
- [x] `src/app/(auth)/login/page.tsx`
- [x] `src/app/(auth)/register/page.tsx`

## Phase D: Common UI & PWA ✅
- [x] `src/components/pwa/install-prompt.tsx`
- [x] `src/components/data/data-table.tsx`
- [x] `src/components/notification/push-prompt.tsx`
- [x] `src/components/notification/notification-bell.tsx`

## Phase E: Dashboard Pages (excluding chat)

### Completed ✅
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

### Remaining (translation keys exist in JSON, page files need t() calls)
- [ ] `src/app/(dashboard)/stock/page.tsx` + 6 sub-pages
- [ ] `src/app/(dashboard)/commission/page.tsx` + 6 _components
- [ ] `src/app/(dashboard)/reports/page.tsx`
- [ ] `src/app/(dashboard)/activity/page.tsx`
- [ ] `src/app/(dashboard)/my-tasks/page.tsx`
- [ ] `src/app/(dashboard)/store-overview/page.tsx`
- [ ] `src/app/(dashboard)/settings/page.tsx` + 4 sub-pages
- [ ] `src/app/(dashboard)/profile/page.tsx`
- [ ] `src/app/(dashboard)/notifications/page.tsx`
- [ ] `src/app/(dashboard)/users/page.tsx`

### Dashboard Components
- [x] `src/components/deposit/expired-deposits-banner.tsx`
- [x] `src/components/deposit/table-card-grid.tsx`
- [x] `src/components/deposit/request-detail-modal.tsx`
- [ ] `src/app/(dashboard)/deposit/_components/deposit-detail.tsx`
- [ ] `src/app/(dashboard)/deposit/_components/deposit-form.tsx`
- [x] `src/components/guide/user-manual.tsx`
- [x] `src/components/guide/manual-data.ts`

## Phase F: Customer Portal ✅
- [x] All 8 files converted

## Phase G: Print Station ✅
- [x] `src/app/(print-station)/print-station/page.tsx`

## EXCLUDED (Chat System)
- `src/app/(dashboard)/chat/**`
- `src/components/chat/**`
- `src/stores/chat-store.ts`
- `src/lib/chat/**`
- `src/hooks/use-chat-*.ts`

## Translation Key Stats
- **th.json**: 900+ keys across 20+ namespaces
- **en.json**: 900+ keys (matching)
- **Namespaces**: common, meta, auth, roles, nav, modules, moduleGroups, notifications, noStore, pwa, language, overview, customer, printStation, performance, guide, dataTable, pushPrompt, notificationBell, printListener, printSetup, announcements, deposit, transfer, borrow, barApproval, hqWarehouse

## How to add translations for remaining pages
Each remaining page follows the same pattern:
```tsx
// 1. Add import
import { useTranslations } from 'next-intl';

// 2. Add at top of component
const t = useTranslations('namespace');

// 3. Replace Thai strings
// Before: 'ข้อความไทย'
// After:  t('keyName')

// 4. Add keys to src/messages/th.json and src/messages/en.json
```

## Notes
- Chat system strings are NOT translated (excluded from scope)
- Bot messages remain in Thai
- Database content (product names, customer names, store names) NOT translated
- API route error messages kept as-is (server-side)
- Guide section body content (`sections/*.tsx`) kept in Thai (very long paragraphs)
- `src/lib/utils/constants.ts` has status labels in Thai — can be converted later
- `src/lib/audit.ts` has audit action descriptions in Thai — overview page handles via translation keys
