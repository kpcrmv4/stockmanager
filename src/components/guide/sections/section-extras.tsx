import { Card, Step, TipBox, ImgPlaceholder, RoleTag, TableWrap, Th, Td } from '../manual-ui';

export function SectionProfile() {
  return (
    <>
      <Card>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ทุก Role สามารถเข้าถึงหน้าโปรไฟล์เพื่อ:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>เปลี่ยนรูป Avatar</strong> — อัปโหลดรูปโปรไฟล์</li>
          <li><strong>แก้ไขชื่อที่แสดง</strong> — กด Edit แล้ว Save</li>
          <li><strong>ตั้งค่าแจ้งเตือน</strong> — เปิด/ปิด PWA Push, LINE Push + เลือกประเภท</li>
          <li><strong>ดู Role + ดูเวลา Login ล่าสุด</strong></li>
          <li><strong>เปลี่ยนรหัสผ่าน</strong> — User Menu (มุมขวาบน) → &quot;เปลี่ยนรหัสผ่าน&quot; → <code>/settings/account</code></li>
        </ul>
        <ImgPlaceholder icon="👤" name="img-44-profile.png" desc="หน้า Profile แสดง Avatar + Name + Notification Toggles" />
      </Card>

      <Card>
        <h4 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">เปลี่ยนรหัสผ่านด้วยตัวเอง</h4>
        <Step num={1} title="เปิด /settings/account">
          <p>คลิก User Menu (มุมขวาบน) → &quot;เปลี่ยนรหัสผ่าน&quot; หรือพิมพ์ URL ตรงๆ</p>
        </Step>
        <Step num={2} title="กรอกรหัสปัจจุบัน">
          <p>เพื่อยืนยันตัวตน — ระบบเช็คโดยพยายาม sign in ด้วยรหัสนั้น</p>
        </Step>
        <Step num={3} title="กรอกรหัสใหม่ + ยืนยัน">
          <p>อย่างน้อย 6 ตัวอักษร และต้องไม่ตรงกับรหัสเดิม</p>
        </Step>
        <Step num={4} title="บันทึก">
          <p>ระบบอัปเดต + ปลด banner &quot;รหัสยังเป็นค่าเริ่มต้น&quot; (ถ้ามี)</p>
        </Step>
        <TipBox>
          <strong>⚠️ Banner เตือน:</strong> ถ้า Owner/Manager เพิ่ง reset รหัสผ่านให้คุณเป็น <code>123456</code>, จะเห็น banner สีเหลืองทุกหน้าจนกว่าจะเปลี่ยนรหัสด้วยตัวเอง
        </TipBox>
      </Card>
    </>
  );
}

export function SectionTheme() {
  return (
    <Card>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">สลับระหว่างโหมดมืดและสว่างได้ตลอดเวลา:</p>
      <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
        <li><strong>Desktop</strong> — กดไอคอน ☽/☀ ที่ด้านล่าง Sidebar</li>
        <li><strong>Mobile</strong> — เปิด Drawer Menu แล้วกดปุ่ม Toggle</li>
      </ul>
      <ImgPlaceholder icon="🎨" name="img-45-dark-light-mode.png" desc="เปรียบเทียบ Dark Mode vs Light Mode" />
    </Card>
  );
}

export function SectionSummary() {
  const C = '✅';
  const X = '—';
  return (
    <Card>
      <TableWrap>
        <thead>
          <tr>
            <Th>เมนู</Th>
            <Th className="text-center"><RoleTag role="owner" /></Th>
            <Th className="text-center"><RoleTag role="manager" label="Mgr" /></Th>
            <Th className="text-center"><RoleTag role="accountant" label="Acct" /></Th>
            <Th className="text-center"><RoleTag role="hq" /></Th>
            <Th className="text-center"><RoleTag role="bar" /></Th>
            <Th className="text-center"><RoleTag role="staff" /></Th>
          </tr>
        </thead>
        <tbody>
          {[
            ['ภาพรวม', C, C, C, C, X, X],
            ['แชท (หน้าแรก bar/staff)', C, C, C, C, C, C],
            ['เช็คสต๊อก', C, C, X, X, C, X],
            ['ฝาก/เบิกเหล้า', C, C, X, X, C, C],
            ['โอนสต๊อก', C, C, X, X, C, X],
            ['ยืมสินค้า', C, C, X, X, C, X],
            ['คลังกลาง', C, X, X, C, X, X],
            ['รายงาน', C, C, C, C, X, X],
            ['ค่าคอมมิชชั่น', C, C, C, X, X, X],
            ['ตรวจสอบกิจกรรม', C, X, X, X, X, X],
            ['วิเคราะห์ (4 หน้า)', C, X, X, X, X, X],
            ['ประกาศภายใน', C, X, X, X, X, X],
            ['จัดการผู้ใช้', C, C, X, X, X, X],
            ['ลิงก์เชิญพนักงาน', C, C, X, X, X, X],
            ['ตั้งค่าสาขา', C, C, X, X, X, X],
            ['สถานะเครื่องพิมพ์ (topbar)', C, C, X, X, C, C],
            ['แจ้งเตือน', C, C, C, C, C, C],
            ['คู่มือ', C, C, C, C, C, C],
            ['โปรไฟล์ + เปลี่ยนรหัสผ่าน', C, C, C, C, C, C],
          ].map(([menu, ...cols], i) => (
            <tr key={i}>
              <Td>{menu}</Td>
              {cols.map((v, j) => (
                <Td key={j} className="text-center">{v}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Card>
  );
}
