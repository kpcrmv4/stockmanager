import { Card, ImgPlaceholder, RoleTag, TableWrap, Th, Td } from '../manual-ui';

export function SectionProfile() {
  return (
    <Card>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ทุก Role สามารถเข้าถึงหน้าโปรไฟล์เพื่อ:</p>
      <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
        <li><strong>เปลี่ยนรูป Avatar</strong> — อัปโหลดรูปโปรไฟล์</li>
        <li><strong>แก้ไขชื่อที่แสดง</strong> — กด Edit แล้ว Save</li>
        <li><strong>ตั้งค่าแจ้งเตือน</strong> — เปิด/ปิด PWA Push, LINE Push + เลือกประเภท</li>
        <li><strong>ดู Role</strong> — แสดง Role ปัจจุบัน</li>
      </ul>
      <ImgPlaceholder icon="👤" name="img-44-profile.png" desc="หน้า Profile แสดง Avatar + Name + Notification Toggles" />
    </Card>
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
            ['แชท', C, C, C, C, C, C],
            ['เช็คสต๊อก', C, C, X, X, C, C],
            ['ฝาก/เบิกเหล้า', C, X, X, X, C, C],
            ['โอนสต๊อก', C, C, X, X, X, X],
            ['ยืมสินค้า', C, C, X, X, X, C],
            ['คลังกลาง', C, X, X, C, X, X],
            ['รายงาน', C, C, C, X, X, X],
            ['ค่าคอมมิชชั่น', C, C, C, X, X, X],
            ['ตรวจสอบกิจกรรม', C, X, X, X, X, X],
            ['วิเคราะห์ (4 หน้า)', C, X, X, X, X, X],
            ['ประกาศ/โปรโมชั่น', C, X, X, X, X, X],
            ['จัดการผู้ใช้', C, X, X, X, X, X],
            ['ตั้งค่า', C, X, X, X, X, X],
            ['อนุมัติ (Bar)', X, X, X, X, C, X],
            ['งานของฉัน', X, X, X, X, X, C],
            ['แจ้งเตือน', C, C, C, C, C, C],
            ['คู่มือ', C, C, C, C, C, C],
            ['โปรไฟล์', C, C, C, C, C, C],
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
