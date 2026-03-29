import { Card, CardTitle, RolesBar, TableWrap, Th, Td, ImgPlaceholder } from '../manual-ui';

export function SectionReports() {
  return (
    <Card>
      <RolesBar roles={['owner', 'accountant', 'manager']} />
      <CardTitle>หน้ารายงาน</CardTitle>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">รายงานแบ่งเป็น 5 Tabs:</p>
      <TableWrap>
        <thead>
          <tr><Th>Tab</Th><Th>เนื้อหา</Th></tr>
        </thead>
        <tbody>
          <tr><Td><strong>Overview</strong></Td><Td>KPI Cards + Trend Charts (ฝาก, เบิก, สต๊อก)</Td></tr>
          <tr><Td><strong>Customers</strong></Td><Td>ข้อมูลลูกค้า, ยอดฝาก/เบิก, ความถี่</Td></tr>
          <tr><Td><strong>Operations</strong></Td><Td>ประสิทธิภาพการดำเนินงาน, เวลาเฉลี่ย</Td></tr>
          <tr><Td><strong>Staff</strong></Td><Td>ผลงานพนักงาน, งานสำเร็จ, timeout rate</Td></tr>
          <tr><Td><strong>Stores</strong></Td><Td>เปรียบเทียบสาขา, KPI ข้ามสาขา</Td></tr>
        </tbody>
      </TableWrap>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ฟีเจอร์เพิ่มเติม:</p>
      <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
        <li>เลือกช่วงวันที่</li>
        <li>เลือกสาขา (หรือดูทุกสาขา)</li>
        <li>กราฟ Area, Bar, Line (Recharts)</li>
        <li>Export เป็น CSV/PDF</li>
      </ul>
      <ImgPlaceholder icon="📊" name="img-37-reports.png" desc="หน้ารายงาน แสดง Multi-tab + KPI Cards + Charts" />
    </Card>
  );
}
