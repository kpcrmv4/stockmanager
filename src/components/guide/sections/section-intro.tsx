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
        <CardTitle>Layout ของระบบ</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ระบบมี 2 รูปแบบการแสดงผลตามบทบาท:</p>

        <CardSubtitle>🖥 Desktop Layout (Owner, Accountant, Manager, HQ)</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Sidebar ด้านซ้าย</strong> — เมนูหลักแบ่งเป็นหมวดหมู่ ยุบ/ขยายได้</li>
          <li><strong>Top Bar ด้านบน</strong> — ตัวเลือกสาขา, แจ้งเตือน, โปรไฟล์</li>
          <li><strong>พื้นที่หลัก</strong> — เนื้อหาหน้าจอหลัก</li>
        </ul>
        <ImgPlaceholder icon="🖥" name="img-02-desktop-layout.png" desc="Desktop Layout แสดง Sidebar + Top Bar + Main Content" />

        <CardSubtitle>📱 Mobile Layout (Staff, Bar)</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Top Bar</strong> — ชื่อหน้า + ปุ่ม Hamburger Menu</li>
          <li><strong>Drawer Menu</strong> — เลื่อนออกจากด้านซ้าย (กดปุ่ม ☰)</li>
          <li><strong>Bottom Navigation</strong> — 5 ปุ่มด้านล่าง ปุ่มกลางนูนขึ้น</li>
        </ul>
        <ImgPlaceholder icon="📱" name="img-03-mobile-layout.png" desc="Mobile Layout แสดง Top Bar + Bottom Navigation 5 ปุ่ม" />
      </Card>
    </>
  );
}
