# Translation Status — EN/TH Language Support

## Architecture
- **Library**: `next-intl` (cookie-based, no URL prefix)
- **Default locale**: `th`
- **Persistence**: Cookie `NEXT_LOCALE` + Zustand `app-store`
- **Translation files**: `src/messages/th.json`, `src/messages/en.json`

## Phase A: Foundation ✅
- [x] Install `next-intl`
- [x] Create `src/i18n/config.ts`
- [x] Create `src/i18n/request.ts`
- [x] Create `src/messages/th.json` + `src/messages/en.json`
- [x] Modify `src/app/layout.tsx` — NextIntlClientProvider + dynamic lang
- [x] Modify `next.config.ts` — add next-intl plugin
- [x] Add `locale` to `src/stores/app-store.ts`
- [x] Create `src/components/layout/language-switcher.tsx`

## Phase B: Navigation & Layout ✅
- [x] `src/lib/modules/registry.ts` — translation keys (nameKey, descriptionKey, groupKey)
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
- [x] `src/app/(dashboard)/overview/page.tsx`
- [ ] `src/app/(dashboard)/stock/page.tsx` + sub-pages ← in progress
- [x] `src/app/(dashboard)/deposit/page.tsx` + sub-pages
- [x] `src/app/(dashboard)/deposit/requests/page.tsx`
- [x] `src/app/(dashboard)/deposit/withdrawals/page.tsx`
- [x] `src/app/(dashboard)/transfer/page.tsx`
- [x] `src/app/(dashboard)/borrow/page.tsx`
- [x] `src/app/(dashboard)/bar-approval/page.tsx`
- [x] `src/app/(dashboard)/hq-warehouse/page.tsx`
- [ ] `src/app/(dashboard)/commission/page.tsx` ← in progress
- [ ] `src/app/(dashboard)/reports/page.tsx` ← in progress
- [ ] `src/app/(dashboard)/activity/page.tsx` ← in progress
- [ ] `src/app/(dashboard)/my-tasks/page.tsx` ← in progress
- [ ] `src/app/(dashboard)/store-overview/page.tsx` ← in progress
- [ ] `src/app/(dashboard)/settings/**` ← in progress
- [ ] `src/app/(dashboard)/profile/page.tsx` ← in progress
- [ ] `src/app/(dashboard)/notifications/page.tsx` ← in progress
- [ ] `src/app/(dashboard)/users/page.tsx` ← in progress
- [x] `src/app/(dashboard)/announcements/**`
- [x] `src/app/(dashboard)/guide/page.tsx`
- [x] `src/app/(dashboard)/performance/**`
- [x] `src/app/(dashboard)/print-listener/**`

## Phase E2: Dashboard Components
- [x] `src/components/deposit/expired-deposits-banner.tsx`
- [x] `src/components/deposit/table-card-grid.tsx`
- [x] `src/components/deposit/request-detail-modal.tsx`
- [ ] `src/components/deposit/_components/deposit-detail.tsx`
- [ ] `src/components/deposit/_components/deposit-form.tsx`
- [x] `src/components/stock/stock-count-banner.tsx`
- [x] `src/components/guide/user-manual.tsx`
- [x] `src/components/guide/manual-data.ts`

## Phase F: Customer Portal ✅
- [x] `src/app/customer/layout.tsx`
- [x] `src/app/customer/page.tsx`
- [x] `src/app/customer/deposit/page.tsx`
- [x] `src/app/customer/withdraw/page.tsx`
- [x] `src/app/customer/history/page.tsx`
- [x] `src/app/customer/promotions/page.tsx`
- [x] `src/app/customer/settings/page.tsx`
- [x] `src/app/customer/_components/customer-provider.tsx`

## Phase G: Print Station ✅
- [x] `src/app/(print-station)/print-station/page.tsx`

## EXCLUDED (Chat System)
- `src/app/(dashboard)/chat/**`
- `src/components/chat/**`
- `src/stores/chat-store.ts`
- `src/lib/chat/**`
- `src/hooks/use-chat-*.ts`

## Notes
- Chat system strings are NOT translated (excluded from scope)
- Bot messages remain in Thai
- EmptyState component receives strings from callers (no internal hardcoded text)
- Database content (product names, customer names, store names) NOT translated
- API route error messages (server-side) kept in Thai for now — can be converted to error codes later
- Guide section content files (`src/components/guide/sections/*.tsx`) contain very long Thai paragraphs — titles translated, body content kept in Thai
