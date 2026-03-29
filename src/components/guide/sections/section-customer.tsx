import { Card, CardTitle, Step, ImgPlaceholder } from '../manual-ui';

export function SectionCustomer() {
  return (
    <>
      <Card>
        <CardTitle icon="📱">การเข้าใช้งานของลูกค้า</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ลูกค้าเข้าถึงระบบผ่าน LINE Mini App (LIFF) โดยไม่ต้องสร้างบัญชี:</p>
        <Step num={1} title="เปิดลิงก์จาก LINE">
          <p>กดลิงก์ที่ส่งมาจากร้าน หรือจาก LINE Official Account</p>
        </Step>
        <Step num={2} title="ยืนยันตัวตนอัตโนมัติ">
          <p>ระบบตรวจสอบตัวตนจาก LINE Profile อัตโนมัติ</p>
        </Step>
        <Step num={3} title="ดูเหล้าที่ฝากไว้">
          <p>แสดงรายการฝากทั้งหมดพร้อมสถานะและวันหมดอายุ</p>
        </Step>
        <ImgPlaceholder icon="📱" name="img-23-customer-home.png" desc="หน้าหลักลูกค้า แสดงรายการเหล้าที่ฝาก (LINE Green Theme)" />
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
          <p>คำขอจะถูกส่งไปยังพนักงาน/หัวหน้าบาร์เพื่อยืนยัน</p>
        </Step>
        <ImgPlaceholder icon="🍷" name="img-24-customer-deposit-form.png" desc="ฟอร์มฝากเหล้าของลูกค้า (LINE LIFF)" />
      </Card>

      <Card>
        <CardTitle icon="📥">ขอเบิกเหล้า</CardTitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>เลือกรายการฝากที่ต้องการเบิก</li>
          <li>กดปุ่ม <strong>&quot;ขอเบิก&quot;</strong></li>
          <li>ระบบส่งคำขอไปยังพนักงาน</li>
          <li>เมื่อเบิกสำเร็จ จะได้รับแจ้งเตือนผ่าน LINE</li>
        </ul>
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
