# LULU Korean Bistro — System Analysis
## วิเคราะห์ระบบจากไฟล์ LULU_MasterList_Final-4.xlsx

> เอกสารนี้วิเคราะห์โครงสร้างข้อมูล, สูตรคำนวณ, และความสัมพันธ์ของข้อมูลทั้งหมดในไฟล์ Excel สำหรับใช้เป็นแนวทางในการพัฒนาเว็บแอปพลิเคชัน

---

## 1. ภาพรวมระบบ (System Overview)

ไฟล์ประกอบด้วย 6 ชีต ที่ทำงานร่วมกันเป็นระบบบริหารจัดการร้านอาหารเกาหลี:

| ชีต | หน้าที่ | จำนวนแถว |
|-----|---------|----------|
| Master List | ฐานข้อมูลวัตถุดิบหลัก + ราคาต้นทุน | ~1,000 |
| All On Menu | รายการเมนูทั้งหมดที่ขาย | ~994 |
| All Dishes | สูตรอาหาร + ต้นทุนต่อจาน | ~1,138 |
| Food Cost | บันทึกค่าใช้จ่ายวัตถุดิบรายวัน/รายเดือน (2025–2027) | ~1,851 |
| SupplierList | รายชื่อซัพพลายเออร์ | ~22 รายการ |
| Daily Spoil Inventory | บันทึกของเสีย/สินค้าหมดอายุรายวัน | ~1,007 |

---

## 2. Master List — ฐานข้อมูลวัตถุดิบ

### 2.1 โครงสร้างข้อมูล (Schema)

| คอลัมน์ | ฟิลด์ | ชนิดข้อมูล | คำอธิบาย |
|---------|-------|-----------|----------|
| A | # | Number | ลำดับวัตถุดิบ |
| B | Ingredient | String | ชื่อวัตถุดิบ (EN) |
| C | Category | String | หมวดหมู่ |
| D | Unit | String | หน่วยวัด (g, Pcs, ML) |
| E | Pack Size (g) | Number | ขนาดแพ็ค (กรัม) |
| F | Pack Price (฿) | Number | ราคาต่อแพ็ค (บาท) |
| G | Cost / g (฿) | Formula | ต้นทุนต่อกรัม |
| H | Source | String | แหล่งซื้อ (ยังไม่ได้กรอก) |
| I | Pack Size (kg) | Formula | ขนาดแพ็คเป็นกิโลกรัม |
| J | Price / kg (฿) | Formula | ราคาต่อกิโลกรัม |

### 2.2 สูตรคำนวณ (Formulas)

```
G (Cost/g)     = IF(E>0, F/E, "")           → ราคาแพ็ค ÷ ขนาดแพ็ค
I (Pack kg)    = E/1000                      → แปลงกรัมเป็นกิโลกรัม
J (Price/kg)   = IF(E>0, F/E*1000, "")      → ต้นทุนต่อกรัม × 1000
```

### 2.3 หมวดหมู่วัตถุดิบ (4 Categories)

**Meats & Proteins — 17 รายการ**
| # | วัตถุดิบ | หน่วย | ขนาดแพ็ค | ราคาแพ็ค (฿) | ต้นทุน/g (฿) |
|---|---------|------|---------|-------------|-------------|
| 1 | Beef | g | 1,000g | 2,200 | 2.200 |
| 2 | Beef Short Ribs | g | 1,000g | — | — |
| 3 | Chicken | g | 1,000g | 89 | 0.089 |
| 4 | Chicken Egg | Pcs | 90 pcs | 357 | 3.967/pcs |
| 5 | Clams / Shellfish | g | 1,000g | 65 | 0.065 |
| 6 | Dumplings (Mandu) | g | 660g | 147 | 0.223 |
| 7 | Fish Cake | g | 1,000g | 160 | 0.160 |
| 8 | Fried Chicken | g | — | — | — |
| 9 | Pork | g | 1,000g | 192 | 0.192 |
| 10 | Pork Belly | g | 1,000g | 192 | 0.192 |
| 11 | Quail Eggs | Pcs | 50 pcs | 89 | 1.780/pcs |
| 12 | Saba Fish | g | 900g | 375 | 0.417 |
| 13 | Seafood | g | 80g | — | — |
| 14 | Shrimp | g | 1,000g | 275 | 0.275 |
| 15 | Spam | g | 340g | 120 | 0.353 |
| 16 | Squid | g | 1,000g | 230 | 0.230 |
| 17 | Tamago (Sweet Fried Egg) | g | — | — | — |

