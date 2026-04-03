import { Card, CardTitle, CardSubtitle, MenuItem, TipBox, ImgPlaceholder, BottomNavPreview } from '../manual-ui';

export function SectionOwner() {
  return (
    <>
      <Card>
        <CardTitle icon="☰">Sidebar Menu — Owner</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Owner เห็นเมนูทั้งหมดใน Sidebar แบ่งเป็น 5 หมวด:</p>

        <CardSubtitle>📌 หมวด &quot;หลัก&quot;</CardSubtitle>
        <MenuItem icon="📊" iconBg="bg-violet-500" name="ภาพรวม (Overview)" desc="Dashboard แสดง KPI ทุกสาขา, สรุปยอด, กิจกรรมล่าสุด" path="/overview" />
        <MenuItem icon="💬" iconBg="bg-blue-500" name="แชท (Chat)" desc="แชทภายในสาขา, Action Card, สรุปรายวัน" path="/chat" />

        <CardSubtitle>📦 หมวด &quot;คลังสินค้า&quot;</CardSubtitle>
        <MenuItem icon="📋" iconBg="bg-indigo-500" name="เช็คสต๊อก" desc="ดูผลเช็คสต๊อก, อนุมัติคำชี้แจง" path="/stock" />
        <MenuItem icon="🍷" iconBg="bg-emerald-500" name="ฝาก/เบิกเหล้า" desc="จัดการฝากเหล้า, เบิก, ดูสถานะทั้งหมด" path="/deposit" />
        <MenuItem icon="↔" iconBg="bg-blue-500" name="โอนสต๊อก" desc="โอนสินค้าระหว่างสาขา/คลังกลาง" path="/transfer" />
        <MenuItem icon="🔄" iconBg="bg-rose-500" name="ยืมสินค้า" desc="ยืมสินค้าระหว่างสาขา" path="/borrow" />
        <MenuItem icon="🏢" iconBg="bg-teal-500" name="คลังกลาง" desc="จัดการคลังสินค้ากลาง" path="/hq-warehouse" />
        <MenuItem icon="💰" iconBg="bg-amber-500" name="ค่าคอมมิชชั่น" desc="AE Commission & Bottle Commission — บันทึก สรุป ทำจ่าย" path="/commission" />

        <CardSubtitle>📈 หมวด &quot;รายงาน&quot;</CardSubtitle>
        <MenuItem icon="📊" iconBg="bg-amber-500" name="รายงาน" desc="รายงานสรุปข้อมูลฝาก/เบิก/สต๊อก" path="/reports" />
        <MenuItem icon="🔍" iconBg="bg-cyan-500" name="ตรวจสอบกิจกรรม" desc="Audit Log ดูประวัติการเปลี่ยนแปลงทั้งหมด" path="/activity" />

        <CardSubtitle>📈 หมวด &quot;วิเคราะห์&quot; (เฉพาะ Owner)</CardSubtitle>
        <MenuItem icon="🏆" iconBg="bg-amber-500" name="ประสิทธิภาพพนักงาน" desc="Ranking, กราฟ trend, เปรียบเทียบ" path="/performance/staff" />
        <MenuItem icon="⚖" iconBg="bg-indigo-500" name="เปรียบเทียบสาขา" desc="KPI ข้ามสาขา, Radar Chart" path="/performance/stores" />
        <MenuItem icon="⚡" iconBg="bg-rose-500" name="สถานะงาน Real-time" desc="งานค้าง, workload, alert" path="/performance/operations" />
        <MenuItem icon="📈" iconBg="bg-emerald-500" name="วิเคราะห์ลูกค้า" desc="Top customers, พฤติกรรม, retention" path="/performance/customers" />

        <CardSubtitle>⚙ หมวด &quot;ระบบ&quot;</CardSubtitle>
        <MenuItem icon="📣" iconBg="bg-pink-500" name="ประกาศ/โปรโมชั่น" desc="สร้างประกาศถึงลูกค้าและพนักงาน" path="/announcements" />
        <MenuItem icon="👤" iconBg="bg-orange-500" name="จัดการผู้ใช้" desc="เพิ่ม/แก้ไข/ปิดการใช้งานผู้ใช้, กำหนด Role" path="/users" />
        <MenuItem icon="⚙" iconBg="bg-gray-500" name="ตั้งค่า" desc="ตั้งค่าสาขา, LINE, การแจ้งเตือน" path="/settings" />

        <ImgPlaceholder icon="🖥" name="img-05-owner-sidebar.png" desc="Sidebar ของ Owner แสดงเมนูทั้งหมด 5 หมวด" />
      </Card>

      <Card>
        <CardTitle icon="📱">Bottom Navigation — Owner (Mobile View)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">เมื่อ Owner ใช้งานบนมือถือ จะเห็น Bottom Nav 5 ปุ่ม:</p>
        <BottomNavPreview
          items={[
            { icon: '📋', label: 'สต๊อก', color: 'indigo' },
            { icon: '🍷', label: 'ฝาก/เบิก', color: 'emerald' },
            { icon: '📊', label: 'ภาพรวม', color: 'bg-violet-500', center: true },
            { icon: '💬', label: 'แชท', color: 'blue' },
            { icon: '📖', label: 'คู่มือ', color: 'cyan' },
          ]}
        />
        <TipBox>
          <strong>💡 หมายเหตุ:</strong> แจ้งเตือนเข้าถึงได้จาก Top Bar (ไอคอนกระดิ่ง) — ปุ่ม &quot;คู่มือ&quot; ถูกเพิ่มใน Bottom Nav แทน
        </TipBox>
        <ImgPlaceholder icon="📱" name="img-06-owner-bottom-nav.png" desc="Bottom Navigation ของ Owner บนมือถือ (ปุ่มกลางนูน = ภาพรวม)" />
      </Card>

      <Card>
        <CardTitle icon="📊">หน้า Overview (หน้าแรก Owner)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">Dashboard ภาพรวมแสดง:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>Summary Cards</strong> — จำนวนสาขา, ยอดฝากรวม, งานรออนุมัติ, แจ้งเตือนสต๊อก พร้อม Trend %</li>
          <li><strong>สถานะแต่ละสาขา</strong> — การ์ดแยกแต่ละสาขาแสดงงานค้าง/ปัญหา เรียงสาขาที่มีปัญหามากสุดไว้บนสุด</li>
          <li><strong>การ์ด HQ (คลังกลาง)</strong> — แสดงเฉพาะ &quot;รอรับโอนจากสาขา&quot;</li>
          <li><strong>Module Cards</strong> — ทางลัดไปยังระบบหลัก</li>
          <li><strong>Recent Activity</strong> — กิจกรรมล่าสุดของระบบ</li>
        </ul>
        <ImgPlaceholder icon="📊" name="img-07-owner-overview.png" desc="หน้า Overview ของ Owner แสดง KPI Cards + Trend + Module Shortcuts" />
      </Card>

      <Card>
        <CardTitle icon="👤">จัดการผู้ใช้ (Users)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">Owner สามารถ:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li>ดูรายชื่อผู้ใช้ทั้งหมดพร้อม Role</li>
          <li>เพิ่มผู้ใช้ใหม่ กำหนด Role และสาขา</li>
          <li>เปิด/ปิดการใช้งานผู้ใช้</li>
          <li>เปลี่ยน Role ของผู้ใช้</li>
          <li>กำหนดสาขาที่ผู้ใช้สามารถเข้าถึง</li>
        </ul>
        <ImgPlaceholder icon="👤" name="img-08-user-management.png" desc="หน้าจัดการผู้ใช้ แสดงตาราง Users พร้อม Role Badge" />
      </Card>

      <Card>
        <CardTitle icon="🏆">Performance Analytics (เฉพาะ Owner)</CardTitle>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">ระบบวิเคราะห์ประสิทธิภาพเชิงลึก 4 มุมมอง:</p>

        <CardSubtitle>1. ประสิทธิภาพพนักงาน</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Ranking พนักงาน: งานสำเร็จ, เวลาเฉลี่ย, อัตรา timeout</li>
          <li>กราฟ daily trend ต่อคน</li>
          <li>Drill-down ดูรายละเอียดแต่ละคน</li>
        </ul>
        <ImgPlaceholder icon="🏆" name="img-09-performance-staff.png" desc="Dashboard ประสิทธิภาพพนักงาน แสดง Ranking + Trend Chart" />

        <CardSubtitle>2. เปรียบเทียบสาขา</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Side-by-side KPI ทุกสาขา</li>
          <li>Radar Chart เปรียบเทียบหลายมิติ</li>
          <li>Ranking สาขาตาม KPI</li>
        </ul>
        <ImgPlaceholder icon="⚖" name="img-10-performance-stores.png" desc="เปรียบเทียบสาขา แสดง Radar Chart + KPI Cards" />

        <CardSubtitle>3. สถานะงาน Real-time</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Live view: งานค้าง/กำลังทำ/เกินเวลา</li>
          <li>ใครกำลังทำอะไร</li>
          <li>Alert เมื่องานค้างนานผิดปกติ</li>
        </ul>
        <ImgPlaceholder icon="⚡" name="img-11-performance-operations.png" desc="Real-time Operations แสดง Active Tasks + Workload Distribution" />

        <CardSubtitle>4. วิเคราะห์ลูกค้า</CardSubtitle>
        <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-gray-600 dark:text-gray-300">
          <li>Top customers by ความถี่และมูลค่า</li>
          <li>พฤติกรรมฝาก/เบิก</li>
          <li>Customer retention &amp; expiry rates</li>
        </ul>
        <ImgPlaceholder icon="📈" name="img-12-performance-customers.png" desc="Customer Analytics แสดง Top Customers + Behavior Charts" />
      </Card>
    </>
  );
}
