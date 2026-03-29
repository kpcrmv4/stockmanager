import { Card, CardTitle, Step, ImgPlaceholder } from '../manual-ui';

export function SectionLogin() {
  return (
    <>
      <Card>
        <CardTitle>Login สำหรับพนักงาน</CardTitle>
        <Step num={1} title="เปิดเว็บไซต์ระบบ">
          <p>เข้าเว็บไซต์ StockManager จะแสดงหน้า Login อัตโนมัติ</p>
        </Step>
        <Step num={2} title="กรอก Username และ Password">
          <p>กรอกชื่อผู้ใช้ (username) และรหัสผ่าน จากนั้นกดปุ่ม <strong>&quot;เข้าสู่ระบบ&quot;</strong></p>
        </Step>
        <Step num={3} title="ระบบนำไปหน้าแรกตาม Role">
          <p>เมื่อ Login สำเร็จ ระบบจะพาไปยังหน้าแรกของ Role ตัวเองอัตโนมัติ</p>
        </Step>
        <ImgPlaceholder icon="🔒" name="img-04-login-page.png" desc="หน้า Login ของระบบ (Light/Dark Mode)" />
      </Card>

      <Card>
        <CardTitle>Login สำหรับลูกค้า (Customer)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ลูกค้าไม่ต้อง Login ด้วย username/password แต่เข้าผ่าน:</p>
        <ul className="ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>LINE LIFF</strong> — กดลิงก์จาก LINE Official Account ระบบจะยืนยันตัวตนอัตโนมัติ</li>
          <li><strong>Token URL</strong> — ได้รับ Link พิเศษจากพนักงาน</li>
        </ul>
      </Card>
    </>
  );
}