**Vegetables — 31 รายการ**
| # | วัตถุดิบ | ขนาดแพ็ค | ราคาแพ็ค (฿) | ต้นทุน/g (฿) |
|---|---------|---------|-------------|-------------|
| 18 | Baby Cos Lettuce | 500g | 150 | 0.300 |
| 19 | Bean Sprouts | 1,000g | 20 | 0.020 |
| 21 | Carrot | 1,000g | 29 | 0.029 |
| 22 | Cucumber | 1,000g | 35 | 0.035 |
| 23 | Daikon Radish | 1,000g | 60 | 0.060 |
| 24 | Edamame | 1,000g | 83 | 0.083 |
| 25 | Enoki Mushroom | 200g | 15 | 0.075 |
| 27 | Garlic | 1,000g | 87 | 0.087 |
| 28 | Garlic Chives | 1,000g | 90 | 0.090 |
| 29 | Ginger | 1,000g | 110 | 0.110 |
| 30 | Green Chili | 1,000g | 100 | 0.100 |
| 31 | Green Onion | 1,000g | 80 | 0.080 |
| 32 | Green Papaya | 3,000g | 135 | 0.045 |
| 36 | Kimchi | 1,000g | 100 | 0.100 |
| 37–39 | Korean Chili (ต่างขนาด) | 1,000g | 200 | 0.200 |
| 41 | Napa Cabbage | 1,000g | 34 | 0.034 |
| 42 | Onion | 1,000g | 29 | 0.029 |
| 45 | Soft Tofu (Sundubu) | 300g | 40 | 0.133 |
| 46 | Spinach | 1,000g | 90 | 0.090 |
| 47 | Tofu | 300g | 40 | 0.133 |
| 48 | Zucchini | 1,000g | 90 | 0.090 |

**Sauces & Condiments — 18 รายการ**
| # | วัตถุดิบ | ขนาดแพ็ค | ราคาแพ็ค (฿) | ต้นทุน/g (฿) |
|---|---------|---------|-------------|-------------|
| 51 | Fish Sauce | 1,500g | 57 | 0.038 |
| 53 | Ganjang Sauce | 10,000g | 1,300 | 0.130 |
| 54 | Gochujang (Chili Paste) | 4,000g | 1,350 | 0.338 |
| 57 | Korean Dark Soy Sauce | 2,500g | 450 | 0.180 |
| 60 | Korean Vinegar | 10,000g | 650 | 0.065 |
| 61 | MSG (Thai) | 1,000g | 110 | 0.110 |
| 63 | Salt | 1,000g | 15 | 0.015 |
| 64 | Seoul Zeed (Korean Seasoning) | 1,000g | 250 | 0.250 |
| 65 | Sesame Oil | 650 ML | 165 | 0.254 |
| 66 | Sugar | 1,000g | 30 | 0.030 |

**Pantry & Dry Goods — 13 รายการ**
| # | วัตถุดิบ | ขนาดแพ็ค | ราคาแพ็ค (฿) | ต้นทุน/g (฿) |
|---|---------|---------|-------------|-------------|
| 67 | Cheese | 84 pcs | 389 | 4.631/pcs |
| 68 | Dried Seaweed | 50g | 85 | 1.700 |
| 70 | Glutinous Rice Flour | 500g | 35 | 0.070 |
| 71 | Japanese Rice | 5,000g | 289 | 0.058 |
| 72 | Noodle | 1,000g | 130 | 0.130 |
| 73 | Ramyeon | 1 pcs | 33 | 33.000/pcs |
| 76 | Sesame Seeds | 500g | 70 | 0.140 |
| 77 | Tempura / Frying Flour | 1,000g | 78 | 0.078 |
| 79 | Wheat Flour | 1,000g | 50 | 0.050 |

### 2.4 ข้อสังเกตสำหรับเว็บแอป

- วัตถุดิบมี 3 ประเภทหน่วย: **g** (กรัม), **Pcs** (ชิ้น), **ML** (มิลลิลิตร)
- บางรายการยังไม่มีราคา (ราคา = null) → ต้องรองรับ optional fields
- คอลัมน์ Source ยังว่าง → เตรียมไว้สำหรับผูกกับ SupplierList ในอนาคต
- บางรายการเป็น "สูตรผสม" (เช่น Bibimbap Sauce, Bulgogi Sauce) ที่มีสูตรย่อยในชีต All Dishes > SAUCE

---

## 3. All On Menu — เมนูที่ขาย

### 3.1 โครงสร้างข้อมูล

| คอลัมน์ | ฟิลด์ | ชนิดข้อมูล | คำอธิบาย |
|---------|-------|-----------|----------|
| A | # | Number | ลำดับในหมวด |
| B | Dish Name | String | ชื่อเมนู |
| C | Key Ingredients | String | วัตถุดิบหลัก (คั่นด้วยคอมมา) |
| D | Price (฿) | Number | ราคาขาย |
| E | Menu | String | แบรนด์/เมนู (LULU) |
| F | In All Dishes | String | สถานะว่ามีข้อมูลต้นทุนในชีต All Dishes หรือยัง |
| G | Notes | String | หมายเหตุ |

