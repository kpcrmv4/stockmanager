import { Card, CardTitle, MenuItem, ImgPlaceholder } from '../manual-ui';

export function SectionHq() {
  return (
    <>
      <Card>
        <CardTitle icon="☰">Sidebar Menu — HQ</CardTitle>
        <MenuItem icon="📊" iconBg="bg-violet-500" name="ภาพรวม" desc="Dashboard" path="/overview" />
        <MenuItem icon="💬" iconBg="bg-blue-500" name="แชท" desc="แชทภายใน" path="/chat" />
        <MenuItem icon="🏢" iconBg="bg-teal-500" name="คลังกลาง" desc="รับ/จัดการสินค้าที่โอนมาจากสาขา" path="/hq-warehouse" />
        <ImgPlaceholder icon="🖥" name="img-21-hq-sidebar.png" desc="Sidebar ของ HQ แสดงเมนูหลัก 3 รายการ" />
      </Card>

      <Card>
        <CardTitle icon="🏢">หน้า HQ Warehouse (หน้าแรก HQ)</CardTitle>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">จัดการคลังสินค้ากลาง:</p>
        <ul className="mb-3 ml-5 list-disc space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          <li><strong>รายการรอรับ</strong> — สินค้าที่สาขาโอนมา รอยืนยันรับ</li>
          <li><strong>สินค้าในคลัง</strong> — ของที่รับแล้ว รอจำหน่ายหรือเบิก</li>
          <li><strong>ประวัติ</strong> — รายการที่ดำเนินการเสร็จแล้ว</li>
          <li><strong>สรุปตามสาขา</strong> — จำนวน pending/received ของแต่ละสาขา</li>
        </ul>
        <ImgPlaceholder icon="🏢" name="img-22-hq-warehouse.png" desc="หน้า HQ Warehouse แสดง Pending Transfers + Branch Summary" />
      </Card>
    </>
  );
}
