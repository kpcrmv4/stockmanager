import { Card, CardTitle, Step, RolesBar, RoleTag, ImgPlaceholder } from '../manual-ui';

export function SectionStock() {
  return (
    <>
      <Card>
        <RolesBar roles={['owner', 'manager', 'bar', 'staff']} />
        <CardTitle>หน้าหลักเช็คสต๊อก</CardTitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>สรุป</strong> — จำนวนสินค้าทั้งหมด, วันที่เช็คล่าสุด, รอชี้แจง, รออนุมัติ</li>
          <li><strong>สถานะวันนี้</strong> — ความคืบหน้าการนับ, POS, เปรียบเทียบ</li>
          <li><strong>Quick Actions</strong> — ปุ่มลัดไปทำงานต่างๆ</li>
        </ul>
        <ImgPlaceholder icon="📋" name="img-29-stock-main.png" desc="หน้าหลักเช็คสต๊อก แสดง Summary + Status Card + Quick Actions" />
      </Card>

      <Card>
        <CardTitle icon="🔄">ขั้นตอนเช็คสต๊อกรายวัน</CardTitle>
        <Step num={1} title="นับสต๊อก (Manual Count)">
          <p><RoleTag role="staff" /> <RoleTag role="bar" /> สแกนบาร์โค้ดหรือกรอกจำนวนสินค้าด้วยมือ</p>
        </Step>
        <Step num={2} title="อัปโหลดข้อมูล POS">
          <div>
            <p><RoleTag role="manager" /> อัปโหลดไฟล์ .txt จากระบบ POS</p>
            <ul className="mt-1 ml-5 list-disc space-y-1 text-sm text-gray-500 dark:text-gray-400">
              <li><strong>แจ้งเตือนซ้ำ:</strong> ถ้าวันนี้อัปโหลดแล้ว จะแสดง warning + ต้องยืนยันก่อนบันทึกทับ</li>
              <li><strong>Preview จัดกลุ่ม:</strong> หลังอัปโหลดจะแสดงรายการแบ่งกลุ่ม (สินค้าใหม่ / ตรงกับระบบ / จำนวน=0)</li>
            </ul>
          </div>
        </Step>
        <Step num={3} title="เปรียบเทียบอัตโนมัติ">
          <p>ระบบเทียบ manual count vs POS อัตโนมัติ แสดงผลว่า &quot;ตรง&quot; หรือ &quot;ผิดปกติ&quot;</p>
        </Step>
        <Step num={4} title="ชี้แจง (ถ้ามีส่วนต่าง)">
          <p><RoleTag role="staff" /> เขียนชี้แจงเหตุผลสำหรับรายการที่ไม่ตรง</p>
        </Step>
        <Step num={5} title="อนุมัติ">
          <p><RoleTag role="owner" /> <RoleTag role="manager" /> ตรวจสอบคำชี้แจง แล้ว &quot;อนุมัติ&quot; หรือ &quot;ปฏิเสธ&quot;</p>
        </Step>
        <ImgPlaceholder icon="📋" name="img-30-stock-comparison.png" desc="ผลเปรียบเทียบสต๊อก (Manual vs POS) แสดงรายการตรง/ไม่ตรง" />
      </Card>
    </>
  );
}
