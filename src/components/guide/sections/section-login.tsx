import { Card, CardTitle, Step, TipBox, ImgPlaceholder } from '../manual-ui';

export function SectionLogin() {
  return (
    <>
      <Card>
        <CardTitle>เข้าสู่ระบบ</CardTitle>
        <Step num={1} title="เปิดเว็บไซต์ระบบ">
          <p>เข้าเว็บไซต์ StockManager จะแสดงหน้า Login อัตโนมัติ</p>
        </Step>
        <Step num={2} title="กรอก Username และ Password">
          <p>กรอกชื่อผู้ใช้ (username) และรหัสผ่าน จากนั้นกดปุ่ม <strong>&quot;เข้าสู่ระบบ&quot;</strong></p>
        </Step>
        <Step num={3} title="ระบบนำไปหน้าแรกตาม Role">
          <p>เมื่อ Login สำเร็จ ระบบจะพาไปหน้าแรกของ Role อัตโนมัติ (เช่น Owner → /overview, Bar/Staff → /chat)</p>
        </Step>
        <ImgPlaceholder icon="🔒" name="img-04-login-page.png" desc="หน้า Login ของระบบ (Light/Dark Mode)" />
      </Card>

      <Card>
        <CardTitle icon="✉️">ลงทะเบียนพนักงานใหม่ — ผ่านลิงก์เชิญ</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          พนักงานใหม่ <strong>ไม่สามารถสมัครเองได้</strong> — Owner หรือ Manager ต้องสร้างลิงก์เชิญให้ก่อน:
        </p>
        <Step num={1} title="Owner/Manager สร้างลิงก์เชิญ">
          <p>ไปที่ <code>/users/invitations</code> → กด &quot;สร้างลิงก์เชิญ&quot; → เลือกสาขา + ตำแหน่ง → คัดลอกลิงก์</p>
        </Step>
        <Step num={2} title="ส่งลิงก์ให้พนักงาน">
          <p>ส่งลิงก์ผ่าน LINE / SMS / อีเมล ลิงก์มีรูปแบบ <code>/invite/&#123;token&#125;</code></p>
        </Step>
        <Step num={3} title="พนักงานเปิดลิงก์และกรอกข้อมูล">
          <p>หน้าจะแสดง &quot;ตำแหน่ง · สาขา&quot; ที่ถูกเชิญมา → กรอก username, password, ชื่อที่แสดง (ทุกฟิลด์บังคับ) → ลงทะเบียน → เข้าสู่ระบบได้ทันที</p>
        </Step>
        <TipBox>
          <strong>💡 ลิงก์ปิด/เปิดได้:</strong> Owner สามารถกดปุ่มสลับเป็น &quot;ปิด&quot; ที่ <code>/users/invitations</code> เพื่อหยุดการลงทะเบียนเพิ่ม
        </TipBox>
      </Card>

      <Card>
        <CardTitle icon="🔑">ลืมรหัสผ่าน</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          ระบบไม่มีหน้า &quot;ลืมรหัสผ่าน&quot; เพราะไม่ใช้อีเมลจริง — ขอให้ Owner หรือ Manager รีเซ็ตให้:
        </p>
        <Step num={1} title="แจ้ง Owner/Manager">
          <p>บอกว่าจำรหัสไม่ได้ ต้องการรีเซ็ต</p>
        </Step>
        <Step num={2} title="Owner/Manager กดรีเซ็ตที่ /users">
          <p>ระบบตั้งรหัสใหม่เป็น <code className="font-mono">123456</code></p>
        </Step>
        <Step num={3} title="พนักงาน Login ด้วย 123456">
          <p>หลัง Login จะเห็น banner สีเหลือง &quot;รหัสคุณยังเป็นค่าเริ่มต้น&quot; ทุกหน้า</p>
        </Step>
        <Step num={4} title="ตั้งรหัสใหม่ของตัวเอง">
          <p>คลิก banner หรือไปที่ <code>/settings/account</code> → กรอกรหัสปัจจุบัน (123456) + รหัสใหม่ → บันทึก</p>
        </Step>
      </Card>
    </>
  );
}
