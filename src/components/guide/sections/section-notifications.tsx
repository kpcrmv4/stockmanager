import { Card, CardTitle, TableWrap, Th, Td, ImgPlaceholder } from '../manual-ui';

export function SectionNotifications() {
  return (
    <>
      <Card>
        <CardTitle>ช่องทางแจ้งเตือน</CardTitle>
        <TableWrap>
          <thead>
            <tr><Th>ช่องทาง</Th><Th>รายละเอียด</Th><Th>ผู้รับ</Th></tr>
          </thead>
          <tbody>
            <tr><Td><strong>In-App</strong></Td><Td>แจ้งเตือนในระบบ (กดกระดิ่ง)</Td><Td>พนักงานทุกคน</Td></tr>
            <tr><Td><strong>PWA Push</strong></Td><Td>Web Push Notification บนมือถือ/Desktop</Td><Td>พนักงาน (ต้องเปิดใช้)</Td></tr>
            <tr><Td><strong>LINE Push</strong></Td><Td>แจ้งเตือนผ่าน LINE</Td><Td>ลูกค้า + พนักงาน</Td></tr>
            <tr><Td><strong>LINE กลุ่ม</strong></Td><Td>แจ้งเตือนในกลุ่ม LINE พนักงาน</Td><Td>สาขา (ปิดเป็น default)</Td></tr>
            <tr><Td><strong>Chat Bot</strong></Td><Td>Bot ส่ง Action Card ในแชทสาขา</Td><Td>พนักงานในสาขา</Td></tr>
          </tbody>
        </TableWrap>
      </Card>

      <Card>
        <CardTitle>ประเภทแจ้งเตือน</CardTitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>🍷 <strong>ฝากเหล้าใหม่</strong> — แจ้งพนักงานเมื่อมีลูกค้าฝาก</li>
          <li>✅ <strong>ยืนยันฝากแล้ว</strong> — แจ้งลูกค้าเมื่อ Bar รับสินค้า</li>
          <li>📥 <strong>คำขอเบิก</strong> — แจ้งพนักงานเมื่อลูกค้าขอเบิก</li>
          <li>📦 <strong>เบิกสำเร็จ</strong> — แจ้งลูกค้าเมื่อเบิกเสร็จ</li>
          <li>⚠ <strong>ใกล้หมดอายุ</strong> — แจ้งลูกค้าก่อนเหล้าหมดอายุ</li>
          <li>📋 <strong>ผลสต๊อก</strong> — แจ้ง Manager เมื่อเปรียบเทียบเสร็จ</li>
          <li>📜 <strong>รออนุมัติ</strong> — แจ้ง Owner เมื่อมีรายการรออนุมัติ</li>
          <li>📣 <strong>โปรโมชั่น</strong> — แจ้งลูกค้าโปรโมชั่นใหม่</li>
        </ul>
        <ImgPlaceholder icon="🔔" name="img-38-notifications.png" desc="หน้าแจ้งเตือน แสดงรายการ + Icon ตามประเภท + Mark as Read" />
      </Card>

      <Card>
        <CardTitle icon="⚙">ตั้งค่าการแจ้งเตือน</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">แต่ละคนตั้งค่าได้ในหน้า <strong>Profile</strong>:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>เปิด/ปิด PWA Push Notification</li>
          <li>เปิด/ปิด LINE Push Notification</li>
          <li>เลือกประเภทแจ้งเตือนที่ต้องการรับ</li>
        </ul>
        <ImgPlaceholder icon="⚙" name="img-39-notification-settings.png" desc="การตั้งค่าการแจ้งเตือนในหน้า Profile" />
      </Card>
    </>
  );
}
