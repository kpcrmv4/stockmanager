import { Card, CardTitle, RolesBar, ImgPlaceholder } from '../manual-ui';

export function SectionTransfer() {
  return (
    <>
      <Card>
        <RolesBar roles={['owner', 'manager']} />
        <CardTitle icon="↔">โอนสต๊อก (Transfer)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ใช้สำหรับโอนเหล้าที่หมดอายุหรือต้องการส่งไปคลังกลาง:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>รายการหมดอายุ</strong> — แสดงจำนวนวันที่เกินกำหนด</li>
          <li><strong>ตัวกรอง</strong> — ทั้งหมด | ไม่มีคนฝาก | หมดอายุปกติ</li>
          <li><strong>สร้าง Transfer Batch</strong> — รวมหลายรายการเป็นชุดเดียว</li>
          <li><strong>ถ่ายรูปเอกสาร</strong> — แนบรูปหลักฐานการโอน</li>
          <li><strong>สถานะ</strong> — Pending → Confirmed → Withdrawn</li>
        </ul>
        <ImgPlaceholder icon="↔" name="img-35-transfer.png" desc="หน้าโอนสต๊อก แสดงรายการหมดอายุ + Transfer Batches" />
      </Card>

      <Card>
        <RolesBar roles={['owner', 'manager', 'staff']} />
        <CardTitle icon="🔄">ยืมสินค้า (Borrow)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ยืมสินค้าระหว่างสาขาเมื่อสินค้าไม่พอ:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>สร้างคำขอยืม</strong> — เลือกสาขาต้นทาง/ปลายทาง + รายการสินค้า</li>
          <li><strong>อนุมัติ</strong> — Manager สาขาปลายทางอนุมัติ/ปฏิเสธ</li>
          <li><strong>ปรับ POS</strong> — ทั้ง 2 สาขายืนยันปรับข้อมูล POS</li>
          <li><strong>ถ่ายรูป</strong> — หลักฐานการรับ/ส่ง</li>
          <li><strong>สถานะ</strong> — Pending → Approved → POS Adjusting → Completed</li>
        </ul>
        <ImgPlaceholder icon="🔄" name="img-36-borrow.png" desc="หน้ายืมสินค้า แสดง Request Form + Status Pipeline" />
      </Card>
    </>
  );
}
