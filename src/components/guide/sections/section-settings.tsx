import { Card, CardTitle, RolesBar, ImgPlaceholder } from '../manual-ui';

export function SectionSettings() {
  return (
    <>
      <Card>
        <RolesBar roles={['owner']} />
        <CardTitle>หน้าตั้งค่าหลัก</CardTitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>รายชื่อสาขา</strong> — ดูสาขาทั้งหมด พร้อมรหัสสาขา</li>
          <li><strong>เพิ่มสาขาใหม่</strong> — กดปุ่ม + สร้างสาขา</li>
          <li><strong>Import Deposits</strong> — นำเข้าข้อมูลฝากจาก CSV</li>
        </ul>
        <ImgPlaceholder icon="⚙" name="img-40-settings-main.png" desc="หน้าตั้งค่าหลัก แสดงรายชื่อสาขา + ปุ่มเพิ่มสาขา" />
      </Card>

      <Card>
        <CardTitle>ตั้งค่าสาขา (Per-Store)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">กดที่ชื่อสาขาเพื่อตั้งค่ารายละเอียด:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ข้อมูลสาขา</strong> — ชื่อ, รหัส, สถานะ active</li>
          <li><strong>LINE Configuration</strong> — Channel Token, Channel ID, Channel Secret</li>
          <li><strong>กลุ่ม LINE แจ้งเตือน</strong> — ID กลุ่มสำหรับ: สต๊อก, ฝาก, บาร์</li>
          <li><strong>การแจ้งเตือนลูกค้า</strong> — เปิด/ปิดแจ้งเตือนหมดอายุ, วันก่อนหมดอายุ</li>
          <li><strong>รหัสลงทะเบียนพนักงาน</strong> — Code สำหรับพนักงานใหม่</li>
        </ul>
        <ImgPlaceholder icon="🏢" name="img-41-settings-store.png" desc="หน้าตั้งค่าสาขา แสดง LINE Config + Notification Settings" />
      </Card>

      <Card>
        <CardTitle icon="📣">ประกาศ/โปรโมชั่น</CardTitle>
        <RolesBar roles={['owner']} />
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">สร้างและจัดการประกาศถึงลูกค้าและพนักงาน:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ประเภท</strong> — Promotion, Announcement, Event</li>
          <li><strong>กลุ่มเป้าหมาย</strong> — ลูกค้า, พนักงาน, หรือทั้งหมด</li>
          <li><strong>รูปภาพ</strong> — แนบรูปประกอบได้</li>
          <li><strong>กำหนดเวลา</strong> — ตั้งวันเริ่มต้น/สิ้นสุดได้</li>
          <li><strong>Push Notification</strong> — เลือกส่ง push ทันทีหรือไม่</li>
        </ul>
        <ImgPlaceholder icon="📣" name="img-42-announcements.png" desc="หน้าจัดการประกาศ แสดง List + Create/Edit Form" />
      </Card>
    </>
  );
}
