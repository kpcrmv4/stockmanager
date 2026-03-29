import { Card, CardTitle, Step, BottomNavPreview, ImgPlaceholder } from '../manual-ui';

export function SectionStaff() {
  return (
    <>
      <Card>
        <CardTitle icon="📱">Bottom Navigation — Staff</CardTitle>
        <BottomNavPreview
          items={[
            { icon: '🍷', label: 'ฝาก/เบิก', color: 'emerald' },
            { icon: '📋', label: 'นับสต๊อก', color: 'indigo' },
            { icon: '💬', label: 'แชท', color: 'bg-blue-500', center: true },
            { icon: '🔄', label: 'ยืมสินค้า', color: 'rose' },
            { icon: '📖', label: 'คู่มือ', color: 'cyan' },
          ]}
        />
        <ImgPlaceholder icon="📱" name="img-17-staff-bottom-nav.png" desc="Bottom Navigation ของ Staff (ปุ่มกลาง = แชท)" />
      </Card>

      <Card>
        <CardTitle icon="📋">หน้า My Tasks (หน้าแรก Staff)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">Dashboard งานส่วนตัว แสดง:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>งานฝากที่ต้องทำ</strong> — รายการฝากเหล้ารอดำเนินการ</li>
          <li><strong>งานเบิกที่ต้องทำ</strong> — คำขอเบิกเหล้ารอจัดการ</li>
          <li><strong>สถานะ Real-time</strong> — อัปเดตอัตโนมัติ</li>
          <li><strong>Claim/Complete</strong> — กดรับงาน + ถ่ายรูปเมื่อเสร็จ</li>
        </ul>
        <ImgPlaceholder icon="📋" name="img-18-staff-my-tasks.png" desc="หน้า My Tasks แสดงรายการงานที่ต้องทำ + สถานะ" />
      </Card>

      <Card>
        <CardTitle icon="📷">ขั้นตอนการรับงานจากแชท (Action Card)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">เมื่อมีงานใหม่ Bot จะส่ง Action Card ในแชทสาขา:</p>
        <Step num={1} title="เห็น Action Card ในแชท">
          <p>Card แสดงรายละเอียดงาน: ชื่อลูกค้า, สินค้า, ความสำคัญ</p>
        </Step>
        <Step num={2} title='กด "รับงาน" (Claim)'>
          <p>คนแรกที่กดได้งาน เริ่มนับเวลา Timeout (15 นาที)</p>
        </Step>
        <Step num={3} title="ดำเนินการ + ถ่ายรูปยืนยัน">
          <p>เมื่อเสร็จกด &quot;เสร็จสิ้น&quot; พร้อมแนบรูปถ่าย</p>
        </Step>
        <ImgPlaceholder icon="🃏" name="img-19-action-card-flow.png" desc="Action Card 3 สถานะ: Pending → Claimed → Completed" />
      </Card>
    </>
  );
}
