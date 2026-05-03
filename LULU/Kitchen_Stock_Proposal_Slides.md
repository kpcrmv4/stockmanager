---
marp: true
theme: default
size: 16:9
paginate: true
header: 'Kitchen Stock Module — stockManager'
footer: 'Trakarnta / LULU · 2026-05-03'
style: |
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;700&display=swap');
  section { font-family: 'Noto Sans Thai', 'Sarabun', sans-serif; font-size: 26px; }
  section.lead { text-align: center; }
  section.lead h1 { font-size: 56px; }
  h1 { color: #0f766e; }
  h2 { color: #115e59; border-bottom: 2px solid #14b8a6; padding-bottom: 4px; }
  table { font-size: 22px; }
  code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
  .small { font-size: 20px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .pill { display: inline-block; background: #14b8a6; color: white; padding: 2px 10px; border-radius: 12px; font-size: 18px; }
---

<!-- _class: lead -->

# 🍽️ Kitchen Stock Module
## ระบบจัดการวัตถุดิบ-สั่งซื้อ-เบิก-ของเสีย
### สำหรับร้านอาหารหลายสาขา + ครัวกลาง

stockManager · ต่อยอดบนระบบฝากเหล้าเดิม

---

## 1 · เป้าหมายโดยย่อ

- จัดการ **สต๊อกวัตถุดิบของแต่ละร้าน** แยกอิสระ
- ร้านสามารถ **เบิกจาก "ครัวกลาง"** ได้
- มีระบบ **สั่งซื้อ (PO)** + พิมพ์ใบสั่งซื้อตามแบบเดิม
- **บันทึกของเสีย (Spoilage)** ตามวัน + คำนวณต้นทุนรวม
- คำนวณ **Food Cost %** ต่อจาน-ต่อเดือน อัตโนมัติ
- ใช้ฐานข้อมูลเดียว — ไม่กระทบโดเมนเหล้าเดิม

---

## 2 · ปัญหาตั้งชื่อ "HQ" ซ้ำ

ระบบเดิมมี "HQ" สำหรับฝากเหล้ากลางอยู่แล้ว — จึงต้องตั้งชื่อใหม่

| โดเมนเดิม (เหล้า) | โดเมนใหม่ (อาหาร) |
|---|---|
| `stores.is_central` = HQ คลังเหล้า | `stores.is_commissary` = **ครัวกลาง** |
| `hq_deposits` | `commissary_stocks` / ledger |
| `transfers` (สาขา↔สาขา เหล้า) | `commissary_requisitions` (เบิก) |
| `deposits` / `withdrawals` (ลูกค้า) | — ไม่เกี่ยว |

> **Commissary** เป็นคำมาตรฐานวงการ F&B แปลตรงตัวว่า "ครัวกลางที่กระจายวัตถุดิบ"
> 1 ร้านสามารถเป็นทั้ง alcohol-HQ และ commissary พร้อมกันได้

---

## 3 · ภาพรวม Architecture

```
┌─────────────────────────────────────────────────────────────┐
│   MASTER (ใช้ร่วมทั้ง chain)                                 │
│   ingredients · categories · suppliers · recipes             │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌──────────┐          ┌──────────┐         ┌──────────┐
   │Commissary│ ─issue──▶│ Branch A │         │ Branch B │
   │(ครัวกลาง) │          │  stock   │         │  stock   │
   └──────────┘          └──────────┘         └──────────┘
        ▲                     │                     │
        │                     ▼                     ▼
   PO → supplier         usage / spoil         usage / spoil
```

---

## 4 · Entity Map (13 ตารางใหม่)

<div class="grid2">

**🟢 Master Data**
- `ingredients`
- `ingredient_categories`
- `suppliers`

**🔵 Recipe / Costing**
- `recipes`
- `recipe_items`

**🟡 Procurement**
- `purchase_orders`
- `purchase_order_items`
- `goods_receipts`

</div>

<div class="grid2">

**🟣 Inventory**
- `stock_movements` *(ledger)*
- `stock_balances` *(view)*
- `commissary_requisitions`
- `commissary_requisition_items`

**🔴 Quality**
- `spoilage_logs`
- `stock_counts` + items

</div>

---

## 5 · Master Data — `ingredients`

วัตถุดิบ ~79 รายการจาก LULU — 4 หมวด: Meats / Vegetables / Sauces / Pantry

| field | type | หมายเหตุ |
|---|---|---|
| `name` | text | ชื่อวัตถุดิบ |
| `category_id` | FK | หมวด |
| `base_unit` | enum | g / ml / pcs |
| `default_pack_size` | numeric | 1000g, 500ml, 90pcs |
| `default_pack_price` | numeric | ราคาต่อแพ็ค |
| `current_avg_cost` | numeric *(WAC)* | คำนวณจาก receipts |
| `default_supplier_id` | FK | optional |

> **Costing**: Weighted Average Cost — อัปเดตทุกครั้งที่รับของ

---

## 6 · Recipe & Food Cost

```
total_food_cost = Σ(use_qty × ingredient.cost_per_unit) × waste_factor
food_cost_pct  = total_food_cost / sell_price × 100
```

| ตาราง | ฟิลด์สำคัญ |
|---|---|
| `recipes` | name, section, sell_price, **waste_factor=1.30**, is_batch, batch_yield, version |
| `recipe_items` | recipe_id, ingredient_id, **use_qty**, unit |

**Versioning** — สูตรเปลี่ยนสร้าง v2 ใหม่, deactivate v1
ไม่กระทบรายงาน historical

---

## 7 · Procurement Flow

```
[Manager] create PO ─▶ [Owner] approve ─▶ พิมพ์ใบ PO ─▶ supplier
                                                            │
                                                            ▼
                          stock_movements ◀── goods_receipt
                          (type=receipt, +qty)   (ติ๊ก + qty จริง)
```

ใบ PO printable เลียนแบบ template เดิม — Check box · Items · Quantity · Price · ผู้สั่ง · ผู้อนุมัติ

**ใช้ infra เดิม** `print_queue` / `print_server_status` ที่มีอยู่แล้ว

---

## 8 · Inventory Ledger — Single Event Source

`stock_movements` = ledger เดียวรวมทุกธุรกรรม (signed qty)

| type | ที่มา | qty |
|---|---|---|
| `receipt` | goods_receipt จาก supplier | +qty |
| `transfer_in` / `transfer_out` | requisition ครัวกลาง↔สาขา | ± qty |
| `recipe_use` | POS ขาย *(P7)* | −qty |
| `spoil` | spoilage_log | −qty |
| `count_correction` | stock_count variance | ±qty |
| `adjust` | manual แก้ไขโดย admin | ±qty |

> `stock_balances` = materialized view: `SUM(qty) GROUP BY (store_id, ingredient_id)`

---

## 9 · Commissary Requisition (เบิกจากครัวกลาง)

```
[Branch A]               [Commissary]
   │                          │
   │ submit requisition       │
   ├─────────────────────────▶│
   │                          │ approve / ปรับ qty_issued
   │                          │
   │◀─────  issued  ──────────┤
   │                          │
   ▼ stock_movements          ▼ stock_movements
   (transfer_in,  +qty)       (transfer_out, -qty)
```

เลียน flow ของ `transfers` เดิม แต่เป็นตารางแยก ไม่ปนกับโดเมนเหล้า

---

## 10 · Spoilage Tracking

ตามฟอร์ม **Daily Spoil Inventory** ใน Excel เดิม

| field | source |
|---|---|
| date · ingredient · qty (g/pcs) | กรอกมือ / scan |
| **cost** | computed = `qty × current_avg_cost` |
| reason | enum: expired · burned · dropped · over-prep · other |
| head_chef | FK → profiles |
| photo_url | upload (storage path `kitchen-photos/`) |

> Trigger: insert spoilage_log → auto-insert stock_movements (type=spoil, −qty)
> Dashboard: total spoil cost / month + % ของยอดซื้อ

---

## 11 · Integration กับระบบเดิม

<div class="grid2">

**✅ ใช้ร่วม (ลดงาน)**
- `stores` + flag `is_commissary`
- `profiles` + `user_stores`
- `audit_logs`
- `notifications` + LINE
- `chat_rooms` (ห้อง kitchen ops)
- `store_features` (toggle)
- `role_permissions`
- `print_queue` / OCR
- Storage `deposit-photos` style

**🚫 ไม่ปะปน**
- ไม่แตะ `products`
- ไม่แตะ `deposits` / `withdrawals`
- ไม่แตะ `transfers` / `borrows`
- ไม่แตะ `hq_deposits`
- ไม่แตะ `commission_*`

</div>

> เพิ่ม permission keys ใหม่: `kitchen.manage`, `po.approve`, `requisition.fulfill`, `spoilage.log`

---

## 12 · Roadmap (7 Phases)

| # | Phase | เนื้อหา |
|---|---|---|
| **P1** | Master | ingredients · categories · suppliers · recipes + Excel import |
| **P2** | Procurement | PO + receipt + ใบสั่งซื้อ printable |
| **P3** | Inventory | stock_movements ledger + per-store balance |
| **P4** | Commissary | requisition flow (สาขาเบิก ↔ ครัวกลาง) |
| **P5** | Spoilage + Count | spoil log + cycle count + variance |
| **P6** | Analytics | Food Cost %, top-cost dishes, trend |
| **P7** | *(optional)* | POS integration → recipe_use auto-deduct |

---

## 13 · 7 คำถามที่ต้องเคาะก่อน Phase 1

1. **Costing** — WAC / FIFO / Latest? *(แนะ WAC)*
2. **Multi-unit** — ML vs g handling *(base_unit + factor)*
3. **Recipe versioning** — snapshot vs live edit *(snapshot v2)*
4. **Sales data** — manual หรือเชื่อม POS *(P1 manual)*
5. **Supplier-Ingredient** — เก็บ price list หรือใน PO เท่านั้น *(PO + last-price)*
6. **Approval flow** — PO/requisition ต้อง approve? *(per-store flag)*
7. **Naming Thai** — `วัตถุดิบ / ครัวกลาง / สั่งซื้อ / เบิก / ของเสีย`?

---

## 14 · Quick Wins จาก infra เดิม

- ✅ **multi-store + roles** — พร้อมใช้
- ✅ **per-store feature toggle** — เพิ่ม key `kitchen_stock`
- ✅ **role permission matrix** — เพิ่ม permission keys
- ✅ **chat + notifications + LINE** — ส่งแจ้งเตือน PO/spoil ผ่าน LINE
- ✅ **print infra** — พิมพ์ PO ใช้ `print_queue` ที่มีอยู่
- ✅ **OCR** — ถ่ายใบเสร็จ supplier → auto-fill receipt
- ✅ **storage** — รูปของเสีย / รูปวัตถุดิบ ใช้ bucket เดิมได้

---

## 15 · Data จาก LULU (Phase 1 import)

| metric | จำนวน |
|---|---|
| วัตถุดิบ | **79 รายการ** |
| หมวดวัตถุดิบ | 4 |
| สูตรอาหาร | **~60 จาน** (9 sections) |
| ซัพพลายเออร์ | **22 ราย** |
| Waste Factor | **30% (×1.30)** |
| ช่วงราคาเมนู | ฿45 – ฿890 |
| Food Cost tracking | 22 เดือน (Jun 2025 – Mar 2027) |
| Spoil tracking | 20 เดือน (Aug 2025 – Mar 2027) |

> Ready-to-import — มี script แปลง Excel → SQL ได้ใน Phase 1

---

<!-- _class: lead -->

# 📌 ขั้นถัดไป

เลือก 1 หรือมากกว่า:

**A)** เคาะคำตอบ 7 คำถาม + นาม Thai
**B)** เขียน migration SQL ของ Phase 1 (master tables)
**C)** ออกแบบ UI mockup — Recipe builder / PO printable
**D)** สร้าง Excel→DB import script
**E)** Adjust phase ใหม่ตามลำดับความสำคัญ

</content>