### 3.2 หมวดเมนู (8 Sections, ~59 รายการ)

**🥢 Side Dishes (ของทานเล่น/เครื่องเคียง) — 20 รายการ**

| เมนู | ราคาขาย (฿) |
|------|------------|
| Napa Cabbage Kimchi - 85g | 50 |
| Cucumber Kimchi - 85g | 45 |
| Papaya Kimchi - 85g | 45 |
| Stir Fried Spinach - 85g | 45 |
| Fried Zucchini x 3 | 50 |
| Pickled Radish - 85g | 45 |
| Quail Eggs x 4 | 45 |
| Stir Fried Fish Cake - 85g | 50 |
| Tamago - Rolled Eggs x 3 | 50 |
| Fried Tofu x 3 | 50 |
| Stir Fried Bean Sprouts - 85g | 45 |
| Dumplings (Gogi Mandu) | 280 |
| Spicy Fried Chicken | 280 |
| Garlic Fried Chicken | 280 |
| Kimchi-jeon (V) | 300 |
| Seafood Jeon (Shrimp, Squid, Clams) | 360 |
| Edamame | 200 |
| Spicy Edamame | 220 |
| Japchae | 280 |
| Tteokbokki | 280 |

**🍖 Main Set + Rice, Side Dish x4, Seaweed Soup — 11 รายการ**

| เมนู | ราคาขาย (฿) |
|------|------------|
| Grilled Saba Fish | 380 |
| Squid Gochujang | 360 |
| Pork Belly Gochujang | 380 |
| Bossam - Boiled Pork Belly | 380 |
| A4 Wagyu (100g) | 890 |
| Pork Bulgogi | 360 |
| Beef Bulgogi | 380 |
| Beef Bibimbap + Fried Egg | 320 |
| Pork Bibimbap + Fried Egg | 360 |
| LA Galbi (Korean BBQ Short Ribs) | 690 |
| Kimchi Fried Rice + Fried Egg | 320 |

**🍲 Soup Set (Jjigae) — 3+ รายการ**

| เมนู | ราคาขาย (฿) |
|------|------------|
| Kimchi Jjigae Soup | 320 |
| Seafood Sundubu | 360 |
| Spam Kimchi Jjigae | 340 |
| Seaweed Soup | 200 |
| Cold Kimchi Noodle | 280 |
| Pork Ramyeon (Soup/Dry) | 300 |
| Seafood Ramyeon (Soup/Dry) | 320 |

**📦 Dosirak Lunchbox — 4 รายการ**

| เมนู | ราคาขาย (฿) |
|------|------------|
| Spam Dosirak | 360 |
| Squid Gochujang Dosirak | 380 |
| Shrimp Dosirak | 380 |
| Pork Belly Dosirak | 360 |

**🍻 Drinks — 9+ รายการ** (ยังไม่มีราคาขายกำหนด)

| เมนู |
|------|
| Jinro Chamisul Fresh / Strawberry / Peach / Grape |
| Terra Beer |
| Jinro + Yakult + Sprite / Cucumber / Mogu Mogu |
| Jinro Grape + Lemonade + Soda |

### 3.3 ช่วงราคา

- Side Dishes: ฿45–360
- Main Set: ฿320–890
- Soup/Noodles: ฿200–340
- Dosirak: ฿360–380
- Drinks: ยังไม่กำหนดราคา

---

## 4. All Dishes — สูตรอาหารและต้นทุนต่อจาน (หัวใจของระบบ)

### 4.1 โครงสร้างข้อมูล

ชีตนี้มี 2 รูปแบบคอลัมน์ขึ้นอยู่กับหมวด:

**รูปแบบ A (SIDE DISHES):**

| คอลัมน์ | ฟิลด์ | ชนิดข้อมูล |
|---------|-------|-----------|
| B | No. | Number |
| C | Dish Name | String |
| D (ingredient rows) | Ingredient (EN) — ใน C | String |
| D | Pack Size | Number |
| E | Unit | String |
| F | Pack Price | Number |
| G | Cost/g | Formula |
| H | Use Weight | Number |
| I | Use Weight (g/pcs) / Total Cost | Formula |

**รูปแบบ B (TO SHARE, MAIN SET, NOODLES, DOSIRAK, SOUP, SAUCE):**

| คอลัมน์ | ฟิลด์ | ชนิดข้อมูล |
|---------|-------|-----------|
| B | No. | Number |
| C | Dish Name / Ingredient (EN) | String |
| D | — | — |
| E | Cost / Price | Number |
| F | Unit | String |
| G | Pack Qty | Number |
| H | Price per g/pcs | Formula |
| I | Use Weight (g/pcs) | Number |
| J | Total Cost (฿) | Formula |

### 4.2 สูตรคำนวณหลัก

