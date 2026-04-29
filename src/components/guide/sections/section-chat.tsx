import { Card, CardTitle, RolesBar, TableWrap, Th, Td, ImgPlaceholder } from '../manual-ui';

export function SectionChat() {
  return (
    <>
      <Card>
        <RolesBar roles={['owner', 'manager', 'accountant', 'bar', 'staff', 'hq']} />
        <CardTitle>ประเภทห้องแชท</CardTitle>
        <TableWrap>
          <thead>
            <tr><Th>ประเภท</Th><Th>รายละเอียด</Th><Th>สร้างอัตโนมัติ</Th></tr>
          </thead>
          <tbody>
            <tr><Td><strong>Store</strong></Td><Td>ห้องแชทประจำสาขา สมาชิกคือพนักงานทุกคนในสาขา</Td><Td>ใช่</Td></tr>
            <tr><Td><strong>Direct</strong></Td><Td>แชทตัวต่อตัวระหว่างพนักงาน</Td><Td>ไม่ (สร้างเอง)</Td></tr>
            <tr><Td><strong>Cross-Store</strong></Td><Td>แชทข้ามสาขา สำหรับประสานงานระหว่างสาขา</Td><Td>ไม่ (สร้างเอง)</Td></tr>
          </tbody>
        </TableWrap>
        <ImgPlaceholder icon="💬" name="img-31-chat-room-list.png" desc="รายชื่อห้องแชท แสดง Unread Badge + Last Message Preview" />
      </Card>

      <Card>
        <CardTitle icon="💬">ประเภทข้อความ</CardTitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Text</strong> — ข้อความปกติ รองรับ @mention พนักงาน</li>
          <li><strong>Image</strong> — ส่งรูปภาพ (อัปโหลดจากกล้องหรือไฟล์)</li>
          <li><strong>Action Card</strong> — Card งานจาก Bot (ฝาก/เบิก/สต๊อก/ยืม) กดรับงานได้</li>
          <li><strong>System</strong> — ข้อความระบบ (สถานะอัปเดต, สรุปรายวัน)</li>
        </ul>
        <ImgPlaceholder icon="💬" name="img-32-chat-messages.png" desc="หน้าแชท แสดง Text + Image + Action Card + System Message" />
      </Card>

      <Card>
        <CardTitle icon="🃏">Action Card System</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">เมื่อมีงานใหม่ Bot จะส่ง Action Card อัตโนมัติ:</p>
        <TableWrap>
          <thead>
            <tr><Th>ประเภท Action Card</Th><Th>Trigger</Th><Th>ตัวอย่าง</Th></tr>
          </thead>
          <tbody>
            <tr><Td>🍷 Deposit Claim</Td><Td>ลูกค้าฝากเหล้าใหม่</Td><Td>&quot;คุณสมชาย ฝาก Johnnie Walker Black x2&quot;</Td></tr>
            <tr><Td>📥 Withdrawal</Td><Td>ลูกค้าขอเบิก</Td><Td>&quot;คุณวิภา ขอเบิก Hennessy V.S.O.P&quot;</Td></tr>
            <tr><Td>📋 Stock Explain</Td><Td>ผลเปรียบเทียบสต๊อก</Td><Td>&quot;พบ 5 รายการไม่ตรง รอชี้แจง&quot;</Td></tr>
            <tr><Td>🔄 Borrow</Td><Td>สาขาอื่นขอยืมสินค้า</Td><Td>&quot;สาขา A ขอยืม Absolut Vodka x3&quot;</Td></tr>
            <tr><Td>🏢 Transfer</Td><Td>มีรายการโอนเข้า</Td><Td>&quot;รับโอน 10 รายการจากสาขา B&quot;</Td></tr>
          </tbody>
        </TableWrap>

        <h4 className="mb-2 mt-4 text-base font-semibold text-gray-900 dark:text-white">วงจร Action Card</h4>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Pending</strong> → ยังไม่มีคนรับ (สีเหลือง)</li>
          <li><strong>Claimed</strong> → มีคนรับแล้ว เริ่มนับเวลา (สีน้ำเงิน)</li>
          <li><strong>Completed</strong> → ทำเสร็จแล้ว (สีเขียว)</li>
          <li><strong>Timeout</strong> → หมดเวลา ปล่อยงานกลับ (สีแดง)</li>
        </ul>
        <ImgPlaceholder icon="🃏" name="img-33-action-card-states.png" desc="Action Card 4 สถานะ: Pending, Claimed, Completed, Timeout" />
      </Card>

      <Card>
        <CardTitle icon="📋">สรุปรายวัน (Daily Summary)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">Bot ส่งการ์ดสรุปเข้าแชทสาขาอัตโนมัติทุกเช้า มีข้อมูลต่อไปนี้:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ฝากใหม่วันนี้</strong> — จำนวนรายการฝากที่เข้าระบบ</li>
          <li><strong>เบิกเสร็จวันนี้</strong> — จำนวนรายการเบิกที่ทำสำเร็จ</li>
          <li><strong>ฝากค้างในร้าน</strong> — รายการที่ยังเก็บอยู่ทั้งหมด</li>
          <li><strong>กำลังจะหมดอายุ</strong> — รายการที่จะหมดอายุภายใน 3 วัน</li>
          <li><strong>รอชี้แจงสต๊อก</strong> — comparison ที่ยังไม่มีคำชี้แจง</li>
          <li><strong>ยืมค้าง</strong> — รายการยืมที่ยังไม่จบ</li>
          <li><strong>คืนของยืม</strong> — รายการที่ถึงเวลาคืน (พร้อม preview สินค้า)</li>
        </ul>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          ⏰ ส่งทุกวันเวลา 06:00 น. (เวลาประเทศไทย) — เปิด/ปิดได้ในตั้งค่าสาขา (chat_bot_daily_summary_enabled)
        </p>
        <ImgPlaceholder icon="📋" name="img-34-daily-summary.png" desc="การ์ดสรุปรายวันแสดงยอดฝาก/เบิก/ค้าง + รายการคืนของยืม" />
      </Card>
    </>
  );
}
