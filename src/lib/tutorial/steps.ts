import type { TutorialFeature } from '@/stores/tutorial-store';

// Each step is a single "page" the side-panel shows. The deposit flow
// is autopilot: when the panel advances to a step the form's
// useEffect applies `fill` to its own state — the user watches the
// data appear, reads the explanation, then clicks ถัดไป to move on.
//
// `targetId` matches a `data-tutorial-id` attribute on the input the
// spotlight should ring. The save step has `autoSave: true` so the
// final click is also automatic — the user just clicks ถัดไป and
// watches the row save itself.

export interface DepositFill {
  customerName?: string;
  customerPhone?: string;
  tableNumber?: string;
  expiryDays?: string;
  notes?: string;
  // First item only — multi-item is out of scope for the autopilot demo
  itemProductName?: string;
  itemCategory?: string;
  itemQuantity?: string;
}

export interface TutorialStep {
  /** id of the element to highlight (data-tutorial-id="...") */
  targetId?: string;
  title: string;
  body: string;
  /** Optional helper line under the body */
  hint?: string;
  /** Auto-fill the form on step entry (deposit flow only) */
  fill?: DepositFill;
  /** Final step before "done" — auto-clicks the save button */
  autoSave?: boolean;
  /** Last step — replaces ถัดไป with เสร็จสิ้น */
  isFinal?: boolean;
}

export interface TutorialFlow {
  feature: TutorialFeature;
  label: string;
  description: string;
  available: boolean;
  steps: TutorialStep[];
}

const depositFlow: TutorialFlow = {
  feature: 'deposit',
  label: 'ฝากเหล้า',
  description: 'ดูระบบกรอกแบบฟอร์มให้ทีละช่อง — บันทึกของจริงแต่เห็นเฉพาะคุณ',
  available: true,
  steps: [
    {
      title: 'เริ่มทดลองฝากเหล้า',
      body: 'ระบบจะเปิดแบบฟอร์มและเติมข้อมูลตัวอย่างให้ดูทีละช่อง\nกด "ถัดไป" เพื่อไปยังช่องถัดไป',
      hint: 'รายการที่สร้างเห็นเฉพาะคุณ จะถูกลบเองภายใน 24 ชั่วโมง — ไม่มีแจ้งเตือน LINE / แชท',
    },
    {
      targetId: 'tut-customer-name',
      title: 'ชื่อลูกค้า',
      body: 'พิมพ์ชื่อลูกค้าที่มาฝาก ระบบจะค้นหาจากลูกค้าเดิมในร้านให้อัตโนมัติ\nตอนนี้เราเติม "ลูกค้าทดลอง" ให้ดูแล้ว',
      fill: { customerName: 'ลูกค้าทดลอง' },
    },
    {
      targetId: 'tut-customer-phone',
      title: 'เบอร์โทรลูกค้า',
      body: 'ใส่เบอร์โทรเพื่อให้ค้นหาเจอตอนเบิก — ไม่บังคับ แต่แนะนำ',
      fill: { customerPhone: '0812345678' },
    },
    {
      targetId: 'tut-table-number',
      title: 'เลขโต๊ะ',
      body: 'ระบุโต๊ะที่ลูกค้านั่งเพื่อให้บาร์ตามเสิร์ฟได้ง่าย\nเว้นว่างได้ถ้าลูกค้าไม่ได้นั่งโต๊ะประจำ',
      fill: { tableNumber: '12' },
    },
    {
      targetId: 'tut-item-product',
      title: 'เลือกสินค้า',
      body: 'ค้นหาสินค้าจากรายการสต๊อกของสาขา — กรอกได้ทั้งชื่อหรือหมวด\nระบบจะตั้งหมวดให้อัตโนมัติเมื่อเลือกสินค้าจากรายการ',
      hint: 'กดปุ่ม "เพิ่มรายการ" ด้านล่างถ้าฝากหลายขวดในใบเดียว',
      fill: { itemProductName: 'ตัวอย่างสินค้า' },
    },
    {
      targetId: 'tut-item-quantity',
      title: 'จำนวน',
      body: 'จำนวนขวดที่รับฝาก ระบบจะสร้างเลขขวดให้แต่ละขวดอัตโนมัติ\n(ขวดที่ 1, 2, 3 ...) เพื่อให้ติดตามการเปิด-ปิดได้แม่น',
      fill: { itemQuantity: '1' },
    },
    {
      targetId: 'tut-expiry-days',
      title: 'ระยะเวลาเก็บรักษา (วัน)',
      body: 'จำนวนวันที่ร้านจะเก็บขวดให้ — ปกติ 30 วัน\nระบบคำนวณวันหมดอายุให้ใต้ช่องนี้อัตโนมัติ',
      hint: 'ลูกค้า VIP เปิดสวิตช์ "สถานะ VIP" ด้านบน → จะไม่มีวันหมดอายุ',
      fill: { expiryDays: '30' },
    },
    {
      targetId: 'tut-photo',
      title: 'ถ่ายรูปขวดเหล้า',
      body: 'ในการใช้งานจริง พนักงานต้องถ่ายรูปขวดก่อนบันทึก\nในโหมดทดลอง ข้ามได้เลย — ระบบไม่อัพโหลดรูปจริง',
    },
    {
      targetId: 'tut-save',
      title: 'บันทึกรายการ',
      body: 'ระบบจะกดปุ่ม "บันทึก" ให้ดูเลย เมื่อกด "ถัดไป"\nรายการนี้เซฟลงฐานข้อมูลจริง — แต่ไม่มีใครเห็นนอกจากคุณ',
      autoSave: true,
    },
    {
      title: 'เสร็จสิ้น 🎉',
      body: 'รายการทดลองของคุณถูกบันทึกแล้ว เห็นได้ในแท็บ "รอยืนยัน"\nรายการจะถูกลบอัตโนมัติภายใน 24 ชั่วโมง',
      hint: 'อยากดูซ้ำ? กดไอคอน ? มุมขวาล่างได้ตลอด',
      isFinal: true,
    },
  ],
};

const withdrawalFlow: TutorialFlow = {
  feature: 'withdrawal',
  label: 'เบิกเหล้า',
  description: 'เร็วๆ นี้ — กำลังเตรียมขั้นตอนทดลอง',
  available: false,
  steps: [],
};

const chatFlow: TutorialFlow = {
  feature: 'chat',
  label: 'แชทในร้าน',
  description: 'เร็วๆ นี้ — กำลังเตรียมขั้นตอนทดลอง',
  available: false,
  steps: [],
};

export const TUTORIAL_FLOWS: TutorialFlow[] = [depositFlow, withdrawalFlow, chatFlow];

export function getFlow(feature: TutorialFeature | null): TutorialFlow | null {
  if (!feature) return null;
  return TUTORIAL_FLOWS.find((f) => f.feature === feature) ?? null;
}
