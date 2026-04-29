import { Card, CardTitle, Step, BottomNavPreview, TipBox, ImgPlaceholder } from '../manual-ui';

export function SectionStaff() {
  return (
    <>
      <Card>
        <CardTitle icon="📱">Bottom Navigation — Staff</CardTitle>
        <BottomNavPreview
          items={[
            { icon: '🍷', label: 'ฝาก/เบิก', color: 'emerald' },
            { icon: '💬', label: 'แชท', color: 'bg-blue-500', center: true },
            { icon: '📖', label: 'คู่มือ', color: 'cyan' },
          ]}
        />
        <TipBox>
          <strong>💡 หน้าแรก Staff:</strong> เมื่อ login จะเข้า <code>/chat</code> โดยตรง — ไม่มีหน้า &quot;ภาพรวม&quot; แยกต่างหาก
        </TipBox>
        <ImgPlaceholder icon="📱" name="img-17-staff-bottom-nav.png" desc="Bottom Navigation ของ Staff" />
      </Card>

      <Card>
        <CardTitle icon="💬">หน้าแชท (หน้าแรก Staff)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">เมื่อ Staff เข้าสู่ระบบจะเห็นหน้าแชทของสาขาทันที:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Action Cards</strong> — งานใหม่จาก bot (ฝาก/เบิก/นับสต๊อก) → กด &quot;รับงาน&quot; เพื่อเริ่มทำ</li>
          <li><strong>Real-time</strong> — งานใหม่เข้ามาเห็นทันที ไม่ต้องรีเฟรช</li>
          <li><strong>สรุปรายวัน</strong> — bot ส่งสรุปงานเสร็จ/พลาดทุกคืน</li>
        </ul>
        <ImgPlaceholder icon="💬" name="img-18-staff-chat.png" desc="หน้าแชท + Action Cards" />
      </Card>

      <Card>
        <CardTitle icon="🃏">การรับงานจาก Action Card</CardTitle>
        <Step num={1} title="เห็น Action Card ในแชท">
          <p>Card แสดงรายละเอียดงาน: ชื่อลูกค้า, สินค้า, ความสำคัญ</p>
        </Step>
        <Step num={2} title='กด "รับงาน" (Claim)'>
          <p>คนแรกที่กดได้งาน เริ่มนับเวลา Timeout (15 นาที)</p>
        </Step>
        <Step num={3} title="ดำเนินการ + ถ่ายรูปยืนยัน">
          <p>เมื่อเสร็จกด &quot;เสร็จสิ้น&quot; พร้อมแนบรูปถ่าย</p>
        </Step>
        <TipBox>
          <strong>⏰ Auto-release:</strong> ถ้ากดรับงานแล้วไม่กดเสร็จภายใน 15 นาที งานจะกลับเข้าคิวให้คนอื่นกดได้
        </TipBox>
        <ImgPlaceholder icon="🃏" name="img-19-action-card-flow.png" desc="Action Card 3 สถานะ: Pending → Claimed → Completed" />
      </Card>
    </>
  );
}