#### สูตรต้นทุนต่อกรัม (Cost per gram)
```
Cost/g = IFERROR(Pack_Price / Pack_Size, 0)
```
ตัวอย่าง: Napa Cabbage → ฿34 ÷ 1,000g = ฿0.034/g

#### สูตรต้นทุนต่อวัตถุดิบ (Ingredient Total Cost)
```
Ingredient_Cost = IFERROR(Cost_per_g × Use_Weight, 0)
```
ตัวอย่าง: Napa Cabbage ใช้ 10,000g → ฿0.034 × 10,000 = ฿340

#### สูตรต้นทุนรวมต่อจาน (Dish Total Cost)
```
Total_Food_Cost = SUM(all_ingredient_costs) × 1.3
```
- **ตัวคูณ 1.3 = รวม 30% สำหรับ Damage/Waste (ของเสีย/สูญเสีย)**
- นี่คือค่า buffer มาตรฐานที่ใช้ทุกจาน

#### สูตร Food Cost Percentage
```
Food_Cost_% = Total_Food_Cost / Sell_Price
```
(ใช้สูตร `=I_total / I_sell_price` หรือ `=I_total / J_sell_price`)

### 4.3 รายการสูตรอาหารทั้งหมด (9 หมวด, 80 จาน)

#### ▌ SIDE DISHES (19 จาน)

| # | ชื่อจาน | จำนวนวัตถุดิบ | ต้นทุนรวม (฿) |
|---|--------|-------------|-------------|
| 1 | Napa Cabbage Kimchi | 16 | 1,332.37* |
| 2 | Cucumber Kimchi | 8 | 53.48 |
| 3 | Green Papaya Kimchi | 7 | 89.62 |
| 4 | Spinach Banchan | 4 | 67.48 |
| 5 | Fried Zucchini | 3 | 323.83 |
| 6 | Radish (Seasoned) | 5 | 427.86 |
| 7 | Edamame | 2 | 32.38 |
| 8 | Quail Eggs | 8 | 158.00 |
| 9 | Stir Fried Fish Cake | 6 | 110.70 |
| 10 | Tamago - Rolled Eggs | 5 | 27.82 |
| 11 | Fried Tofu | 3 | 331.80 |
| 12 | Cucumber Salad | 8 | 59.96 |
| 13 | Stir-Fried Papaya | 5 | 26.91 |
| 14 | Stir-Fried Spinach | 6 | 71.72 |
| 15 | Stir-Fried Bean Sprouts | 8 | 45.25 |
| 16 | Fried Zucchini (1 Plate) | 3 | 19.59 |
| 17 | Pickled Daikon Radish | 5 | 475.31 |
| 18 | Spicy Edamame | 3 | 28.74 |
| 19 | Seaweed Soup (Miyeokguk) | 7 | 228.59 |

> *หมายเหตุ: Napa Cabbage Kimchi ต้นทุนสูงเพราะทำเป็น batch ใหญ่ (ใช้ผัก 10 กก.)

#### ▌ TO SHARE (7 จาน)

| # | ชื่อจาน | จำนวนวัตถุดิบ | ต้นทุนรวม (฿) |
|---|--------|-------------|-------------|
| 1 | Dumplings x 8pcs | 3 | 54.47 |
| 2 | Spicy Fried Chicken | 3 | 44.90 |
| 3 | Garlic Fried Chicken | 3 | 40.09 |
| 4 | Kimchi Jeon (V) | 4 | 29.87 |
| 5 | Seafood Jeon | 9 | 82.69 |
| 7 | Japchae | 7 | 59.43 |
| 8 | Tteokbokki | 8 | 127.06 |

#### ▌ MAIN SET — incl. Rice + Side x4 + Seaweed Soup (14 จาน)

| # | ชื่อจาน | จำนวนวัตถุดิบ | ต้นทุนรวม (฿) |
|---|--------|-------------|-------------|
| 1 | Grilled Saba Fish | 8 | 141.64 |
| 2 | Squid Gochujang | 13 | 135.50 |
| 3 | Pork Belly Gochujang | 12 | 104.82 |
| 4 | Bossam - Boiled Pork Belly Wrap | 7 | 63.86 |
| 5 | A4 Wagyu Striploin Wrap | 17 | 321.25 |
| 6 | Pork Neck Bulgogi | 12 | 133.73 |
| 7 | Beef UK Bulgogi | 12 | 160.90 |
| 8 | Beef UK Bibimbap + Fried Egg | 12 | 150.35 |
| 9 | Pork Bibimbap + Fried Egg | 11 | 116.70 |
| 10 | Squid Bibimbap + Fried Egg | 10 | 407.55 |
| 13 | Kimchi Fried Rice | 14 | 111.29 |
| 14 | LA Galbi Wagyu (Short Ribs) | 11 | 329.53 |

#### ▌ NOODLES SET — incl. Baby Cos + Side x4 + Seaweed Soup (5 จาน)

