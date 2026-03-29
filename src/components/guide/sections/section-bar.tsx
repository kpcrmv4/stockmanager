import { Card, CardTitle, Step, TipBox, BottomNavPreview, ImgPlaceholder } from '../manual-ui';

export function SectionBar() {
  return (
    <>
      <Card>
        <CardTitle icon="📱">Bottom Navigation — Bar</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Bar ใช้ Mobile Layout มี Bottom Nav 5 ปุ่ม:</p>
        <BottomNavPreview
          items={[
            { icon: '✅', label: 'อนุมัติ', color: 'teal' },
            { icon: '🍷', label: 'ฝาก/เบิก', color: 'emerald' },
            { icon: '💬', label: 'แชท', color: 'bg-blue-500', center: true },
            { icon: '📋', label: 'นับสต๊อก', color: 'indigo' },
            { icon: '📖', label: 'คู่มือ', color: 'cyan' },
          ]}
        />
        <ImgPlaceholder icon="📱" name="img-15-bar-bottom-nav.png" desc="Bottom Navigation ของ Bar (ปุ่มกลาง = แชท)" />
        <TipBox>
          <strong>💡 Drawer Menu:</strong> กดปุ่ม ☰ ที่มุมซ้ายบนเพื่อเปิดเมนูเพิ่มเติม (Dark Mode, โปรไฟล์, ออกจากระบบ)
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="✅">หน้าอนุมัติ (Bar Approval) — หน้าแรกของ Bar</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">เมื่อลูกค้าฝากเหล้า พนักงานบันทึกข้อมูล แล้วรอ Bar ยืนยันรับสินค้า:</p>
        <Step num={1} title="ดูรายการรอยืนยัน">
          <p>หน้าจอแสดงรายการฝากที่รอ Bar ยืนยันรับ แบบ Grid หรือ Table</p>
        </Step>
        <Step num={2} title="กดยืนยันรับสินค้า">
          <p>ระบุหมายเลขโต๊ะ, หมวดหมู่, โน้ต และถ่ายรูปยืนยัน (ถ้าต้องการ)</p>
        </Step>
        <Step num={3} title="ระบบแจ้งเตือนอัตโนมัติ">
          <p>แจ้งเตือนไปยังแชทสาขา + LINE ลูกค้า (ถ้าเปิดใช้)</p>
        </Step>
        <ImgPlaceholder icon="✅" name="img-16-bar-approval.png" desc="หน้า Bar Approval แสดงรายการรอยืนยัน + ปุ่ม Confirm" />
      </Card>
    </>
  );
}
