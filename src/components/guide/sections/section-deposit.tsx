import { Card, CardTitle, CardSubtitle, Step, RolesBar, TableWrap, Th, Td, TipBox, ImgPlaceholder } from '../manual-ui';

export function SectionDeposit() {
  return (
    <>
      <Card>
        <RolesBar roles={['owner', 'manager', 'bar', 'staff']} />
        <CardTitle>หน้าหลักฝาก/เบิก</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">หน้าจอหลักแสดง:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Summary Cards</strong> — ฝากอยู่ในร้าน, รอยืนยัน, หมดอายุ, คำขอเบิก</li>
          <li><strong>Tabs</strong> — ทั้งหมด | ในร้าน | รอยืนยัน | หมดอายุ | รอนำส่ง HQ | VIP</li>
          <li><strong>Batch Transfer</strong> — ในแท็บ &quot;หมดอายุ&quot; มี checkbox เลือกหลายรายการ + ปุ่ม &quot;โอนคลังกลาง (N)&quot;</li>
          <li><strong>ค้นหา</strong> — ค้นหาด้วยรหัส/ชื่อลูกค้า/ชื่อสินค้า</li>
          <li><strong>ตัวกรองวันที่</strong> — เลือกช่วงวันที่ (default: เมื่อวาน-วันนี้)</li>
        </ul>
        <ImgPlaceholder icon="🍷" name="img-26-deposit-main.png" desc="หน้าหลักฝาก/เบิก แสดง Summary + Tab Filter + Table/Cards" />
      </Card>

      <Card>
        <CardTitle icon="📋">รายละเอียดรายการฝาก (Deposit Detail)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">กดที่รายการฝากเพื่อเข้าดูรายละเอียด จะเห็น:</p>

        <CardSubtitle>สถานะการฝาก (Timeline)</CardSubtitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">แสดง 2 เส้นทางหลัก:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>เส้นทางปกติ:</strong> รอยืนยัน → อยู่ในร้าน → รอเบิก → เบิกแล้ว</li>
          <li><strong>เส้นทางหมดอายุ:</strong> <span className="text-rose-500">หมดอายุ</span> → <span className="text-amber-500">รอนำส่ง HQ</span> → <span className="text-blue-500">โอนคลังกลางแล้ว</span></li>
        </ul>

        <CardSubtitle>การ์ด &quot;การดำเนินการ&quot; (ปุ่มแสดงตามสถานะ)</CardSubtitle>
        <TableWrap>
          <thead>
            <tr><Th>สถานะ</Th><Th>ปุ่มที่แสดง</Th></tr>
          </thead>
          <tbody>
            <tr><Td><span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">รอยืนยัน</span></Td><Td>ยืนยันรับเข้าระบบ, ปฏิเสธรับฝาก (ต้องระบุเหตุผล), เปลี่ยน VIP, ทำเครื่องหมายหมดอายุ</Td></tr>
            <tr><Td><span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">อยู่ในร้าน</span></Td><Td>เบิกเหล้า, เปลี่ยน VIP, ขยายวันหมดอายุ, ทำเครื่องหมายหมดอายุ</Td></tr>
            <tr><Td><span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900 dark:text-rose-300">หมดอายุ</span></Td><Td>โอนคลังกลาง (บังคับถ่ายรูป, ส่ง Action Card ไป HQ chat)</Td></tr>
          </tbody>
        </TableWrap>

        <CardSubtitle>Flow โอนคลังกลาง (จากรายละเอียดรายการ)</CardSubtitle>
        <Step num={1} title='กด "โอนคลังกลาง"'>
          <p>เปิดหน้าต่างยืนยัน แสดงข้อมูลสินค้า (ชื่อ, ลูกค้า, คงเหลือ, รหัสฝาก)</p>
        </Step>
        <Step num={2} title="ถ่ายรูปสินค้า (บังคับ)">
          <p>ต้องถ่ายรูปก่อนจึงจะกดยืนยันได้ + ใส่หมายเหตุ (ไม่บังคับ)</p>
        </Step>
        <Step num={3} title='กด "ยืนยันโอนคลังกลาง"'>
          <p>ระบบสร้าง Transfer record, เปลี่ยนสถานะเป็น &quot;รอนำส่ง HQ&quot;, ส่งข้อความแจ้งเตือนในแชทสาขา + ส่ง Transfer Action Card ไปแชท HQ</p>
        </Step>
        <Step num={4} title="HQ ยืนยันรับ หรือ ปฏิเสธ">
          <p>เมื่อ HQ รับ → สถานะเปลี่ยนเป็น &quot;โอนคลังกลางแล้ว&quot; — ถ้า HQ ปฏิเสธ → กลับเป็น &quot;หมดอายุ&quot;</p>
        </Step>
      </Card>

      <Card>
        <CardTitle icon="🔄">ขั้นตอนการฝากเหล้า (Full Flow)</CardTitle>
        <TableWrap>
          <thead>
            <tr><Th>ขั้นตอน</Th><Th>ผู้ดำเนินการ</Th><Th>รายละเอียด</Th></tr>
          </thead>
          <tbody>
            <tr><Td>1. ลูกค้าขอฝาก</Td><Td>Customer (LIFF)</Td><Td>กรอกฟอร์มผ่าน LINE LIFF — สถานะเริ่มต้น <code>pending_staff</code></Td></tr>
            <tr><Td>2. Staff ตรวจรับ</Td><Td>Staff</Td><Td>เลือกสินค้า + จำนวนขวด + กด &quot;รับ&quot; → สถานะ <code>pending_confirm</code> (รอ Bar)</Td></tr>
            <tr><Td>3. Bar ยืนยัน</Td><Td>Bar</Td><Td>รับ Action Card ในแชท → ถ่ายรูปขวด + confirm → สถานะ <code>in_store</code></Td></tr>
            <tr><Td>4. แจ้งลูกค้า</Td><Td>ระบบ</Td><Td>Bot ส่งใบเสร็จ + รหัสฝากกลับให้ลูกค้าทาง LINE</Td></tr>
            <tr><Td>5. ลูกค้าขอเบิก</Td><Td>Customer (LIFF)</Td><Td>เลือกขวดที่จะเบิก (ระบบ track per-bottle) → ส่ง Action Card หา Bar</Td></tr>
            <tr><Td>6. Bar เบิก</Td><Td>Bar</Td><Td>รับ Action Card → ส่งเหล้า + ยืนยัน → ขวดที่เบิกถูกมาร์ค <code>consumed</code></Td></tr>
            <tr><Td>7. แจ้งลูกค้า</Td><Td>ระบบ</Td><Td>LINE แจ้งว่าเบิกเสร็จแล้ว</Td></tr>
          </tbody>
        </TableWrap>
        <TipBox>
          <strong>🍾 Multi-bottle:</strong> ฝาก 1 รายการอาจมีหลายขวด — ระบบ track สถานะแต่ละขวดแยก (sealed/opened/consumed). ลูกค้าทยอยเบิกได้ทีละขวด
        </TipBox>
        <TipBox>
          <strong>🚫 Cancelled:</strong> ถ้า Bar ปฏิเสธรับ (เช่น ขวดไม่ตรงกับที่บันทึก) → สถานะ <code>cancelled</code> + ระบุเหตุผล + แจ้งลูกค้า
        </TipBox>
        <ImgPlaceholder icon="🔄" name="img-27-deposit-flow-diagram.png" desc="Diagram แสดง Flow การฝาก/เบิก" />
      </Card>

      <Card>
        <CardTitle icon="📄">ใบเสร็จฝากเหล้า</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">เมื่อยืนยันฝากแล้ว ระบบจะสร้างใบเสร็จ (Receipt) ที่พิมพ์ได้:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>รหัสฝาก (DEP-XXXXXX) + QR Code</li>
          <li>ชื่อลูกค้า + เบอร์โทร</li>
          <li>ชื่อสินค้า + จำนวน</li>
          <li>วันฝาก + วันหมดอายุ</li>
          <li>ชื่อร้าน</li>
        </ul>
        <ImgPlaceholder icon="📄" name="img-28-deposit-receipt.png" desc="ตัวอย่างใบเสร็จฝากเหล้า (80mm thermal printer)" />
      </Card>
    </>
  );
}