| # | ชื่อจาน | จำนวนวัตถุดิบ | ต้นทุนรวม (฿) |
|---|--------|-------------|-------------|
| 1 | Cold Noodle Pork Belly (DRY) | 13 | 117.36 |
| 2 | Pork Belly Ramyeon (SOUP) | 9 | 73.78 |
| 3 | Seafood Ramyeon (SOUP) | 11 | 98.15 |
| 5 | Pork Belly Ramyeon (DRY) | 10 | 83.37 |
| 6 | Seafood Ramyeon (DRY) | 11 | 107.46 |

#### ▌ DOSIRAK LUNCHBOX — incl. Seaweed Soup (4 จาน)

| # | ชื่อจาน | จำนวนวัตถุดิบ | ต้นทุนรวม (฿) |
|---|--------|-------------|-------------|
| 1 | Spam Dosirak | 11 | 142.20 |
| 2 | Squid Dosirak | 11 | 136.61 |
| 3 | Shrimp Dosirak | 11 | 136.16 |
| 4 | Pork Belly Dosirak | 11 | 116.28 |

#### ▌ SOUP SET — incl. Rice + Side x4 (5 จาน)

| # | ชื่อจาน | จำนวนวัตถุดิบ | ต้นทุนรวม (฿) |
|---|--------|-------------|-------------|
| 1 | Pork Belly Kimchi Soup | 13 | 71.13 |
| 2 | Seafood Kimchi Soup | 15 | 134.58 |
| 3 | Spam Kimchi Soup | 12 | 67.74 |
| 4 | Seafood Sundubu Soup | 12 | 103.69 |
| 5 | Spam & Seafood Sundubu Soup | 13 | 126.64 |

#### ▌ SAUCE (สูตรซอส 6 รายการ — ใช้เป็นส่วนผสมในจานอื่น)

| # | ชื่อซอส | จำนวนวัตถุดิบ | ต้นทุนรวม (฿) |
|---|--------|-------------|-------------|
| 1 | Gochujang Sauce (Saba/Bibimbap) | 7 | 687.59 |
| 2 | Spicy Fried Chicken Sauce | 8 | 203.32 |
| 3 | Garlic Fried Chicken Sauce | 7 | 122.07 |
| 4 | Japchae Sauce | 7 | 137.80 |
| 5 | Bulgogi Sauce | 14 | 242.45 |
| 6 | Tteokbokki Sauce | 9 | 763.23 |

> หมายเหตุ: ซอสทำเป็น batch ใหญ่ ต้นทุนสูงเพราะเป็นต้นทุนทั้ง batch ไม่ใช่ต่อจาน

#### ▌ Side Dishes (ข้อมูลเครื่องเคียงที่มากับเซ็ต — 10 จาน, ยังไม่มี ingredient data)

| # | ชื่อจาน |
|---|--------|
| 1–10 | Napa Cabbage Kimchi, Cucumber Kimchi, Green Papaya Kimchi, Stir Fried Spinach, Braised Quail Egg, Pickled Radish, Stir Fried Fish Cake, Stir Fried Bean Sprout, Fried Egg, Fried Zucchini |

#### ▌ DRINKS (9 รายการ — ยังไม่มี ingredient/cost data)

| # | ชื่อเครื่องดื่ม |
|---|---------------|
| 1–5 | Jinro Chamisul Fresh / Strawberry / Peach / Grape, Terra Beer |
| 6–9 | Cocktails: Jinro + Yakult + Sprite/Cucumber/Mogu Mogu, Jinro Grape + Lemonade + Soda |

### 4.4 ตัวอย่างสูตรอาหารแบบละเอียด

**Napa Cabbage Kimchi (Batch ใหญ่):**

| วัตถุดิบ | Pack Size | Pack Price | Cost/g | Use Weight | Total Cost |
|---------|----------|-----------|--------|-----------|-----------|
| Napa Cabbage | 1,000g | ฿34 | ฿0.034 | 10,000g | ฿340.00 |
| Onion | 1,000g | ฿29 | ฿0.029 | 2,000g | ฿58.00 |
| Garlic | 1,000g | ฿87 | ฿0.087 | 500g | ฿43.50 |
| Garlic Chives | 1,000g | ฿90 | ฿0.090 | 500g | ฿45.00 |
| Ginger | 1,000g | ฿110 | ฿0.110 | 150g | ฿16.50 |
| Thai Green Onion | 1,000g | ฿80 | ฿0.080 | 500g | ฿40.00 |
| Daikon Radish | 1,000g | ฿60 | ฿0.060 | 3,000g | ฿180.00 |
| Dried Red Chili | 1,000g | ฿90 | ฿0.090 | 120g | ฿10.80 |
| Korean Chili (Small) | 1,000g | ฿200 | ฿0.200 | 500g | ฿100.00 |
| Korean Chili (Large) | 1,000g | ฿200 | ฿0.200 | 500g | ฿100.00 |
| Salt | 1,000g | ฿30 | ฿0.030 | 600g | ฿18.00 |
| Fish Sauce | 1,500g | ฿57 | ฿0.038 | 400g | ฿15.20 |
| Sugar | 1,000g | ฿30 | ฿0.030 | 400g | ฿12.00 |
| Korean Chili Flakes | 1,000g | ฿250 | ฿0.250 | 50g | ฿12.50 |
| Wheat Flour | 1,000g | ฿50 | ฿0.050 | 500g | ฿25.00 |
| Glutinous Rice Flour | 500g | ฿35 | ฿0.070 | 120g | ฿8.40 |
| **รวม (× 1.3 waste)** | | | | | **฿1,332.37** |

