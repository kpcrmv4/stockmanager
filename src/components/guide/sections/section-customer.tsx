import { Card, CardTitle, Step, ImgPlaceholder, TipBox, WarnBox } from '../manual-ui';

export function SectionCustomer() {
  return (
    <>
      <Card>
        <CardTitle icon="📱">การเข้าใช้งานของลูกค้า</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ลูกค้าเข้าถึงระบบผ่าน LINE Mini App (LIFF) โดยไม่ต้องสร้างบัญชี:</p>
        <Step num={1} title="เปิดลิงก์จาก LINE">
          <p>กดลิงก์ Rich Menu หรือลิงก์ที่ส่งจาก LINE Official Account ของสาขา — ระบบจะแนบรหัสสาขา (<code>?store=CODE</code>) มาในลิงก์อัตโนมัติ เพื่อให้หน้าเว็บรู้ว่าลูกค้ามาจากสาขาไหน</p>
        </Step>
        <Step num={2} title="ยืนยันตัวตนอัตโนมัติ">
          <p>ระบบตรวจสอบตัวตนจาก LINE Profile (LIFF) อัตโนมัติ ไม่ต้อง login</p>
        </Step>
        <Step num={3} title="ดูเหล้าที่ฝากไว้ (เฉพาะสาขาที่ทักมา)">
          <p>แสดงเฉพาะรายการฝากของสาขาที่ลูกค้าทักเข้ามาเท่านั้น ไม่ปนกับสาขาอื่น แม้ลูกค้าจะฝากไว้หลายสาขา</p>
        </Step>
        <ImgPlaceholder icon="📱" name="img-23-customer-home.png" desc="หน้าหลักลูกค้า LIFF (ธีมไวน์-ทองเข้ม) แสดงรายการเหล้าที่ฝาก" />
      </Card>

      <Card>
        <CardTitle icon="🎨">ดีไซน์หน้าลูกค้า (LIFF)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">หน้าลูกค้าถูกออกแบบให้เข้ากับ viewport ของ LINE LIFF พร้อมธีม premium:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ธีมไวน์-ทอง</strong> — พื้นหลังสีไวน์เข้ม + accent สีทอง (#F8D794) พร้อม ambient orbs เบลอๆ</li>
          <li><strong>Header</strong> — โลโก้ Wine icon + &quot;Bottle Keeper&quot; + ชื่อสาขาที่ลูกค้าทักเข้ามา</li>
          <li><strong>การ์ดฝาก</strong> — แสดง % เหลือ, จำนวนขวด, วันหมดอายุ (สีแดง/ส้ม/ทอง ตามระยะเวลา)</li>
          <li><strong>Section &quot;รอยืนยัน&quot;</strong> — แสดงรายการที่ส่งคำขอฝากแล้วแต่พนักงานยังไม่ยืนยัน</li>
          <li><strong>Section &quot;My Bottles&quot;</strong> — รายการที่ฝากในร้านแล้ว มีช่องค้นหาด้วยรหัส/ชื่อสินค้า</li>
          <li><strong>Bottom Nav</strong> — glass-morphism dark theme, font เล็กเหมาะกับ LIFF viewport</li>
        </ul>
        <TipBox>
          หากลูกค้ามีการฝากในหลายสาขา จะต้องเปิดลิงก์ของแต่ละสาขาแยกกัน — ระบบจะแสดงเฉพาะรายการของสาขาที่ลิงก์ระบุ เพื่อความชัดเจนและป้องกันการสับสน
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="🍷">ฝากเหล้าใหม่</CardTitle>
        <Step num={1} title='กดปุ่ม "ฝากเหล้า"'>
          <p>ระบบแสดงฟอร์มฝากเหล้า</p>
        </Step>
        <Step num={2} title="กรอกข้อมูล">
          <p>ชื่อลูกค้า, เบอร์โทร, หมายเลขโต๊ะ, โน้ต + ถ่ายรูปขวด (ถ้าต้องการ)</p>
        </Step>
        <Step num={3} title="ส่งคำขอ">
          <p>คำขอจะถูกส่งไปยังพนักงาน/บาร์เพื่อยืนยัน</p>
        </Step>
        <ImgPlaceholder icon="🍷" name="img-24-customer-deposit-form.png" desc="ฟอร์มฝากเหล้าของลูกค้า (LINE LIFF)" />
      </Card>

      <Card>
        <CardTitle icon="📥">ขอเบิกเหล้า</CardTitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>เลือกรายการฝากในหน้า <strong>My Bottles</strong></li>
          <li>กดปุ่ม <strong>&quot;ขอเบิก&quot;</strong> ในการ์ดของรายการนั้น</li>
          <li>สถานะเปลี่ยนเป็น <strong>&quot;รอเบิก&quot;</strong> (pending withdrawal) ทันที</li>
          <li>คำขอถูกส่งเป็น Action Card เข้าแชทสาขา ให้พนักงานรับงาน</li>
          <li>เมื่อพนักงานเบิกให้แล้ว ลูกค้าจะได้รับแจ้งเตือนผ่าน LINE Push Message</li>
        </ul>
        <WarnBox>
          รายการที่หมดอายุจะแสดงปุ่มสีแดง &quot;หมดอายุ&quot; และเบิกไม่ได้ ต้องติดต่อพนักงานที่ร้านโดยตรง
        </WarnBox>
        <ImgPlaceholder icon="📥" name="img-25-customer-withdrawal.png" desc="หน้าขอเบิกเหล้า + สถานะ Pending" />
      </Card>

      <Card>
        <CardTitle icon="📰">เมนูอื่นๆ ของลูกค้า</CardTitle>
        <ul className="ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ประวัติ</strong> — ดูประวัติฝาก/เบิกทั้งหมด</li>
          <li><strong>โปรโมชั่น</strong> — ดูโปรโมชั่นจากร้าน</li>
          <li><strong>ตั้งค่า</strong> — ตั้งค่าการแจ้งเตือน</li>
        </ul>
      </Card>
    </>
  );
}
