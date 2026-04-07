# Translation Status — EN/TH Language Support

## Architecture
- **Library**: `next-intl` (cookie-based, no URL prefix)
- **Default locale**: `th`
- **Persistence**: Cookie `NEXT_LOCALE` + Zustand `app-store`
- **Translation files**: `src/messages/th.json`, `src/messages/en.json`

## Phase A: Foundation
- [x] Install `next-intl`
- [x] Create `src/i18n/config.ts`
- [x] Create `src/i18n/request.ts`
- [x] Create `src/messages/th.json` + `src/messages/en.json`
- [x] Modify `src/app/layout.tsx` — NextIntlClientProvider + dynamic lang
- [x] Modify `next.config.ts` — add next-intl plugin
- [x] Add `locale` to `src/stores/app-store.ts`
- [x] Create `src/components/layout/language-switcher.tsx`

## Phase B: Navigation & Layout
- [x] `src/lib/modules/registry.ts` — translation keys
- [x] `src/types/roles.ts` — ROLE_LABEL_KEYS
- [x] `src/components/layout/sidebar.tsx`
- [x] `src/components/layout/top-bar.tsx`
- [x] `src/components/layout/bottom-nav.tsx`
- [x] `src/components/layout/mobile-layout.tsx`
- [x] `src/components/layout/store-switcher.tsx`
- [x] `src/components/layout/notification-center.tsx`
- [x] `src/app/(dashboard)/layout-client.tsx`

## Phase C: Auth
- [x] `src/app/(auth)/layout.tsx`
- [x] `src/app/(auth)/login/page.tsx`
- [x] `src/app/(auth)/register/page.tsx`

## Phase D: Common UI & PWA
- [x] `src/components/pwa/install-prompt.tsx`

## Phase E: Dashboard Pages (excluding chat)
- [ ] `src/app/(dashboard)/overview/page.tsx`
- [ ] `src/app/(dashboard)/stock/page.tsx` + sub-pages
- [ ] `src/app/(dashboard)/deposit/page.tsx` + sub-pages
- [ ] `src/app/(dashboard)/transfer/page.tsx`
- [ ] `src/app/(dashboard)/borrow/page.tsx`
- [ ] `src/app/(dashboard)/bar-approval/page.tsx`
- [ ] `src/app/(dashboard)/hq-warehouse/page.tsx`
- [ ] `src/app/(dashboard)/commission/page.tsx`
- [ ] `src/app/(dashboard)/reports/page.tsx`
- [ ] `src/app/(dashboard)/activity/page.tsx`
- [ ] `src/app/(dashboard)/my-tasks/page.tsx`
- [ ] `src/app/(dashboard)/store-overview/page.tsx`
- [ ] `src/app/(dashboard)/settings/**`
- [ ] `src/app/(dashboard)/profile/page.tsx`
- [ ] `src/app/(dashboard)/notifications/page.tsx`
- [ ] `src/app/(dashboard)/users/page.tsx`
- [ ] `src/app/(dashboard)/announcements/**`
- [ ] `src/app/(dashboard)/guide/page.tsx`
- [ ] `src/app/(dashboard)/performance/**`
- [ ] `src/app/(dashboard)/print-listener/**`

## Phase F: Customer Portal
- [ ] `src/app/customer/layout.tsx` + all pages

## Phase G: Print Station
- [ ] `src/app/(print-station)/**`

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
