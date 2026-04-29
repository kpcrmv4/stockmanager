import { Card, TipBox, RoleTag, TableWrap, Th, Td } from '../manual-ui';

export function SectionRoles() {
  return (
    <Card>
      <TableWrap>
        <thead>
          <tr>
            <Th>Role</Th>
            <Th>ชื่อภาษาไทย</Th>
            <Th>Layout</Th>
            <Th>หน้าแรกเมื่อ Login</Th>
            <Th>สิทธิ์หลัก</Th>
          </tr>
        </thead>
        <tbody>
          <tr><Td><RoleTag role="owner" /></Td><Td>เจ้าของร้าน</Td><Td>Desktop</Td><Td>/overview</Td><Td>ทุกสิทธิ์ ดูข้ามสาขา</Td></tr>
          <tr><Td><RoleTag role="accountant" /></Td><Td>บัญชี</Td><Td>Desktop</Td><Td>/reports</Td><Td>ดูข้ามสาขา รายงาน + คอมมิชชั่น</Td></tr>
          <tr><Td><RoleTag role="manager" /></Td><Td>คนคุมร้าน</Td><Td>Desktop</Td><Td>/store-overview</Td><Td>ใช้ได้ทุกเมนู (เฉพาะในสาขา)</Td></tr>
          <tr><Td><RoleTag role="hq" /></Td><Td>คลังกลาง</Td><Td>Desktop</Td><Td>/hq-warehouse</Td><Td>โอนสต๊อก, ดูรายงาน</Td></tr>
          <tr><Td><RoleTag role="bar" /></Td><Td>บาร์</Td><Td>Mobile</Td><Td>/chat</Td><Td>นับสต๊อก, ฝาก, ยืม, เบิก, โอน, แชท</Td></tr>
          <tr><Td><RoleTag role="staff" /></Td><Td>พนักงาน</Td><Td>Mobile</Td><Td>/chat</Td><Td>ฝากเหล้า, เบิกเหล้า, แชท</Td></tr>
        </tbody>
      </TableWrap>
      <TipBox>
        <strong>💡 หมายเหตุ:</strong> Owner, Accountant และ HQ สามารถเข้าถึงข้อมูลทุกสาขาได้ ส่วน Manager, Bar, Staff จะเห็นเฉพาะสาขาที่ตนเองสังกัด — Customer ไม่ได้ใช้แดชบอร์ดนี้ ใช้งานผ่าน LINE LIFF อย่างเดียว
      </TipBox>
    </Card>
  );
}
