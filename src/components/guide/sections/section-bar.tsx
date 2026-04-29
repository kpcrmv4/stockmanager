import { Card, CardTitle, Step, TipBox, BottomNavPreview, ImgPlaceholder } from '../manual-ui';

export function SectionBar() {
  return (
    <>
      <Card>
        <CardTitle icon="📱">เมนูด้านล่างของ Bar</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Bar ใช้บนมือถือ มีเมนูด้านล่าง 5 ปุ่ม:</p>
        <BottomNavPreview
          items={[
            { icon: '📋', label: 'นับสต๊อก', color: 'indigo' },
            { icon: '🍷', label: 'ฝาก/เบิก', color: 'emerald' },
            { icon: '💬', label: 'แชท', color: 'bg-blue-500', center: true },
            { icon: '🔄', label: 'ยืม', color: 'rose' },
            { icon: '↔', label: 'โอน', color: 'blue' },
          ]}
        />
        <ImgPlaceholder icon="📱" name="img-15-bar-bottom-nav.png" desc="เมนูด้านล่างของ Bar" />
        <TipBox>
          <strong>💡 หน้าแรก Bar:</strong> เมื่อ login จะเข้า <code>/chat</code> ทันที — ใช้แชทรับงาน Action Card (อนุมัติเบิก, ยืนยันรับสินค้า)
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="✅">หน้าที่หลักของ Bar</CardTitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ยืนยันรับฝากเหล้า</strong> — รับ Action Card จากแชท → ถ่ายรูปขวด → confirm</li>
          <li><strong>อนุมัติคำขอเบิก</strong> — ลูกค้าขอเบิกผ่าน LIFF → bar กดยืนยันส่งเหล้าให้</li>
          <li><strong>นับสต๊อกประจำวัน</strong> — manual count + เปรียบเทียบ POS</li>
          <li><strong>โอน/ยืมสินค้า</strong> — โอนสินค้าระหว่างสาขาหรือไปคลังกลาง</li>
        </ul>
      </Card>

      <Card>
        <CardTitle icon="🍷">การยืนยันรับฝากเหล้า</CardTitle>
        <Step num={1} title="เห็น Action Card ในแชท">
          <p>Bot ส่งการ์ดเมื่อพนักงานบันทึกฝากเหล้า — แสดงชื่อลูกค้า, สินค้า, จำนวนขวด</p>
        </Step>
        <Step num={2} title='กด "รับงาน" (Claim)'>
          <p>เริ่มนับเวลา timeout 15 นาที</p>
        </Step>
        <Step num={3} title="ถ่ายรูปขวดที่ส่ง + ยืนยัน">
          <p>ระบุหมายเลขโต๊ะ + ถ่ายรูปยืนยัน → กดเสร็จสิ้น</p>
        </Step>
        <ImgPlaceholder icon="✅" name="img-16-bar-deposit-confirm.png" desc="Action Card รับฝากเหล้า + ปุ่ม Confirm" />
      </Card>
    </>
  );
}