---

## 5. Food Cost — ระบบบันทึกค่าวัตถุดิบ

### 5.1 โครงสร้าง

ชีตนี้แบ่งเป็น 2 ส่วน:

**ส่วนที่ 1: Monthly Summary (แถว 4–27)**

| คอลัมน์ | ฟิลด์ | สูตร |
|---------|-------|------|
| A | Month | String ("June 2025" – "March 2027") |
| B | Food Cost (฿) | `=H[monthly_section_row]` → ดึงยอดรวมจากส่วนรายวัน |
| C | Sales (฿) | `=I[monthly_section_row]` → ดึงยอดขายจากส่วนรายวัน |
| D | Food Cost % | `=IF(C>0, B/C, "")` → ต้นทุน ÷ ยอดขาย |
| E | Transactions | `=COUNTA(B[daily_range])` → นับจำนวนรายการสั่งซื้อ |

**ส่วนที่ 2: Daily Entries (แถว 29 เป็นต้นไป, แบ่งเป็น block รายเดือน)**

| คอลัมน์ | ฟิลด์ | คำอธิบาย |
|---------|-------|----------|
| A | Month label | ป้ายเดือน (📅 June 2025, etc.) |
| B | Supplier | ชื่อซัพพลายเออร์ (dropdown จาก SupplierList) |
| C | Date | วันที่สั่งซื้อ |
| D | Amount (฿) | จำนวนเงิน |
| E | Staff | ชื่อพนักงานที่สั่ง |
| F | Note | หมายเหตุ |
| H | Monthly Food Cost | `=SUM(D[range])` → รวมยอดรายเดือน |
| I | Monthly Sales | Number (กรอกมือ) |
| J | Food Cost % | `=IF(I>0, H/I, "")` |

### 5.2 สูตรสำคัญ

```
Monthly_Food_Cost = SUM(daily_amounts_in_month)
Food_Cost_% = Monthly_Food_Cost / Monthly_Sales
Transaction_Count = COUNTA(supplier_entries_in_month)
Grand_Total_Food_Cost = SUM(all_monthly_food_costs)
Grand_Total_Sales = SUM(all_monthly_sales)
Overall_Food_Cost_% = Total_Food_Cost / Total_Sales
```

### 5.3 ระยะเวลา

- ครอบคลุม **22 เดือน**: June 2025 – March 2027
- แต่ละเดือนมีพื้นที่สำหรับ ~100 รายการ
- ยอดรวม (TOTAL) อยู่แถว 27

---

## 6. SupplierList — รายชื่อซัพพลายเออร์

### 6.1 รายชื่อทั้งหมด (22 ราย)

| # | ซัพพลายเออร์ |
|---|-------------|
| 1 | Avocado Shop |
| 2 | Delish Food |
| 3 | Etc. |
| 4 | Farang Food |
| 5 | Freshket |
| 6 | Gogo Foods |
| 7 | Gourmet One |
| 8 | Larder One |
| 9 | Lineman Shop |
| 10 | Lotus's |
| 11 | Makro |
| 12 | Meatalia |
| 13 | Micro Green |
| 14 | Office Depot |
| 15 | Officina |
| 16 | Ppn&seafood |
| 17 | Repertoire |
| 18 | Siamsamut Warin |
| 19 | Standard Nursing |
| 20 | The Food Smith |
| 21 | Tiktok Shop |
| 22 | Villa Market |

### 6.2 โครงสร้าง

- คอลัมน์ A เท่านั้น: รายชื่อ plain text
- ใช้เป็น data validation source สำหรับ dropdown ในชีต Food Cost

---

## 7. Daily Spoil Inventory — ระบบบันทึกของเสีย

### 7.1 โครงสร้าง

**ส่วนที่ 1: Monthly Summary (แถว 4–25)**

| คอลัมน์ | ฟิลด์ | สูตร |
|---------|-------|------|
| A | Month | String |
| B | Total Entries | `COUNTA(item_range)` หรือ hardcoded |
| C | Total Spoil Cost (฿) | `=G[monthly_sum_row]` → ดึงจากส่วนรายวัน |

