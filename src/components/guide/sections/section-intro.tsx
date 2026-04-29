import { Card, CardTitle, ImgPlaceholder, CardSubtitle } from '../manual-ui';

export function SectionIntro() {
  return (
    <>
      <Card>
        <CardTitle>StockManager คืออะไร?</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          StockManager เป็นระบบจัดการคลังสินค้าและฝากเหล้าครบวงจร สำหรับร้านอาหาร/บาร์ที่มีหลายสาขา รองรับการทำงานตั้งแต่:
        </p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>ฝาก/เบิกเหล้า</strong> — จัดการขวดเหล้าที่ลูกค้าฝากไว้ พร้อมวันหมดอายุ</li>
          <li><strong>เช็คสต๊อก</strong> — นับสต๊อกรายวัน เทียบกับข้อมูล POS อัตโนมัติ</li>
          <li><strong>แชทภายใน</strong> — สื่อสารภายในทีมพร้อม Action Card สำหรับรับงาน</li>
          <li><strong>โอน/ยืมสินค้า</strong> — โอนสต๊อกระหว่างสาขาและยืมสินค้า</li>
          <li><strong>วิเคราะห์ประสิทธิภาพ</strong> — Dashboard วัดผลพนักงาน ลูกค้า สาขา</li>
          <li><strong>แจ้งเตือนอัตโนมัติ</strong> — ผ่าน LINE และ Web Push Notification</li>
        </ul>
        <ImgPlaceholder icon="📷" name="img-01-system-overview.png" desc="ภาพรวมระบบ StockManager แสดง Dashboard หลัก" />
      </Card>

      <Card>
        <CardTitle>หน้าจอของระบบ</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ระบบมี 2 รูปแบบการแสดงผลตามตำแหน่งงาน:</p>

        <CardSubtitle>🖥 หน้าจอคอมพิวเตอร์ (Owner, Accountant, Manager, HQ)</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>แถบเมนูด้านซ้าย</strong> — เมนูหลักแบ่งเป็นหมวดหมู่ ยุบ/ขยายได้</li>
          <li><strong>แถบด้านบน</strong> — ตัวเลือกสาขา, แจ้งเตือน, สถานะเครื่องพิมพ์, โปรไฟล์</li>
          <li><strong>พื้นที่หลัก</strong> — เนื้อหาหน้าจอตรงกลาง</li>
        </ul>
        <ImgPlaceholder icon="🖥" name="img-02-desktop-layout.png" desc="หน้าจอคอมพิวเตอร์ แสดงแถบเมนูซ้าย + แถบด้านบน + พื้นที่หลัก" />

        <CardSubtitle>📱 หน้าจอมือถือ (Staff, Bar)</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>แถบด้านบน</strong> — ชื่อหน้า + ปุ่มเมนู ☰ (ขีด 3 ขีดมุมซ้ายบน)</li>
          <li><strong>เมนูสไลด์</strong> — กดปุ่ม ☰ เพื่อเปิดเมนูจากซ้าย (ออกจากระบบ, สลับโหมด, ฯลฯ)</li>
          <li><strong>เมนูด้านล่าง</strong> — ปุ่มลัด 3-5 ปุ่ม ปุ่มกลางนูนขึ้น</li>
        </ul>
        <ImgPlaceholder icon="📱" name="img-03-mobile-layout.png" desc="หน้าจอมือถือ แสดงแถบด้านบน + เมนูด้านล่าง" />
      </Card>
    </>
  );
}
