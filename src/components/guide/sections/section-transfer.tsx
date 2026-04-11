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
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">ยืมสินค้าระหว่างสาขาเมื่อสินค้าไม่พอ — โฟลว์ 3 ขั้น ถ่ายรูปของแล้วบันทึกคือจบ:</p>

        <div className="mb-3 rounded-lg bg-teal-50 p-3 text-xs dark:bg-teal-900/20">
          <p className="font-semibold text-teal-700 dark:text-teal-400 mb-1">📋 สถานะทั้ง 3 ขั้น</p>
          <p className="text-gray-600 dark:text-gray-300">
            <strong>1. รออนุมัติ</strong> → <strong>2. รอรับสินค้า</strong> → <strong>3. เสร็จสมบูรณ์</strong>
          </p>
        </div>

        <p className="mb-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">👤 ฝั่งผู้ขอยืม (Borrower)</p>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>สร้างคำขอยืม</strong> — เลือกสาขาปลายทาง + รายการสินค้า (ระบบ suggest ชื่อสินค้าจากสาขาปลายทางให้)</li>
          <li><strong>รออนุมัติ</strong> — ระหว่างรอ กดยกเลิกคำขอได้</li>
          <li><strong>หลังได้รับอนุมัติ</strong> — ไปรับของ → <strong>ถ่ายรูปสินค้าที่ได้รับ</strong> → กด &ldquo;ยืนยันรับสินค้า&rdquo; → <strong>จบทันที</strong></li>
        </ul>

        <p className="mb-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">🏪 ฝั่งผู้ให้ยืม (Lender)</p>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>รับแจ้งเตือน</strong> 3 ทาง: ในแอป, LINE กลุ่ม, แชทในแอป</li>
          <li><strong>ตรวจสอบคำขอ</strong> — เปิดแท็บ &ldquo;ขาเข้า&rdquo; → ดูรายละเอียด</li>
          <li><strong>ถ่ายรูปสินค้า + ปรับจำนวนอนุมัติ</strong> (ถ้าของไม่พอ ลดได้เช่นขอ 10 ให้ 7) → กด &ldquo;อนุมัติ&rdquo; → <strong>จบฝั่งตัวเอง</strong></li>
          <li><strong>หรือปฏิเสธ</strong> — ใส่เหตุผล → กดปฏิเสธ</li>
        </ul>

        <div className="rounded-lg bg-amber-50 p-3 text-xs dark:bg-amber-900/20">
          <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">💡 จุดสำคัญ</p>
          <ul className="ml-4 list-disc space-y-0.5 text-gray-600 dark:text-gray-300">
            <li>ไม่ต้องตัด POS แนบบิล — แค่ถ่ายรูปของก็จบ</li>
            <li>Lender เสร็จงานฝั่งตัวเองทันทีเมื่อกด &ldquo;อนุมัติ&rdquo;</li>
            <li>Borrower เป็นคนทำให้สถานะเป็น &ldquo;เสร็จสมบูรณ์&rdquo; เมื่อกด &ldquo;ยืนยันรับสินค้า&rdquo;</li>
            <li>ยกเลิกได้เฉพาะตอน &ldquo;รออนุมัติ&rdquo; เท่านั้น</li>
          </ul>
        </div>

        <div className="mt-3">
          <ImgPlaceholder icon="🔄" name="img-36-borrow.png" desc="หน้ายืมสินค้า แสดงโฟลว์ 3 ขั้น: ส่งคำขอ → อนุมัติ → เสร็จ" />
        </div>
      </Card>
    </>
  );
}