**ส่วนที่ 2: Daily Entries (แถว 27 เป็นต้นไป)**

| คอลัมน์ | ฟิลด์ | คำอธิบาย |
|---------|-------|----------|
| A | Month label | ป้ายเดือน |
| B | Date | วันที่ |
| C | Item | ชื่อสินค้าที่เสีย |
| D | Price/Unit (฿) | ราคาต่อหน่วย |
| E | Qty (g) | ปริมาณเป็นกรัม |
| F | Qty (pcs) | ปริมาณเป็นชิ้น |
| G | Cost (฿) | ต้นทุนของเสีย (formula หรือ manual) |
| H | Head Chef | ชื่อหัวหน้าพ่อครัวเวร |
| I | Remark | หมายเหตุ |

### 7.2 สูตรสำคัญ

```
Monthly_Spoil_Total = SUM(daily_spoil_costs_in_month)
Monthly_Entry_Count = COUNTA(item_entries_in_month)
Grand_Total_Entries = SUM(all_monthly_entries)
Grand_Total_Spoil = SUM(all_monthly_spoil_costs)
```

### 7.3 ระยะเวลา

- ครอบคลุม **20 เดือน**: August 2025 – March 2027
- แต่ละเดือนมีพื้นที่สำหรับ ~30 รายการ

---

## 8. ความสัมพันธ์ระหว่างข้อมูล (Data Relationships)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Master List     │────▶│   All Dishes     │────▶│  All On Menu    │
│  (วัตถุดิบ)      │     │  (สูตร+ต้นทุน)    │     │  (เมนู+ราคาขาย)  │
│                 │     │                  │     │                 │
│  - ชื่อ          │     │  - วัตถุดิบ/จาน    │     │  - ชื่อเมนู       │
│  - ราคาแพ็ค      │     │  - ปริมาณใช้       │     │  - ราคาขาย       │
│  - ต้นทุน/g      │     │  - ต้นทุนรวม       │     │  - สถานะ         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
┌─────────────────┐     ┌──────────────────┐
│  SupplierList   │────▶│   Food Cost      │
│  (ซัพพลายเออร์)   │     │  (ค่าใช้จ่ายรายวัน) │
│                 │     │                  │
│  - dropdown     │     │  - รายการสั่งซื้อ    │
│    source       │     │  - ยอดรวม/เดือน    │
└─────────────────┘     │  - Food Cost %    │
                        └──────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │ Daily Spoil      │
                        │ (ของเสียรายวัน)    │
                        │                  │
                        │  - รายการเสีย      │
                        │  - ต้นทุนเสีย      │
                        └──────────────────┘
```

### Relationship Details:

1. **Master List → All Dishes**: วัตถุดิบและราคาถูกอ้างอิง (copy) ไปใช้ในสูตรอาหาร (ปัจจุบันไม่ได้ใช้ VLOOKUP แต่กรอกซ้ำ)
2. **All Dishes → All On Menu**: ชื่อจานและต้นทุนถูก cross-reference กับราคาขาย (ผ่านคอลัมน์ "In All Dishes")
3. **SupplierList → Food Cost**: รายชื่อใช้เป็น dropdown สำหรับคอลัมน์ Supplier
4. **Food Cost ↔ Daily Spoil**: ทั้งสองติดตามต้นทุนคู่ขนานกัน — Food Cost คือของที่ซื้อจริง, Spoil คือของที่เสีย

---

## 9. แนวทางออกแบบเว็บแอป (Web App Design Recommendations)

### 9.1 Data Models (Database Schema)

```
// วัตถุดิบ
Ingredient {
  id: UUID
  name: String
  category: Enum [MEATS, VEGETABLES, SAUCES, PANTRY]
  unit: Enum [GRAM, PIECE, ML]
  pack_size: Decimal
  pack_price: Decimal
  cost_per_unit: Decimal (computed)
  supplier_id: FK → Supplier (nullable)
}

// เมนู
Dish {
  id: UUID
  name: String
  section: Enum [SIDE, TO_SHARE, MAIN_SET, NOODLES, DOSIRAK, SOUP, SAUCE, DRINKS]
  sell_price: Decimal (nullable)
  waste_factor: Decimal (default: 1.3)
  is_active: Boolean
  is_batch: Boolean   // สำหรับ kimchi, sauce ที่ทำเป็น batch
  batch_yield: Decimal // ถ้าเป็น batch: ได้กี่ serving
}

// สูตรอาหาร (วัตถุดิบต่อจาน)
DishIngredient {
  id: UUID
  dish_id: FK → Dish
  ingredient_id: FK → Ingredient
  use_weight: Decimal      // ปริมาณใช้ (g หรือ pcs)
  total_cost: Decimal (computed)
}

