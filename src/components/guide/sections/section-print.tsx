import { Card, CardTitle, Step, RolesBar, ImgPlaceholder } from '../manual-ui';

export function SectionPrint() {
  return (
    <Card>
      <RolesBar roles={['owner', 'manager']} />
      <CardTitle>Print Station</CardTitle>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ระบบพิมพ์ใบเสร็จแบบอัตโนมัติ:</p>
      <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
        <li><strong>รองรับ Thermal Printer 80mm</strong> — สำหรับใบฝากเหล้า</li>
        <li><strong>Print Queue</strong> — ระบบคิวพิมพ์อัตโนมัติ Real-time</li>
        <li><strong>Auto-print</strong> — พิมพ์อัตโนมัติเมื่อมีงานใหม่</li>
        <li><strong>PWA</strong> — ติดตั้งเป็น App บนเครื่องพิมพ์</li>
      </ul>

      <h4 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">ตั้งค่า Print Station (5 ขั้นตอน)</h4>
      <Step num={1} title="เลือกสาขา"><p>เลือกสาขาที่จะติดตั้ง Printer</p></Step>
      <Step num={2} title="ติดตั้ง PWA"><p>เพิ่มเว็บเป็น App บนเครื่อง</p></Step>
      <Step num={3} title="เชื่อมต่อ Printer"><p>เชื่อมต่อกับเครื่องพิมพ์ผ่าน LAN</p></Step>
      <Step num={4} title="ทดสอบพิมพ์"><p>พิมพ์ทดสอบเพื่อตรวจสอบ</p></Step>
      <Step num={5} title="พร้อมใช้งาน"><p>ดาวน์โหลด startup.bat (Windows) สำหรับเปิดอัตโนมัติ</p></Step>

      <ImgPlaceholder icon="🖨" name="img-43-print-station.png" desc="หน้า Print Station แสดง Print Queue + Printer Status" />
    </Card>
  );
}
