# StockManager — In-App Chat System

## Project Overview

ระบบแชทภายในสำหรับพนักงาน (แทน LINE Official Account subscription)
พร้อมระบบ Claim งานแบบ Delivery App สำหรับฝากเหล้า/เบิก/สต๊อก

- **ลูกค้า**: ยังใช้ LINE Messaging API + LIFF เหมือนเดิม
- **พนักงาน**: ย้ายมาแชทในแอป + Action Cards
- **แจ้งเตือน LINE กลุ่มพนักงาน**: เก็บไว้แต่ปิดเป็น default (toggle ได้)

## Architecture Decisions

### Realtime Strategy (Quota Optimized)
- ใช้ **Broadcast** แทน Postgres Changes สำหรับ chat messages
- Subscribe เฉพาะห้องที่กำลังดู + 1 lightweight channel สำหรับ unread badge
- Typing indicator ใช้ **Presence** (ไม่เขียน DB)
- Action Card เก็บเป็น **JSONB** ในตาราง chat_messages (ไม่แยกตาราง)

### Estimated Quota (5 สาขา, 20 พนักงาน)
| Resource | Usage/เดือน | Free Plan Limit | Status |
|----------|-------------|-----------------|--------|
| Realtime messages | ~150K | 2M | OK |
| DB growth | ~16 MB | 500 MB | OK |
| Connections | 20-30 | 200 | OK |

---

## Phase Plan

### Phase 1: Chat Foundation ✅ COMPLETED
> DB schema + basic chat UI + realtime + action cards + bot API

- [x] 1.1 — DB Migration: `supabase/migrations/00002_chat_system.sql`
- [x] 1.2 — Zustand chat store: `src/stores/chat-store.ts`
- [x] 1.3 — Chat hooks: `src/hooks/use-chat-rooms.ts`, `use-chat-messages.ts`, `use-chat-realtime.ts`
- [x] 1.4 — Chat room list page: `src/app/(dashboard)/chat/page.tsx`
- [x] 1.5 — Chat message view + input: `src/components/chat/chat-room-view.tsx`, `chat-input.tsx`
- [x] 1.6 — Action Card component: `src/components/chat/action-card-message.tsx`
- [x] 1.7 — Realtime: Broadcast + Badge channel (`use-chat-realtime.ts`)
- [x] 1.8 — Bottom nav + Sidebar: แชทเพิ่มในทุก role
- [x] 1.9 — Bot message API: `src/app/api/chat/bot-message/route.ts`
- [x] 1.10 — Bot helpers: `src/lib/chat/bot.ts` (deposit, withdrawal, stock, borrow builders)

### Phase 2: Action Cards + Claim System
> ระบบรับงานแบบ Delivery App

- [ ] 2.1 — Action Card message type (JSONB schema)
- [ ] 2.2 — Claim/Release/Complete flow
- [ ] 2.3 — Timeout อัตโนมัติ (configurable per store)
- [ ] 2.4 — API route: bot sends action cards
- [ ] 2.5 — Action Card UI components (buttons, status, timer)
- [ ] 2.6 — Priority system (urgent/normal/low)

### Phase 3: Bot Integration — Deposits & Withdrawals
> Bot แจ้งเตือนอัตโนมัติในแชท

- [ ] 3.1 — Trigger: ฝากเหล้าใหม่ → Action Card ในแชทสาขา
- [ ] 3.2 — Trigger: คำขอเบิก → Action Card ในแชทสาขา
- [ ] 3.3 — Trigger: ฝากยืนยันแล้ว → status update ในแชท
- [ ] 3.4 — Trigger: เบิกเสร็จ → status update ในแชท
- [ ] 3.5 — Live summary (pinned message): งานรอ/กำลังทำ/เสร็จ
- [ ] 3.6 — "ถ่ายรูปยืนยัน" flow จากแชท

### Phase 4: Bot Integration — Stock & Transfers
> Bot ผนวกสต๊อก/ยืมสินค้า

- [ ] 4.1 — Trigger: ผลเปรียบเทียบสต๊อก → Action Card + ปุ่มชี้แจง
- [ ] 4.2 — Trigger: Transfer/Borrow request → Action Card ข้ามสาขา
- [ ] 4.3 — Trigger: Approval request → แจ้ง owner/manager
- [ ] 4.4 — Daily summary bot message (สรุปประจำวัน)

### Phase 5: Advanced Features
> ฟีเจอร์เสริม

- [ ] 5.1 — @mention + assign งานตรง
- [ ] 5.2 — Leaderboard / สถิติพนักงานรายวัน
- [ ] 5.3 — ส่งรูป/ไฟล์ในแชท (Supabase Storage)
- [ ] 5.4 — Message archiving cron (ข้อความเก่า > 3 เดือน)
- [ ] 5.5 — Quick action จาก notification popup
- [ ] 5.6 — LINE group notification toggle (ปิด default)

---

## DB Schema Design

### chat_rooms
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK | tenants.id |
| store_id | uuid FK | stores.id (nullable สำหรับ cross-store) |
| name | text | ชื่อห้อง |
| type | enum | 'store' / 'direct' / 'cross_store' |
| is_active | boolean | default true |
| pinned_summary | jsonb | live summary data |
| created_at | timestamptz | |

### chat_messages
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| room_id | uuid FK | chat_rooms.id |
| sender_id | uuid FK | users.id (null = bot) |
| type | enum | 'text' / 'image' / 'action_card' / 'system' |
| content | text | ข้อความ / image URL |
| metadata | jsonb | action_card data, reply_to, etc |
| created_at | timestamptz | |
| archived_at | timestamptz | null = active |

### chat_members
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| room_id | uuid FK | chat_rooms.id |
| user_id | uuid FK | users.id |
| role | enum | 'member' / 'admin' |
| last_read_at | timestamptz | สำหรับ unread count |
| joined_at | timestamptz | |

### Action Card JSONB Schema (in metadata)
```json
{
  "action_type": "deposit_claim",
  "reference_id": "DEP-001234",
  "reference_table": "deposits",
  "status": "pending",
  "claimed_by": null,
  "claimed_at": null,
  "completed_at": null,
  "timeout_minutes": 15,
  "priority": "normal",
  "summary": {
    "customer": "คุณสมชาย",
    "items": "Johnnie Walker Black x2",
    "note": "โต๊ะ VIP 3"
  }
}
```

## Tech Stack
- Next.js 16 + React 19
- Supabase (Postgres + Realtime Broadcast + Presence + Storage)
- Zustand (state management)
- TanStack Query (server state)
- Tailwind CSS v4
- Lucide icons
