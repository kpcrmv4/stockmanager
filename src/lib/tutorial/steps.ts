import type { TutorialFeature } from '@/stores/tutorial-store';

// Each step describes a single "page" in the side panel: a title, body
// (markdown-lite — line breaks via \n), and optionally a `targetId` that
// the spotlight overlay highlights and `pathHint` reminding the user
// where to be (e.g. "หน้ารายการฝาก") if they wandered off.
//
// We intentionally don't drive navigation from here — the user clicks
// the actual button on the page (e.g. "ฝากเหล้าใหม่") and we just
// advance the step automatically when the form mounts. Keeps the UX
// honest: they're using the real product, not a scripted demo.

export interface TutorialStep {
  /** id of the element to highlight (data-tutorial-id="...") */
  targetId?: string;
  title: string;
  body: string;
  /** Optional helper text under the body, e.g. "ระบบจะสร้างรหัสทดลองให้อัตโนมัติ" */
  hint?: string;
  /** When true, the "ถัดไป" button is replaced by a "เสร็จสิ้น" button. */
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
  description: 'ลองสร้างรายการฝากเหล้าหนึ่งรายการ — เห็นเฉพาะคุณ จะลบใน 24 ชม.',
  available: true,
  steps: [
    {
      title: 'เริ่มทดลองฝากเหล้า',
      body: 'เราจะพาคุณกรอกแบบฟอร์มฝากเหล้าหนึ่งรายการแบบจริงๆ\nรายการนี้เห็นเฉพาะคุณคนเดียว และจะถูกลบเองภายใน 24 ชั่วโมง',
      hint: 'ไม่มีการแจ้งเตือน LINE / แชท / ใบพิมพ์จากการทดลองนี้',
    },
    {
      targetId: 'deposit-new-button',
      title: 'กดปุ่ม "ฝากเหล้าใหม่"',
      body: 'หากยังอยู่หน้ารายการฝาก ให้กดปุ่ม "ฝากเหล้าใหม่" ที่มุมขวาบน เพื่อเปิดแบบฟอร์ม',
      hint: 'ไปที่หน้าเมนู ฝากเหล้า ก่อนถ้ายังไม่อยู่',
    },
    {
      targetId: 'deposit-form-customer',
      title: 'กรอกข้อมูลลูกค้า',
      body: 'พิมพ์ชื่อลูกค้า เบอร์โทร และเลขโต๊ะ\nระบบจะค้นหาจากลูกค้าเดิมในร้านได้อัตโนมัติ',
      hint: 'ในโหมดทดลอง พิมพ์ชื่อสมมุติเช่น "ลูกค้าทดลอง" ได้เลย',
    },
    {
      targetId: 'deposit-form-items',
      title: 'เลือกสินค้าและจำนวน',
      body: 'ค้นหาสินค้าจากกล่องค้นหา (ดึงจากสินค้าจริงในสต๊อกของสาขา) และกรอกจำนวน\nกด "เพิ่มรายการ" ถ้าฝากหลายขวด',
    },
    {
      targetId: 'deposit-form-storage',
      title: 'ตั้งวันหมดอายุ',
      body: 'ใส่จำนวนวันที่เก็บรักษา (ปกติ 30 วัน)\nระบบจะคำนวณวันหมดอายุให้อัตโนมัติด้านล่าง',
      hint: 'หากเป็นลูกค้า VIP เปิดสวิตช์ "สถานะ VIP" — จะไม่มีวันหมดอายุ',
    },
    {
      targetId: 'deposit-form-photo',
      title: 'ถ่ายรูปขวดเหล้า',
      body: 'ปกติพนักงานต้องถ่ายรูปขวดก่อนบันทึก เพื่อยืนยันสินค้าที่รับฝาก\nในโหมดทดลอง ข้ามขั้นตอนนี้ได้เลย — ระบบจะไม่บังคับ',
      hint: 'ในการใช้งานจริง รูปจะถูกอัพโหลดและแนบไปกับใบรับฝาก',
    },
    {
      targetId: 'deposit-form-save',
      title: 'กดบันทึก',
      body: 'กดปุ่ม "บันทึกรายการฝาก" — ระบบจะสร้างรหัสทดลอง (DEMO-…) และพากลับหน้ารายการ',
      hint: 'รายการนี้เป็นของจริงในฐานข้อมูล แต่ติดเครื่องหมายทดลอง — ใครคนอื่นมองไม่เห็น',
    },
    {
      title: 'เสร็จสิ้น 🎉',
      body: 'รายการทดลองของคุณถูกบันทึกแล้ว เห็นได้ในแท็บ "รอยืนยัน"\nรายการจะถูกลบอัตโนมัติภายใน 24 ชั่วโมง หรือคุณกดเข้าไปทดลองฟีเจอร์อื่นๆ เช่น เบิก/ยืนยัน ต่อได้',
      hint: 'อยากดูซ้ำ? กดปุ่มไอคอน ? อีกครั้งได้ตลอด',
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