// ซัพพลายเออร์
Supplier {
  id: UUID
  name: String
  contact: String (nullable)
  notes: String (nullable)
}

// บันทึกค่าวัตถุดิบ
FoodCostEntry {
  id: UUID
  supplier_id: FK → Supplier
  date: Date
  amount: Decimal
  staff: String
  note: String (nullable)
  month: String (computed)
}

// บันทึกของเสีย
SpoilEntry {
  id: UUID
  date: Date
  item: String
  price_per_unit: Decimal
  qty_grams: Decimal (nullable)
  qty_pieces: Integer (nullable)
  cost: Decimal (computed)
  head_chef: String
  remark: String (nullable)
  month: String (computed)
}

// ยอดขายรายเดือน
MonthlySales {
  id: UUID
  month: String
  sales_amount: Decimal
}
```

### 9.2 Computed Fields (สูตรที่ต้อง implement ในเว็บแอป)

```javascript
// 1. ต้นทุนต่อหน่วยวัตถุดิบ
ingredient.cost_per_unit = ingredient.pack_price / ingredient.pack_size

// 2. ต้นทุนวัตถุดิบต่อจาน
dish_ingredient.total_cost = ingredient.cost_per_unit * dish_ingredient.use_weight

// 3. ต้นทุนอาหารรวมต่อจาน (รวม waste)
dish.total_food_cost = SUM(dish_ingredients.total_cost) * dish.waste_factor

// 4. Food Cost %
dish.food_cost_pct = dish.total_food_cost / dish.sell_price * 100

// 5. กำไรขั้นต้น
dish.gross_profit = dish.sell_price - dish.total_food_cost

// 6. ยอดรวมค่าวัตถุดิบรายเดือน
monthly.food_cost = SUM(food_cost_entries.amount) WHERE month = target_month

// 7. Food Cost % รายเดือน
monthly.food_cost_pct = monthly.food_cost / monthly.sales * 100

// 8. ยอดของเสียรายเดือน
monthly.spoil_cost = SUM(spoil_entries.cost) WHERE month = target_month
```

### 9.3 ฟีเจอร์หลักที่แนะนำ

1. **Ingredient Management** — CRUD วัตถุดิบ, อัปเดตราคาอัตโนมัติ propagate ไปทุกสูตร
2. **Recipe Builder** — ลาก-วาง วัตถุดิบ, คำนวณต้นทุนแบบ real-time
3. **Menu Pricing** — ดูกำไรขั้นต้น, Food Cost % ทุกเมนู
4. **Daily Food Cost Log** — บันทึกการสั่งซื้อ, เลือก supplier จาก dropdown
5. **Spoilage Tracker** — บันทึกของเสีย, dashboard สรุปรายเดือน
6. **Dashboard** — Monthly summary, Food Cost % trend, Top-cost dishes
7. **Batch Recipe Support** — สูตรที่ทำเป็น batch (kimchi, sauce) แล้วแบ่ง serving

### 9.4 ข้อควรระวังในการ Migrate

- ราคาวัตถุดิบใน All Dishes ถูก hardcode ไม่ได้ link กลับ Master List → ต้อง normalize เป็น FK
- บางจานมีเลขที่ซ้ำ (เช่น Spicy Edamame #18 มี 2 รายการ) → ต้อง deduplicate
- Drinks ยังไม่มีข้อมูลต้นทุน → ต้องเพิ่มภายหลัง
- Side Dishes section ท้ายสุดไม่มี ingredient data → เป็นรายการ "เครื่องเคียงที่แถมมากับเซ็ต" น่าจะ reference กลับไป Side Dishes section แรก
- Sauce section เป็นต้นทุน batch → ต้องคำนวณ cost per serving แยก
- หน่วย ML กับ g ไม่ตรงกันในบางรายการ (เช่น Sesame Oil = 650 ML แต่ unit = ML)

---

## 10. สรุป Key Metrics จากข้อมูล

| Metric | ค่า |
|--------|-----|
| จำนวนวัตถุดิบทั้งหมด | 79 รายการ |
| จำนวนหมวดวัตถุดิบ | 4 หมวด |
| จำนวนเมนูบนเมนู | ~59 รายการ |
| จำนวนสูตรอาหาร (มี ingredient data) | ~60 จาน |
| จำนวนซัพพลายเออร์ | 22 ราย |
| ช่วงราคาเมนู | ฿45 – ฿890 |
| Waste Factor มาตรฐาน | 30% (×1.3) |
| ระยะเวลา Food Cost tracking | 22 เดือน (Jun 2025 – Mar 2027) |
| ระยะเวลา Spoil tracking | 20 เดือน (Aug 2025 – Mar 2027) |

---

*เอกสารนี้สร้างจากการวิเคราะห์ไฟล์ LULU_MasterList_Final-4.xlsx เมื่อ 7 เมษายน 2026*
