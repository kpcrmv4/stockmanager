import { Card, CardTitle, RolesBar, ImgPlaceholder, Step, TipBox } from '../manual-ui';

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
        <ImgPlaceholder icon="⚙" name="img-40-settings-main.png" desc="หน้าตั้งค่าหลัก แสดงรายชื่อสาขา" />
      </Card>

      <Card>
        <RolesBar roles={['owner', 'manager']} />
        <CardTitle>ตั้งค่าสาขา (Per-Store)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">กดที่ชื่อสาขาเพื่อตั้งค่ารายละเอียด:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ข้อมูลสาขา</strong> — ชื่อ, รหัส, สถานะ active</li>
          <li><strong>LINE Configuration</strong> — Channel Token, Channel ID, Channel Secret, Bot User ID</li>
          <li><strong>กลุ่ม LINE แจ้งเตือน</strong> — ID กลุ่มสำหรับ: สต๊อก, ฝาก, บาร์ (ดึง ID ง่ายๆ ด้วยคำสั่ง <code>groupid</code> — ดูการ์ดถัดไป)</li>
          <li><strong>การแจ้งเตือนลูกค้า</strong> — เปิด/ปิดแจ้งเตือนหมดอายุ, จำนวนวันก่อนหมดอายุ</li>
          <li><strong>เครื่องพิมพ์</strong> — Setup Print Server ดาวน์โหลด ZIP, ตั้งเวลาทำการ, ชื่อเครื่องพิมพ์</li>
          <li><strong>ใบเสร็จ</strong> — โลโก้, header, footer, ขนาดกระดาษ, จำนวนสำเนา, แสดง QR เพิ่มเพื่อน LINE</li>
        </ul>
        <TipBox>
          <strong>📌 หมายเหตุ:</strong> ตอนสร้างสาขาใหม่ <strong>ไม่ต้อง</strong>ระบุ LINE Group ID ทันที — ตั้งภายหลังในหน้า Per-Store ได้
        </TipBox>
        <ImgPlaceholder icon="🏢" name="img-41-settings-store.png" desc="หน้าตั้งค่าสาขา" />
      </Card>

      <Card>
        <CardTitle icon="🆔">ดึง LINE Group ID ด้วยคำสั่ง <code>groupid</code></CardTitle>
        <RolesBar roles={['owner', 'manager']} />
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          วิธีที่ง่ายที่สุดในการเอา LINE Group ID มากรอกในหน้าตั้งค่าสาขา — ไม่ต้องใช้ developer tool หรือ LINE API:
        </p>
        <Step num={1} title="เชิญ bot ของสาขาเข้ากลุ่ม LINE">
          <p>ใช้ LINE bot ของสาขาที่ตั้งค่า Channel Token ไว้ (per-store bot) เชิญเข้ากลุ่มพนักงานสาขานั้น</p>
        </Step>
        <Step num={2} title='พิมพ์ "groupid" ในกลุ่ม'>
          <p>พิมพ์คำใดคำหนึ่งต่อไปนี้: <code>groupid</code> · <code>group id</code> · <code>/groupid</code> · <code>id กลุ่ม</code> · <code>กลุ่ม id</code> · <code>ขอ group id</code></p>
        </Step>
        <Step num={3} title="bot ตอบกลับด้วย Flex card + plain text">
          <p>bot จะส่ง 2 ข้อความ: (1) Flex card สีเขียวแสดง Group ID และ (2) ข้อความ plain text ที่มีเฉพาะ ID — <strong>แตะค้างที่ข้อความ plain text เพื่อคัดลอกได้ทันที</strong></p>
        </Step>
        <Step num={4} title="นำไปใส่ในหน้าตั้งค่าสาขา">
          <p>วาง Group ID ลงใน field: <strong>Stock Notify</strong>, <strong>Deposit Notify</strong>, หรือ <strong>Bar Notify</strong> แล้วกดบันทึก</p>
        </Step>
        <TipBox>
          หนึ่งกลุ่มมี Group ID เดียว ถ้าจะใช้กลุ่มเดียวสำหรับทุกประเภทแจ้งเตือน วาง ID เดียวกันได้ในทั้ง 3 field
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="📣">ประกาศภายในพนักงาน</CardTitle>
        <RolesBar roles={['owner']} />
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">สร้างและจัดการประกาศสำหรับพนักงาน — <strong>ลูกค้าใช้ LIFF แยก ไม่เห็นประกาศนี้</strong>:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ประเภท</strong> — Promotion, Announcement, Event</li>
          <li><strong>กำหนดสาขา</strong> — เลือกแสดงเฉพาะสาขา หรือทุกสาขา</li>
          <li><strong>รูปภาพ</strong> — แนบรูปประกอบได้</li>
          <li><strong>กำหนดเวลา</strong> — ตั้งวันเริ่มต้น/สิ้นสุดได้</li>
          <li><strong>Push Notification</strong> — เลือกส่ง push ทันทีหรือไม่</li>
        </ul>
        <ImgPlaceholder icon="📣" name="img-42-announcements.png" desc="หน้าจัดการประกาศ" />
      </Card>

      <Card>
        <CardTitle icon="🔑">บัญชีของฉัน (เปลี่ยนรหัสผ่าน)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          ทุก Role เปลี่ยนรหัสผ่านของตัวเองได้ที่ <code>/settings/account</code> หรือผ่าน User Menu (มุมขวาบน) → &quot;เปลี่ยนรหัสผ่าน&quot;
        </p>
        <Step num={1} title="กรอกรหัสผ่านปัจจุบัน">
          <p>เพื่อยืนยันตัวตน — ระบบจะตรวจสอบว่ารหัสตรง</p>
        </Step>
        <Step num={2} title="ตั้งรหัสใหม่">
          <p>อย่างน้อย 6 ตัวอักษร และต้องไม่ตรงกับรหัสเดิม</p>
        </Step>
        <Step num={3} title="บันทึก">
          <p>ระบบอัปเดตทันที + ปลด banner &quot;รหัสคุณยังเป็นค่าเริ่มต้น&quot; (ถ้ามี)</p>
        </Step>
      </Card>
    </>
  );
}
